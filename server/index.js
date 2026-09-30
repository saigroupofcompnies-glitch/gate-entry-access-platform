const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const { openDb } = require("./db");
const { verifyToken, verifyPassword, sessionToken, signPayload, hashPassword } = require("./token");
const { averageHashFromDataUrl, hamming, scoreFromDistance, classify } = require("./face-hash");

const app = express();
let db;
const PORT = process.env.PORT || 4170;

app.use(cors());
app.use(express.json({ limit: "32mb" }));

function cfg(key, fallback) {
  const row = db.prepare("SELECT value FROM system_configurations WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const raw = header.startsWith("Bearer ") ? header.slice(7) : req.query.token;
  if (!raw) return res.status(401).json({ error: "UNAUTHENTICATED" });
  const v = verifyToken(raw);
  if (!v.ok || v.payload.typ !== "session") return res.status(401).json({ error: "INVALID_SESSION" });
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'ACTIVE'").get(v.payload.userId);
  if (!user) return res.status(401).json({ error: "USER_INACTIVE" });
  req.user = user;
  next();
}

function scopedCentre(req) {
  if (["CENTRE_HEAD", "CENTRE_OPERATOR", "SECURITY_OPERATOR", "BIOMETRIC_OPERATOR"].includes(req.user.role)) {
    return req.user.centre_id || null;
  }
  return req.query.centreId || null;
}

function allowedExamIds(user) {
  if (!user) return [];
  if (user.role === "SUPER_ADMIN") return db.prepare("SELECT id FROM exams").all().map((e) => e.id);
  if (user.role === "CLIENT" || user.role === "DEPARTMENT_OFFICER") {
    const rows = db.prepare("SELECT exam_id AS id FROM exam_clients WHERE user_id = ?").all(user.id);
    if (rows.length) return rows.map((r) => r.id);
    return db.prepare("SELECT id FROM exams").all().map((e) => e.id);
  }
  if (user.centre_id) {
    return db.prepare("SELECT exam_id AS id FROM exam_centres WHERE centre_id = ?").all(user.centre_id).map((r) => r.id);
  }
  return db.prepare("SELECT id FROM exams").all().map((e) => e.id);
}

function resolveExam(req) {
  const q = req.query.examId || req.body?.examId;
  if (q) {
    const row = db.prepare("SELECT * FROM exams WHERE id = ? OR UPPER(slug)=UPPER(?) OR UPPER(code)=UPPER(?)").get(q, q, q);
    if (row) return row;
  }
  const ids = allowedExamIds(req.user);
  if (ids[0]) return db.prepare("SELECT * FROM exams WHERE id = ?").get(ids[0]);
  return db.prepare("SELECT * FROM exams ORDER BY exam_date DESC LIMIT 1").get();
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "FORBIDDEN" });
    next();
  };
}

function presenceOf(otrId, examId) {
  const centre = db
    .prepare(
      `SELECT * FROM access_events
       WHERE subject_id = ? AND exam_id = ? AND event_kind = 'CENTRE_ENTRY' AND result = 'GRANTED'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(otrId, examId);
  const room = db
    .prepare(
      `SELECT * FROM access_events
       WHERE subject_id = ? AND exam_id = ? AND event_kind = 'CLASSROOM_PRESENCE' AND result = 'GRANTED'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(otrId, examId);
  let state = "EXAM_REGISTERED";
  if (room) state = "CLASSROOM_PRESENT";
  else if (centre) state = "CENTRE_ENTRY_VERIFIED";
  return { state, centre, room };
}

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(String(username || "").toLowerCase());
  if (!user || !verifyPassword(String(password || ""), user.password_hash)) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }
  const token = sessionToken(user.id, user.role);
  db.emitAudit({ event_type: "Login", entity_id: user.id, actor_id: user.id, actor_role: user.role, result: "OK" });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      centreId: user.centre_id,
      labId: user.lab_id,
      gateId: user.gate_id,
    },
  });
});

app.post("/api/auth/candidate-otp", (req, res) => {
  const { mobile, otp } = req.body || {};
  if (String(otp) !== cfg("otp.demo", "123456")) return res.status(401).json({ error: "INVALID_OTP" });
  const c = db.prepare("SELECT * FROM candidates WHERE mobile = ?").get(String(mobile));
  if (!c) return res.status(404).json({ error: "CANDIDATE_NOT_FOUND" });
  let user = db.prepare("SELECT * FROM users WHERE username = ?").get(`c:${c.mobile}`);
  if (!user) {
    const id = db.newId("USR");
    db.prepare(
      `INSERT INTO users (id, username, password_hash, display_name, role) VALUES (?,?,?,?,?)`
    ).run(id, `c:${c.mobile}`, hashPassword("otp"), c.full_name, "CANDIDATE");
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  }
  const token = sessionToken(user.id, "CANDIDATE");
  res.json({ token, user: { id: user.id, role: "CANDIDATE", otrId: c.otr_id, displayName: c.full_name, mobile: c.mobile } });
});

app.get("/api/auth/me", auth, (req, res) => {
  const extra = {};
  if (req.user.role === "CANDIDATE") {
    const c = db.prepare("SELECT * FROM candidates WHERE mobile = ?").get(String(req.user.username).replace(/^c:/, ""));
    extra.otrId = c?.otr_id;
  }
  res.json({
    id: req.user.id,
    username: req.user.username,
    displayName: req.user.display_name,
    role: req.user.role,
    centreId: req.user.centre_id,
    labId: req.user.lab_id,
    gateId: req.user.gate_id,
    ...extra,
  });
});

function demoOtpOk(otp) {
  return String(otp) === String(cfg("otp.demo", "123456"));
}

function loadOtrBundle(otrId) {
  const c = db.prepare("SELECT * FROM candidates WHERE otr_id = ?").get(otrId);
  if (!c) return null;
  const p = db.prepare("SELECT * FROM candidate_profiles WHERE otr_id = ?").get(otrId);
  const documents = db.prepare("SELECT id, doc_type, status, file_name FROM candidate_documents WHERE otr_id = ?").all(otrId);
  const fingerprints = db.prepare("SELECT hand, finger FROM candidate_fingerprints WHERE otr_id = ?").all(otrId);
  return { ...c, profile: p, documents, fingerprints };
}

app.post("/api/candidates/register", (req, res) => {
  const { mobile, email, fullName, dob, gender, photoData, consent } = req.body || {};
  if (!/^\d{10}$/.test(String(mobile || ""))) return res.status(400).json({ error: "INVALID_MOBILE" });
  if (!fullName) return res.status(400).json({ error: "NAME_REQUIRED" });
  if (!consent) return res.status(400).json({ error: "CONSENT_REQUIRED" });
  const exists = db.prepare("SELECT * FROM candidates WHERE mobile = ?").get(String(mobile));
  if (exists) {
    return res.status(409).json({
      error: "DUPLICATE_MOBILE",
      otrId: exists.otr_id,
      identityStatus: exists.identity_status,
      next: exists.identity_status === "OTR_COMPLETE" ? "DONE" : "PROFILE",
    });
  }
  const otrId = "OTR" + String(10000 + Math.floor(Math.random() * 89999));
  db.prepare(
    `INSERT INTO candidates (otr_id, mobile, email, full_name, identity_status) VALUES (?,?,?,?,?)`
  ).run(otrId, String(mobile), email || null, fullName, "OTR_BASIC");
  const faceHash = averageHashFromDataUrl(photoData);
  db.prepare(
    `INSERT INTO candidate_profiles (otr_id, dob, gender, photo_data, face_hash, kyc_complete) VALUES (?,?,?,?,?,0)`
  ).run(otrId, dob || null, gender || null, photoData || null, faceHash);
  db.emitAudit({ event_type: "CandidateRegistered", entity_id: otrId, result: "OTR_BASIC" });
  res.json({ otrId, identityStatus: "OTR_BASIC", next: "PROFILE" });
});

app.post("/api/candidates/otr-login", (req, res) => {
  const { mobile, otp } = req.body || {};
  if (!demoOtpOk(otp)) return res.status(401).json({ error: "INVALID_OTP" });
  const c = db.prepare("SELECT * FROM candidates WHERE mobile = ?").get(String(mobile));
  if (!c) return res.status(404).json({ error: "OTR_NOT_FOUND" });
  res.json(loadOtrBundle(c.otr_id));
});

app.post("/api/candidates/:otrId/complete", (req, res) => {
  const { mobile, otp, profile, documents, fingerprints } = req.body || {};
  if (!demoOtpOk(otp)) return res.status(401).json({ error: "INVALID_OTP" });
  const cand = db.prepare("SELECT * FROM candidates WHERE otr_id = ? AND mobile = ?").get(req.params.otrId, String(mobile));
  if (!cand) return res.status(404).json({ error: "OTR_NOT_FOUND" });
  const p = profile || {};
  const required = ["fatherName", "motherName", "bloodGroup", "addressLine1", "city", "state", "pincode", "category", "nationality"];
  for (const k of required) {
    if (!String(p[k] || "").trim()) return res.status(400).json({ error: "PROFILE_INCOMPLETE", field: k });
  }
  const docs = Array.isArray(documents) ? documents : [];
  const requiredDocs = ["PHOTO", "SIGNATURE", "AADHAAR", "ID_PROOF"];
  for (const t of requiredDocs) {
    if (!docs.find((d) => d.docType === t && d.fileData)) return res.status(400).json({ error: "DOCUMENT_REQUIRED", field: t });
  }
  const fps = Array.isArray(fingerprints) ? fingerprints : [];
  const needFingers = [
    ["LEFT", "THUMB"], ["LEFT", "INDEX"], ["LEFT", "MIDDLE"], ["LEFT", "RING"], ["LEFT", "LITTLE"],
    ["RIGHT", "THUMB"], ["RIGHT", "INDEX"], ["RIGHT", "MIDDLE"], ["RIGHT", "RING"], ["RIGHT", "LITTLE"],
  ];
  for (const [hand, finger] of needFingers) {
    if (!fps.find((f) => f.hand === hand && f.finger === finger && f.imageData)) {
      return res.status(400).json({ error: "FINGERPRINT_REQUIRED", field: `${hand}_${finger}` });
    }
  }
  const address = [p.addressLine1, p.addressLine2, p.city, p.district, p.state, p.pincode].filter(Boolean).join(", ");
  db.prepare(
    `UPDATE candidate_profiles SET
      father_name=?, mother_name=?, guardian_name=?, nationality=?, category=?, religion=?, marital_status=?,
      blood_group=?, id_mark=?, disability=?, aadhaar=?, pan=?, voter_id=?, passport_no=?,
      address_line1=?, address_line2=?, city=?, district=?, state=?, pincode=?, perm_address=?,
      address=?, signature_data=?, kyc_complete=1
     WHERE otr_id=?`
  ).run(
    p.fatherName, p.motherName || null, p.guardianName || null, p.nationality, p.category, p.religion || null,
    p.maritalStatus || null, p.bloodGroup, p.idMark || null, p.disability || "NONE",
    p.aadhaar || null, p.pan || null, p.voterId || null, p.passportNo || null,
    p.addressLine1, p.addressLine2 || null, p.city, p.district || null, p.state, p.pincode,
    p.permAddress || address, address, p.signatureData || null, cand.otr_id
  );
  db.prepare("DELETE FROM candidate_documents WHERE otr_id = ?").run(cand.otr_id);
  for (const d of docs) {
    db.prepare(
      `INSERT INTO candidate_documents (id, otr_id, doc_type, status, note, file_data, file_name) VALUES (?,?,?,?,?,?,?)`
    ).run(db.newId("DOC"), cand.otr_id, d.docType, "SUBMITTED", d.note || null, d.fileData, d.fileName || null);
  }
  db.prepare("DELETE FROM candidate_fingerprints WHERE otr_id = ?").run(cand.otr_id);
  for (const f of fps) {
    db.prepare(
      `INSERT INTO candidate_fingerprints (id, otr_id, hand, finger, image_data) VALUES (?,?,?,?,?)`
    ).run(db.newId("FP"), cand.otr_id, f.hand, f.finger, f.imageData);
  }
  db.prepare("UPDATE candidates SET identity_status = 'OTR_COMPLETE' WHERE otr_id = ?").run(cand.otr_id);
  if (p.email) db.prepare("UPDATE candidates SET email = ? WHERE otr_id = ?").run(p.email, cand.otr_id);
  db.emitAudit({ event_type: "OtrKycCompleted", entity_id: cand.otr_id, result: "OTR_COMPLETE" });
  res.json({ otrId: cand.otr_id, identityStatus: "OTR_COMPLETE" });
});

app.get("/api/candidates/:otrId", auth, (req, res) => {
  const bundle = loadOtrBundle(req.params.otrId);
  if (!bundle) return res.status(404).json({ error: "NOT_FOUND" });
  const apps = db.prepare("SELECT * FROM applications WHERE otr_id = ?").all(req.params.otrId);
  res.json({ ...bundle, applications: apps });
});

app.get("/api/exams", (req, res) => {
  if (req.query.all === "1") {
    return res.json(db.prepare("SELECT * FROM exams ORDER BY exam_date").all());
  }
  res.json(db.prepare("SELECT * FROM exams WHERE lifecycle IN ('OPEN','LIVE') AND status = 'ACTIVE' ORDER BY exam_date").all());
});

app.get("/api/exams/public/:slug", (req, res) => {
  const exam = db.prepare("SELECT * FROM exams WHERE UPPER(slug) = UPPER(?) OR UPPER(code) = UPPER(?)").get(req.params.slug, req.params.slug);
  if (!exam) return res.status(404).json({ error: "EXAM_NOT_FOUND" });
  const centres = db.prepare(
    `SELECT c.* FROM centres c JOIN exam_centres ec ON ec.centre_id = c.id WHERE ec.exam_id = ?`
  ).all(exam.id);
  res.json({ ...exam, centres, registerPath: `/DIGITAL-EXAM/${exam.slug}` });
});

app.get("/api/centres/public", (_req, res) => {
  res.json(db.prepare("SELECT id, name, city, state FROM centres WHERE status = 'ACTIVE'").all());
});

app.post("/api/exams/:id/applications", auth, (req, res) => {
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(req.params.id);
  if (!exam) return res.status(404).json({ error: "EXAM_NOT_FOUND" });
  let otrId = req.body.otrId;
  if (req.user.role === "CANDIDATE") {
    const c = db.prepare("SELECT * FROM candidates WHERE mobile = ?").get(String(req.user.username).replace(/^c:/, ""));
    otrId = c.otr_id;
  }
  const cand = db.prepare("SELECT * FROM candidates WHERE otr_id = ?").get(otrId);
  if (!cand || !["OTR_COMPLETE", "OTR_ACTIVE"].includes(cand.identity_status)) {
    return res.status(400).json({ error: "OTR_NOT_COMPLETE" });
  }
  if (!["OPEN", "LIVE"].includes(exam.lifecycle || "OPEN")) return res.status(400).json({ error: "REGISTRATION_CLOSED" });
  const dup = db.prepare("SELECT id FROM applications WHERE otr_id = ? AND exam_id = ?").get(otrId, exam.id);
  if (dup) return res.status(409).json({ error: "ALREADY_APPLIED", applicationId: dup.id });
  const centreId = req.body.centreId || db.prepare("SELECT centre_id FROM exam_centres WHERE exam_id = ?").get(exam.id)?.centre_id;
  const shift = db.prepare("SELECT id FROM exam_shifts WHERE exam_id = ? LIMIT 1").get(exam.id);
  const id = db.newId("APP");
  db.prepare(
    `INSERT INTO applications (id, otr_id, exam_id, shift_id, centre_id, status) VALUES (?,?,?,?,?,?)`
  ).run(id, otrId, exam.id, shift?.id || null, centreId || null, "CENTRE_AUTHORIZED");
  db.emitAudit({ event_type: "ExamApplied", entity_id: id, actor_id: req.user.id, actor_role: req.user.role, result: "OK" });
  res.json({ applicationId: id, status: "CENTRE_AUTHORIZED" });
});

app.post("/api/exams/:id/apply-public", (req, res) => {
  const { mobile, otp, centreId } = req.body || {};
  if (String(otp) !== cfg("otp.demo", "123456")) return res.status(401).json({ error: "INVALID_OTP" });
  const cand = db.prepare("SELECT * FROM candidates WHERE mobile = ?").get(String(mobile));
  if (!cand) return res.status(404).json({ error: "COMPLETE_OTR_FIRST" });
  req.user = { id: "PUBLIC", role: "CANDIDATE", username: "c:" + cand.mobile };
  req.body.otrId = cand.otr_id;
  req.body.centreId = centreId;
  req.url = `/api/exams/${req.params.id}/applications`;
  // inline apply
  const exam = db.prepare("SELECT * FROM exams WHERE id = ? OR UPPER(slug)=UPPER(?)").get(req.params.id, req.params.id);
  if (!exam) return res.status(404).json({ error: "EXAM_NOT_FOUND" });
  if (!["OPEN", "LIVE"].includes(exam.lifecycle || "OPEN")) return res.status(400).json({ error: "REGISTRATION_CLOSED" });
  const dup = db.prepare("SELECT id FROM applications WHERE otr_id = ? AND exam_id = ?").get(cand.otr_id, exam.id);
  if (dup) {
    const pass = db.prepare("SELECT * FROM boarding_passes WHERE application_id = ?").get(dup.id);
    return res.json({ applicationId: dup.id, status: "ALREADY_APPLIED", boardingPassId: pass?.id, token: pass?.token });
  }
  const centre = centreId || db.prepare("SELECT centre_id FROM exam_centres WHERE exam_id = ?").get(exam.id)?.centre_id;
  const shift = db.prepare("SELECT id FROM exam_shifts WHERE exam_id = ? LIMIT 1").get(exam.id);
  const id = db.newId("APP");
  db.prepare(
    `INSERT INTO applications (id, otr_id, exam_id, shift_id, centre_id, status) VALUES (?,?,?,?,?,?)`
  ).run(id, cand.otr_id, exam.id, shift?.id || null, centre || null, "CENTRE_AUTHORIZED");
  const payload = {
    typ: "CANDIDATE_BP",
    passId: db.newId("BP"),
    applicationId: id,
    otrId: cand.otr_id,
    examId: exam.id,
    centreId: centre,
    date: exam.exam_date,
  };
  payload.passId = db.newId("BP");
  const token = signPayload(payload);
  db.prepare(
    `INSERT INTO boarding_passes (id, kind, application_id, token, status, qr_payload) VALUES (?,?,?,?,?,?)`
  ).run(payload.passId, "CANDIDATE", id, token, "ACTIVE", token);
  db.emitAudit({ event_type: "ExamApplied", entity_id: id, result: "OK", payload: { slug: exam.slug } });
  res.json({ applicationId: id, otrId: cand.otr_id, token, boardingPassId: payload.passId, exam: exam.slug });
});

app.post("/api/boarding-passes/generate", auth, (req, res) => {
  const { applicationId } = req.body || {};
  const appRow = db.prepare("SELECT * FROM applications WHERE id = ?").get(applicationId);
  if (!appRow) return res.status(404).json({ error: "APPLICATION_NOT_FOUND" });
  const existing = db.prepare("SELECT * FROM boarding_passes WHERE application_id = ? AND status = 'ACTIVE'").get(applicationId);
  if (existing) return res.json(existing);
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(appRow.exam_id);
  const passId = db.newId("BP");
  const payload = {
    typ: "CANDIDATE_BP",
    passId,
    applicationId,
    otrId: appRow.otr_id,
    examId: appRow.exam_id,
    centreId: appRow.centre_id,
    date: exam.exam_date,
  };
  const token = signPayload(payload);
  db.prepare(
    `INSERT INTO boarding_passes (id, kind, application_id, token, status, qr_payload) VALUES (?,?,?,?,?,?)`
  ).run(passId, "CANDIDATE", applicationId, token, "ACTIVE", token);
  db.emitAudit({ event_type: "BoardingPassGenerated", entity_id: passId, actor_id: req.user.id, actor_role: req.user.role });
  res.json({ id: passId, token, status: "ACTIVE" });
});

app.get("/api/boarding-passes/:id/qr", auth, async (req, res) => {
  const pass = db.prepare("SELECT * FROM boarding_passes WHERE id = ?").get(req.params.id);
  if (!pass) return res.status(404).json({ error: "NOT_FOUND" });
  const png = await QRCode.toDataURL(pass.token, { width: 280, margin: 1 });
  res.json({ ...pass, qrDataUrl: png });
});

app.get("/api/candidates/:otrId/passes", auth, async (req, res) => {
  const rows = db.prepare(
    `SELECT bp.*, a.exam_id, a.centre_id, a.status AS app_status, e.name AS exam_name, e.exam_date, e.reporting_time
     FROM boarding_passes bp
     JOIN applications a ON a.id = bp.application_id
     JOIN exams e ON e.id = a.exam_id
     WHERE a.otr_id = ?`
  ).all(req.params.otrId);
  const out = [];
  for (const r of rows) {
    out.push({ ...r, qrDataUrl: await QRCode.toDataURL(r.token, { width: 240, margin: 1 }) });
  }
  res.json(out);
});

app.post("/api/staff/register", (req, res) => {
  const body = req.body || {};
  const { fullName, mobile, email, roleApplied, centreId, photoData, kind } = body;
  if (!fullName || !/^\d{10}$/.test(String(mobile || ""))) return res.status(400).json({ error: "INVALID_STAFF" });
  if (!body.fatherName || !body.dob || !body.aadhaar || !body.addressLine1) {
    return res.status(400).json({ error: "STAFF_DETAILS_INCOMPLETE" });
  }
  const id = db.newId("STF");
  const staffKind = kind === "INCHARGE" ? "INCHARGE" : "STAFF";
  const role = staffKind === "INCHARGE" ? "CENTRE_INCHARGE" : (roleApplied || "INVIGILATOR");
  const profile = {
    fatherName: body.fatherName,
    motherName: body.motherName,
    dob: body.dob,
    gender: body.gender,
    bloodGroup: body.bloodGroup,
    aadhaar: body.aadhaar,
    pan: body.pan,
    designation: body.designation,
    qualification: body.qualification,
    experienceYears: body.experienceYears,
    employeeCode: body.employeeCode,
    department: body.department,
    addressLine1: body.addressLine1,
    city: body.city,
    state: body.state,
    pincode: body.pincode,
    emergencyName: body.emergencyName,
    emergencyMobile: body.emergencyMobile,
    idProofName: body.idProofName,
    signatureName: body.signatureName,
  };
  db.prepare(
    `INSERT INTO staff (id, full_name, mobile, email, role_applied, centre_id, photo_data, face_hash, status, kind, profile_json, father_name, dob, gender, aadhaar, designation)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id, fullName, mobile, email || null, role, centreId || "CTR-DEL-01",
    photoData || null, averageHashFromDataUrl(photoData), "PENDING", staffKind,
    JSON.stringify(profile), body.fatherName, body.dob, body.gender || null, body.aadhaar, body.designation || role
  );
  if (body.idProofData) {
    db.prepare(
      `INSERT INTO candidate_documents (id, otr_id, doc_type, status, note, file_data, file_name) VALUES (?,?,?,?,?,?,?)`
    ).run(db.newId("SDOC"), id, "STAFF_ID_PROOF", "SUBMITTED", "staff", body.idProofData, body.idProofName || null);
  }
  db.emitAudit({ event_type: "StaffRegistered", entity_id: id, result: "PENDING", payload: { kind: staffKind } });
  res.json({
    staffId: id,
    status: "PENDING",
    message: staffKind === "INCHARGE" ? "Waiting for Main Admin approval" : "Waiting for Centre Incharge approval",
  });
});

app.get("/api/staff", auth, (req, res) => {
  const centre = req.user.centre_id;
  const rows = centre && req.user.role !== "SUPER_ADMIN"
    ? db.prepare("SELECT id, full_name, mobile, email, role_applied, centre_id, status, kind, created_at FROM staff WHERE centre_id = ? AND IFNULL(kind,'STAFF') = 'STAFF'").all(centre)
    : db.prepare("SELECT id, full_name, mobile, email, role_applied, centre_id, status, kind, created_at FROM staff").all();
  res.json(rows);
});

app.post("/api/staff/:id/approve", auth, requireRoles("CENTRE_HEAD", "SUPER_ADMIN"), (req, res) => {
  const { decision, comments } = req.body || {};
  const staff = db.prepare("SELECT * FROM staff WHERE id = ?").get(req.params.id);
  if (!staff) return res.status(404).json({ error: "NOT_FOUND" });
  if (!["APPROVE", "REJECT", "CORRECTION"].includes(decision)) return res.status(400).json({ error: "BAD_DECISION" });
  const isIncharge = staff.kind === "INCHARGE" || staff.role_applied === "CENTRE_INCHARGE";
  if (isIncharge && req.user.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "ADMIN_MUST_APPROVE_INCHARGE" });
  }
  const next = decision === "APPROVE" ? "ACTIVE" : decision === "REJECT" ? "REJECTED" : "CORRECTION";
  db.prepare("UPDATE staff SET status = ? WHERE id = ?").run(next, staff.id);
  const apprId = db.newId("APR");
  db.prepare(
    `INSERT INTO staff_approvals (id, staff_id, actor_id, decision, comments) VALUES (?,?,?,?,?)`
  ).run(apprId, staff.id, req.user.id, decision, comments || null);
  db.emitAudit({
    event_type: decision === "APPROVE" ? "StaffApproved" : "StaffRejected",
    entity_id: staff.id,
    actor_id: req.user.id,
    actor_role: req.user.role,
    result: decision,
    payload: { comments },
  });
  let login = null;
  if (decision === "APPROVE" && isIncharge) {
    const uname = "inc-" + String(staff.mobile).slice(-6);
    const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(uname);
    if (!exists) {
      const uid = db.newId("USR");
      db.prepare(
        `INSERT INTO users (id, username, password_hash, display_name, role, centre_id, lab_id, gate_id)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(uid, uname, hashPassword("Pilot@123"), staff.full_name, "CENTRE_HEAD", staff.centre_id, null, null);
      login = { username: uname, password: "Pilot@123" };
    } else login = { username: uname };
  }
  res.json({ staffId: staff.id, status: next, login });
});

app.post("/api/staff/:id/assign", auth, requireRoles("CENTRE_HEAD", "SUPER_ADMIN", "EXAM_ADMIN"), (req, res) => {
  const staff = db.prepare("SELECT * FROM staff WHERE id = ?").get(req.params.id);
  if (!staff || staff.status !== "ACTIVE") return res.status(400).json({ error: "STAFF_NOT_ACTIVE" });
  const { examId, labId, gateId, role } = req.body || {};
  const asgId = db.newId("ASG");
  const exam = resolveExam({ user: req.user, query: { examId: examId }, body: {} });
  const eid = exam?.id || examId;
  db.prepare(
    `INSERT INTO staff_assignments (id, staff_id, exam_id, centre_id, lab_id, gate_id, role, shift_id, status)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(asgId, staff.id, eid, staff.centre_id, labId || null, gateId || null, role || staff.role_applied, "SHIFT-M", "ACTIVE");
  const payload = { typ: "STAFF_BP", passId: db.newId("BP"), assignmentId: asgId, staffId: staff.id, examId: eid, centreId: staff.centre_id };
  payload.passId = db.newId("BP");
  const token = signPayload(payload);
  db.prepare(
    `INSERT INTO boarding_passes (id, kind, staff_assignment_id, token, status, qr_payload) VALUES (?,?,?,?,?,?)`
  ).run(payload.passId, "STAFF", asgId, token, "ACTIVE", token);
  db.emitAudit({ event_type: "StaffAssigned", entity_id: asgId, actor_id: req.user.id, actor_role: req.user.role });
  res.json({ assignmentId: asgId, boardingPassId: payload.passId, token });
});

function thresholds() {
  return {
    pass: Number(cfg("face.passThreshold", "70")),
    borderline: Number(cfg("face.borderlineThreshold", "50")),
  };
}

function faceOutcome(enrolledHash, livePhoto) {
  const liveHash = averageHashFromDataUrl(livePhoto);
  if (!livePhoto || !liveHash) return { score: 0, klass: "MISMATCH", reason: "CAPTURE_QUALITY" };
  if (!enrolledHash) return { score: 60, klass: "BORDERLINE", reason: "NO_ENROLLED_FACE" };
  const score = scoreFromDistance(hamming(enrolledHash, liveHash));
  const klass = classify(score, thresholds());
  return { score, klass, reason: klass };
}

app.post("/api/gate/scan", auth, async (req, res) => {
  const { token } = req.body || {};
  const v = verifyToken(token);
  if (!v.ok) return res.status(400).json({ error: v.reason });
  const p = v.payload;
  const pass = db.prepare("SELECT * FROM boarding_passes WHERE token = ?").get(token);
  if (!pass) return res.status(404).json({ error: "PASS_NOT_FOUND" });
  if (pass.status !== "ACTIVE") return res.status(400).json({ error: "PASS_NOT_ACTIVE", status: pass.status });

  if (p.typ === "CANDIDATE_BP") {
    const appRow = db.prepare("SELECT * FROM applications WHERE id = ?").get(p.applicationId);
    const cand = db.prepare("SELECT * FROM candidates WHERE otr_id = ?").get(p.otrId);
    const prof = db.prepare("SELECT photo_data, dob, gender FROM candidate_profiles WHERE otr_id = ?").get(p.otrId);
    const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(p.examId);
    const centreOk = !req.user.centre_id || req.user.centre_id === p.centreId;
    if (!centreOk) return res.json({ valid: false, reason: "WRONG_CENTRE", subject: cand });
    const pres = presenceOf(p.otrId, p.examId);
    res.json({
      valid: true,
      kind: "CANDIDATE",
      pass,
      candidate: cand,
      profile: prof,
      application: appRow,
      exam,
      presence: pres,
    });
    return;
  }
  if (p.typ === "STAFF_BP") {
    const staff = db.prepare("SELECT id, full_name, mobile, role_applied, centre_id, status, photo_data FROM staff WHERE id = ?").get(p.staffId);
    const asg = db.prepare("SELECT * FROM staff_assignments WHERE id = ?").get(p.assignmentId);
    res.json({ valid: true, kind: "STAFF", pass, staff, assignment: asg });
    return;
  }
  res.status(400).json({ error: "UNKNOWN_PASS_TYPE" });
});

app.post("/api/gate/access-decision", auth, (req, res) => {
  const { token, livePhoto, stage, override, overrideReason } = req.body || {};
  const v = verifyToken(token);
  if (!v.ok) return res.status(400).json({ error: v.reason });
  const p = v.payload;
  const deviceId = req.user.lab_id ? "DEV-" + req.user.lab_id : req.user.gate_id ? "DEV-" + req.user.gate_id : "DEV-UNKNOWN";
  const eventKind = stage === "CLASSROOM" ? "CLASSROOM_PRESENCE" : "CENTRE_ENTRY";

  if (p.typ === "CANDIDATE_BP") {
    if (eventKind === "CLASSROOM_PRESENCE") {
      if (!req.user.lab_id) return res.status(400).json({ error: "DEVICE_NOT_BOUND_TO_LAB" });
      const gateOk = presenceOf(p.otrId, p.examId);
      if (gateOk.state === "EXAM_REGISTERED" && !override) {
        return res.status(400).json({ error: "CENTRE_ENTRY_REQUIRED" });
      }
    }
    const prof = db.prepare("SELECT face_hash FROM candidate_profiles WHERE otr_id = ?").get(p.otrId);
    let face = faceOutcome(prof?.face_hash, livePhoto);
    if (override && ["SUPER_ADMIN", "CENTRE_HEAD", "BIOMETRIC_OPERATOR", "SECURITY_OPERATOR"].includes(req.user.role)) {
      face = { score: face.score, klass: "VERIFIED", reason: "MANUAL_OVERRIDE" };
    } else if (face.klass === "MISMATCH") {
      const alertId = db.newId("ALR");
      db.prepare(
        `INSERT INTO alerts (id, type, severity, centre_id, message) VALUES (?,?,?,?,?)`
      ).run(alertId, "FACE_MISMATCH", "HIGH", p.centreId, `Mismatch at ${eventKind} for ${p.otrId}`);
      db.emitAudit({ event_type: "FaceVerification", entity_id: p.otrId, actor_id: req.user.id, actor_role: req.user.role, centre_id: p.centreId, device_id: deviceId, result: "MISMATCH", reason_code: face.reason });
      const deniedId = db.newId("ACS");
      db.prepare(
        `INSERT INTO access_events (id, event_kind, subject_kind, subject_id, application_id, exam_id, centre_id, lab_id, gate_id, device_id, result, face_score, face_class, reason_code)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(deniedId, eventKind, "CANDIDATE", p.otrId, p.applicationId, p.examId, p.centreId, req.user.lab_id, req.user.gate_id, deviceId, "DENIED", face.score, face.klass, face.reason);
      return res.json({ decision: "DENIED", face, eventId: deniedId });
    } else if (face.klass === "BORDERLINE" && !override) {
      const reviewId = db.newId("ACS");
      db.prepare(
        `INSERT INTO access_events (id, event_kind, subject_kind, subject_id, application_id, exam_id, centre_id, lab_id, gate_id, device_id, result, face_score, face_class, reason_code)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(reviewId, eventKind, "CANDIDATE", p.otrId, p.applicationId, p.examId, p.centreId, req.user.lab_id, req.user.gate_id, deviceId, "REVIEW", face.score, face.klass, "BORDERLINE");
      db.emitAudit({ event_type: "FaceVerification", entity_id: p.otrId, result: "BORDERLINE", actor_id: req.user.id, actor_role: req.user.role });
      return res.json({ decision: "REVIEW", face, eventId: reviewId, message: "Secondary verification required" });
    }

    const grantedId = db.newId("ACS");
    db.prepare(
      `INSERT INTO access_events (id, event_kind, subject_kind, subject_id, application_id, exam_id, centre_id, lab_id, gate_id, device_id, result, face_score, face_class, reason_code)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      grantedId,
      eventKind,
      "CANDIDATE",
      p.otrId,
      p.applicationId,
      p.examId,
      p.centreId,
      eventKind === "CLASSROOM_PRESENCE" ? req.user.lab_id : null,
      eventKind === "CENTRE_ENTRY" ? req.user.gate_id : null,
      deviceId,
      "GRANTED",
      face.score,
      face.klass,
      override ? "MANUAL_OVERRIDE" : face.reason
    );
    db.emitAudit({
      event_type: eventKind === "CLASSROOM_PRESENCE" ? "ClassroomPresenceConfirmed" : "AccessGranted",
      entity_id: p.otrId,
      actor_id: req.user.id,
      actor_role: req.user.role,
      centre_id: p.centreId,
      device_id: deviceId,
      result: "GRANTED",
      correlation_id: grantedId,
      payload: { labId: req.user.lab_id, overrideReason },
    });
    db.emitAudit({ event_type: "BoardingPassValidated", entity_id: p.passId, result: eventKind });
    const cand = db.prepare("SELECT full_name FROM candidates WHERE otr_id = ?").get(p.otrId);
    return res.json({
      decision: "GRANTED",
      face,
      eventId: grantedId,
      headline: eventKind === "CLASSROOM_PRESENCE"
        ? `${p.otrId} – ${cand.full_name} – PRESENT – ${req.user.lab_id}`
        : `${p.otrId} – ${cand.full_name} – CENTRE ENTERED`,
      presence: presenceOf(p.otrId, p.examId),
    });
  }

  if (p.typ === "STAFF_BP") {
    const staff = db.prepare("SELECT * FROM staff WHERE id = ?").get(p.staffId);
    const face = faceOutcome(staff.face_hash, livePhoto);
    const ok = staff.status === "ACTIVE" && (face.klass !== "MISMATCH" || override);
    const id = db.newId("ACS");
    db.prepare(
      `INSERT INTO access_events (id, event_kind, subject_kind, subject_id, exam_id, centre_id, gate_id, device_id, result, face_score, face_class, reason_code)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, "STAFF_ENTRY", "STAFF", p.staffId, p.examId, p.centreId, req.user.gate_id, deviceId, ok ? "GRANTED" : "DENIED", face.score, face.klass, face.reason);
    return res.json({ decision: ok ? "GRANTED" : "DENIED", face, eventId: id });
  }
  res.status(400).json({ error: "UNKNOWN_PASS" });
});

app.get("/api/live/exams", auth, (req, res) => {
  const ids = allowedExamIds(req.user);
  if (!ids.length) return res.json([]);
  const rows = db.prepare("SELECT * FROM exams").all().filter((e) => ids.includes(e.id));
  res.json(rows);
});

app.get("/api/live/overview", auth, (req, res) => {
  const exam = resolveExam(req);
  if (!exam) return res.status(400).json({ error: "NO_EXAM" });
  const examId = exam.id;
  const centreId = scopedCentre(req);
  const appSql = centreId
    ? db.prepare("SELECT COUNT(*) AS c FROM applications WHERE exam_id = ? AND centre_id = ?").get(examId, centreId)
    : db.prepare("SELECT COUNT(*) AS c FROM applications WHERE exam_id = ?").get(examId);
  const ev = (kind, extra = "") => {
    if (centreId) {
      return db.prepare(
        `SELECT COUNT(DISTINCT subject_id) AS c FROM access_events
         WHERE exam_id = ? AND event_kind = ? AND result = 'GRANTED' AND centre_id = ? ${extra}`
      ).get(examId, kind, centreId).c;
    }
    return db.prepare(
      `SELECT COUNT(DISTINCT subject_id) AS c FROM access_events
       WHERE exam_id = ? AND event_kind = ? AND result = 'GRANTED' ${extra}`
    ).get(examId, kind).c;
  };
  const centreEntered = ev("CENTRE_ENTRY");
  const classroomPresent = ev("CLASSROOM_PRESENCE");
  const denied = centreId
    ? db.prepare(`SELECT COUNT(*) AS c FROM access_events WHERE exam_id = ? AND result = 'DENIED' AND centre_id = ?`).get(examId, centreId).c
    : db.prepare(`SELECT COUNT(*) AS c FROM access_events WHERE exam_id = ? AND result = 'DENIED'`).get(examId).c;
  const staffActive = centreId
    ? db.prepare("SELECT COUNT(*) AS c FROM staff WHERE status = 'ACTIVE' AND centre_id = ?").get(centreId).c
    : db.prepare("SELECT COUNT(*) AS c FROM staff WHERE status = 'ACTIVE'").get().c;
  const staffPending = centreId
    ? db.prepare("SELECT COUNT(*) AS c FROM staff WHERE status = 'PENDING' AND centre_id = ?").get(centreId).c
    : db.prepare("SELECT COUNT(*) AS c FROM staff WHERE status = 'PENDING'").get().c;
  const openAlerts = centreId
    ? db.prepare("SELECT COUNT(*) AS c FROM alerts WHERE status = 'OPEN' AND centre_id = ?").get(centreId).c
    : db.prepare("SELECT COUNT(*) AS c FROM alerts WHERE status = 'OPEN'").get().c;
  const devices = centreId
    ? db.prepare("SELECT * FROM devices WHERE centre_id = ?").all(centreId)
    : db.prepare("SELECT * FROM devices").all();
  const centre = centreId ? db.prepare("SELECT * FROM centres WHERE id = ?").get(centreId) : null;
  res.json({
    examId,
    examName: exam.name,
    examSlug: exam.slug,
    lifecycle: exam.lifecycle,
    centreId,
    centreName: centre?.name || "All centres",
    totalApps: appSql.c,
    centreEntered,
    classroomPresent,
    centreEnteredOnly: Math.max(0, centreEntered - classroomPresent),
    denied,
    staffActive,
    staffPending,
    openAlerts,
    devices,
    generatedAt: new Date().toISOString(),
  });
});

app.get("/api/live/labs", auth, (req, res) => {
  const examId = resolveExam(req)?.id;
  const centreId = scopedCentre(req);
  const labs = centreId
    ? db.prepare("SELECT * FROM labs WHERE centre_id = ?").all(centreId)
    : db.prepare("SELECT * FROM labs").all();
  const out = labs.map((lab) => {
    const present = db.prepare(
      `SELECT COUNT(DISTINCT subject_id) AS c FROM access_events
       WHERE exam_id = ? AND event_kind = 'CLASSROOM_PRESENCE' AND result = 'GRANTED' AND lab_id = ?`
    ).get(examId, lab.id).c;
    return { ...lab, present, occupancy: lab.capacity ? Math.round((present / lab.capacity) * 100) : 0 };
  });
  res.json(out);
});

app.get("/api/live/students", auth, (req, res) => {
  const examId = resolveExam(req)?.id;
  const centreId = scopedCentre(req);
  const apps = centreId
    ? db.prepare(
      `SELECT a.*, c.full_name, c.mobile, e.name AS exam_name
       FROM applications a
       JOIN candidates c ON c.otr_id = a.otr_id
       JOIN exams e ON e.id = a.exam_id
       WHERE a.exam_id = ? AND a.centre_id = ?`
    ).all(examId, centreId)
    : db.prepare(
      `SELECT a.*, c.full_name, c.mobile, e.name AS exam_name
       FROM applications a
       JOIN candidates c ON c.otr_id = a.otr_id
       JOIN exams e ON e.id = a.exam_id
       WHERE a.exam_id = ?`
    ).all(examId);
  res.json(apps.map((a) => ({ ...a, presence: presenceOf(a.otr_id, a.exam_id) })));
});

app.get("/api/live/alerts", auth, (req, res) => {
  const centreId = scopedCentre(req);
  const rows = centreId
    ? db.prepare("SELECT * FROM alerts WHERE centre_id = ? ORDER BY created_at DESC LIMIT 50").all(centreId)
    : db.prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 50").all();
  res.json(rows);
});

app.get("/api/audit/events", auth, (req, res) => {
  res.json(db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 200").all());
});

app.get("/api/reports/access", auth, (req, res) => {
  res.json(db.prepare("SELECT * FROM access_events ORDER BY created_at DESC LIMIT 200").all());
});

app.get("/api/centres", auth, (req, res) => {
  const centreId = scopedCentre(req);
  if (centreId && req.user.role !== "SUPER_ADMIN") {
    return res.json(db.prepare("SELECT * FROM centres WHERE id = ?").all(centreId));
  }
  res.json(db.prepare("SELECT * FROM centres").all());
});

app.get("/api/admin/overview", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  res.json({
    exams: db.prepare("SELECT COUNT(*) AS c FROM exams").get().c,
    centres: db.prepare("SELECT COUNT(*) AS c FROM centres").get().c,
    users: db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
    candidates: db.prepare("SELECT COUNT(*) AS c FROM candidates").get().c,
    applications: db.prepare("SELECT COUNT(*) AS c FROM applications").get().c,
    staffPending: db.prepare("SELECT COUNT(*) AS c FROM staff WHERE status = 'PENDING'").get().c,
    devices: db.prepare("SELECT COUNT(*) AS c FROM devices").get().c,
  });
});

app.get("/api/admin/users", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  res.json(db.prepare("SELECT id, username, display_name, role, centre_id, lab_id, gate_id, status FROM users ORDER BY role").all());
});

app.post("/api/admin/users", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const { username, password, displayName, role, centreId, examIds } = req.body || {};
  if (!username || !password || !role) return res.status(400).json({ error: "MISSING_FIELDS" });
  const uname = String(username).toLowerCase();
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(uname)) return res.status(409).json({ error: "USERNAME_TAKEN" });
  const id = db.newId("USR");
  db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, role, centre_id, lab_id, gate_id)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, uname, hashPassword(password), displayName || uname, role, centreId || null, null, null);
  if (role === "CLIENT") {
    const ids = Array.isArray(examIds) && examIds.length
      ? examIds
      : db.prepare("SELECT id FROM exams").all().map((e) => e.id);
    for (const eid of ids) db.prepare("INSERT OR IGNORE INTO exam_clients (exam_id, user_id) VALUES (?,?)").run(eid, id);
  }
  res.json({ id, username: uname });
});

app.delete("/api/admin/users/:id", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "CANNOT_DELETE_SELF" });
  db.prepare("DELETE FROM exam_clients WHERE user_id = ?").run(req.params.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/admin/export/candidates", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const rows = db.prepare(
    `SELECT c.otr_id, c.full_name, c.mobile, c.email, a.exam_id, e.slug, a.centre_id, a.status
     FROM candidates c
     LEFT JOIN applications a ON a.otr_id = c.otr_id
     LEFT JOIN exams e ON e.id = a.exam_id`
  ).all();
  res.json({ rows });
});

app.post("/api/admin/import/candidates", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const rows = req.body.rows || [];
  let created = 0;
  for (const r of rows) {
    if (!r.mobile || !r.fullName) continue;
    if (db.prepare("SELECT otr_id FROM candidates WHERE mobile = ?").get(String(r.mobile))) continue;
    const otrId = "OTR" + String(10000 + Math.floor(Math.random() * 89999));
    db.prepare("INSERT INTO candidates (otr_id, mobile, email, full_name, identity_status) VALUES (?,?,?,?,?)").run(
      otrId, String(r.mobile), r.email || null, r.fullName, "OTR_ACTIVE"
    );
    db.prepare("INSERT INTO candidate_profiles (otr_id, dob, gender, address) VALUES (?,?,?,?)").run(otrId, null, null, r.address || null);
    created++;
  }
  res.json({ created });
});

app.get("/api/admin/labs", auth, requireRoles("SUPER_ADMIN", "CENTRE_HEAD"), (req, res) => {
  res.json(db.prepare("SELECT * FROM labs").all());
});

app.get("/api/config", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  res.json(db.prepare("SELECT key, value FROM system_configurations").all());
});

app.put("/api/config", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const entries = req.body || {};
  const up = db.prepare("INSERT INTO system_configurations (key, value) VALUES (?,?)");
  const del = db.prepare("DELETE FROM system_configurations WHERE key = ?");
  for (const [key, value] of Object.entries(entries)) {
    del.run(key);
    up.run(key, String(value));
  }
  db.emitAudit({ event_type: "ConfigUpdated", actor_id: req.user.id, actor_role: req.user.role, result: "OK", payload: entries });
  res.json({ ok: true });
});

app.get("/api/admin/exams", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  res.json(db.prepare("SELECT * FROM exams ORDER BY exam_date").all());
});

app.post("/api/exams", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const { code, name, examDate, reportingTime, slug, centreIds } = req.body || {};
  if (!code || !name || !examDate) return res.status(400).json({ error: "MISSING_FIELDS" });
  const examSlug = String(slug || code).replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
  const dup = db.prepare("SELECT id FROM exams WHERE UPPER(slug)=? OR UPPER(code)=?").get(examSlug, String(code).toUpperCase());
  if (dup) return res.status(409).json({ error: "SLUG_TAKEN" });
  const id = db.newId("EXM");
  db.prepare(
    "INSERT INTO exams (id, code, name, exam_date, reporting_time, status, slug, lifecycle) VALUES (?,?,?,?,?,?,?,?)"
  ).run(id, code.toUpperCase(), name, examDate, reportingTime || "08:30", "ACTIVE", examSlug, "DRAFT");
  db.prepare("INSERT INTO exam_shifts (id, exam_id, name, start_time, end_time) VALUES (?,?,?,?,?)").run(
    "SHIFT-" + examSlug, id, "Morning", "09:00", "12:00"
  );
  const centres = Array.isArray(centreIds) && centreIds.length
    ? centreIds
    : db.prepare("SELECT id FROM centres").all().map((c) => c.id);
  for (const cid of centres) {
    db.prepare("INSERT OR IGNORE INTO exam_centres (exam_id, centre_id) VALUES (?,?)").run(id, cid);
  }
  res.json({ id, slug: examSlug, registerPath: `/DIGITAL-EXAM/${examSlug}` });
});

app.patch("/api/exams/:id/lifecycle", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(req.params.id);
  if (!exam) return res.status(404).json({ error: "NOT_FOUND" });
  const lifecycle = String(req.body.lifecycle || "").toUpperCase();
  if (!["DRAFT", "OPEN", "LIVE", "CLOSED"].includes(lifecycle)) return res.status(400).json({ error: "BAD_LIFECYCLE" });
  db.prepare("UPDATE exams SET lifecycle = ? WHERE id = ?").run(lifecycle, exam.id);
  db.emitAudit({ event_type: "ExamLifecycle", entity_id: exam.id, actor_id: req.user.id, result: lifecycle });
  res.json({ id: exam.id, slug: exam.slug, lifecycle });
});

app.post("/api/centres", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const { name, city, state, capacity } = req.body || {};
  if (!name) return res.status(400).json({ error: "NAME_REQUIRED" });
  const id = db.newId("CTR");
  db.prepare("INSERT INTO centres (id, name, address, city, state, capacity, status) VALUES (?,?,?,?,?,?,?)").run(
    id, name, req.body.address || "", city || "", state || "", Number(capacity) || 0, "ACTIVE"
  );
  res.json({ id });
});

app.post("/api/sync/enqueue", auth, (req, res) => {
  const id = db.newId("SYN");
  db.prepare("INSERT INTO sync_queue (id, payload_json, status) VALUES (?,?,?)").run(id, JSON.stringify(req.body || {}), "PENDING");
  db.emitAudit({ event_type: "DataSynced", entity_id: id, actor_id: req.user.id, result: "QUEUED" });
  res.json({ id, status: "PENDING" });
});

app.post("/api/sync/flush", auth, (req, res) => {
  const pending = db.prepare("SELECT * FROM sync_queue WHERE status = 'PENDING'").all();
  db.prepare("UPDATE sync_queue SET status = 'SYNCED' WHERE status = 'PENDING'").run();
  res.json({ synced: pending.length });
});

const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

openDb()
  .then((opened) => {
    db = opened;
    const HOST = process.env.HOST || "0.0.0.0";
    app.listen(PORT, HOST, () => {
      console.log(`EIALM running on http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
