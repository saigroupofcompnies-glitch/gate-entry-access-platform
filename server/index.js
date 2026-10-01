const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const { openDb } = require("./db");
const { registerSrsAdmin } = require("./srsAdmin");
const { registerDashboard } = require("./dashboard");
const { verifyToken, verifyPassword, sessionToken, signPayload, hashPassword } = require("./token");
const crypto = require("crypto");
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
  if (["CENTRE_HEAD", "CENTRE_OPERATOR", "SECURITY_OPERATOR", "BIOMETRIC_OPERATOR", "STAFF"].includes(req.user.role)) {
    return req.user.centre_id || null;
  }
  return req.query.centreId || null;
}

function bindUserExams(userId, examIds) {
  db.prepare("DELETE FROM exam_clients WHERE user_id = ?").run(userId);
  for (const eid of examIds || []) {
    if (!eid) continue;
    const exam = db.prepare("SELECT id FROM exams WHERE id = ? OR UPPER(slug)=UPPER(?)").get(eid, eid);
    if (exam) db.prepare("INSERT OR IGNORE INTO exam_clients (exam_id, user_id) VALUES (?,?)").run(exam.id, userId);
  }
}

function userExamRows(userId) {
  return db.prepare(
    `SELECT e.id, e.slug, e.name FROM exam_clients ec
     JOIN exams e ON e.id = ec.exam_id
     WHERE ec.user_id = ?
     ORDER BY e.exam_date`
  ).all(userId);
}

function allowedExamIds(user) {
  if (!user) return [];
  if (user.role === "SUPER_ADMIN") return db.prepare("SELECT id FROM exams").all().map((e) => e.id);
  const bound = db.prepare("SELECT exam_id AS id FROM exam_clients WHERE user_id = ?").all(user.id).map((r) => r.id);
  if (user.role === "CLIENT" || user.role === "DEPARTMENT_OFFICER" || user.role === "CANDIDATE" || user.role === "STAFF") {
    if (user.role === "STAFF" && !bound.length && user.centre_id) {
      return db.prepare("SELECT exam_id AS id FROM exam_centres WHERE centre_id = ?").all(user.centre_id).map((r) => r.id);
    }
    return bound;
  }
  if (user.centre_id) {
    const atCentre = db.prepare("SELECT exam_id AS id FROM exam_centres WHERE centre_id = ?").all(user.centre_id).map((r) => r.id);
    if (bound.length) return bound.filter((id) => atCentre.includes(id) || !atCentre.length);
    return atCentre;
  }
  return bound;
}

function resolveExam(req) {
  const ids = allowedExamIds(req.user);
  const q = req.query.examId || req.body?.examId;
  if (q) {
    const row = db.prepare("SELECT * FROM exams WHERE id = ? OR UPPER(slug)=UPPER(?) OR UPPER(code)=UPPER(?)").get(q, q, q);
    if (row && (req.user?.role === "SUPER_ADMIN" || ids.includes(row.id))) return row;
    return null;
  }
  if (ids[0]) return db.prepare("SELECT * FROM exams WHERE id = ?").get(ids[0]);
  if (req.user?.role === "SUPER_ADMIN") return db.prepare("SELECT * FROM exams ORDER BY exam_date DESC LIMIT 1").get();
  return null;
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "FORBIDDEN" });
    next();
  };
}

function cell(row, names) {
  if (!row || typeof row !== "object") return "";
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = {};
  for (const [k, v] of Object.entries(row)) map[norm(k)] = v;
  for (const n of names) {
    const v = map[norm(n)];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function nextOtrId() {
  for (let i = 0; i < 40; i++) {
    const otrId = "OTR" + String(10000 + Math.floor(Math.random() * 89999));
    if (!db.prepare("SELECT otr_id FROM candidates WHERE otr_id = ?").get(otrId)) return otrId;
  }
  return db.newId("OTR");
}

function resolveCentreForExam(examId, hint) {
  if (hint) {
    const byId = db.prepare("SELECT * FROM centres WHERE id = ?").get(hint);
    if (byId) return byId.id;
    const byName = db.prepare("SELECT * FROM centres WHERE UPPER(name) = UPPER(?)").get(hint);
    if (byName) return byName.id;
  }
  return db.prepare("SELECT centre_id FROM exam_centres WHERE exam_id = ?").get(examId)?.centre_id || null;
}

function examDeskStats(examId) {
  return {
    students: db.prepare("SELECT COUNT(*) AS c FROM applications WHERE exam_id = ?").get(examId).c,
    pendingAdmit: db.prepare(
      "SELECT COUNT(*) AS c FROM applications WHERE exam_id = ? AND (centre_id IS NULL OR centre_id = '')"
    ).get(examId).c,
    admitIssued: db.prepare(
      "SELECT COUNT(*) AS c FROM applications WHERE exam_id = ? AND centre_id IS NOT NULL AND centre_id != ''"
    ).get(examId).c,
    staffAssigned: db.prepare("SELECT COUNT(*) AS c FROM staff_assignments WHERE exam_id = ?").get(examId).c,
    centres: db.prepare("SELECT COUNT(*) AS c FROM exam_centres WHERE exam_id = ?").get(examId).c,
  };
}

function parseWhen(value) {
  if (!value) return null;
  const t = Date.parse(String(value).replace(" ", "T"));
  return Number.isNaN(t) ? null : t;
}

function registrationStatus(exam) {
  const now = Date.now();
  const start = parseWhen(exam.registration_start);
  const end = parseWhen(exam.registration_close);
  if (start && now < start) return "NOT_STARTED";
  if (end && now > end) return "CLOSED";
  if (start || end) return "OPEN";
  if (["OPEN", "LIVE"].includes(exam.lifecycle)) return "OPEN";
  return "NOT_STARTED";
}

function registrationOpen(exam) {
  return registrationStatus(exam) === "OPEN";
}

function slugFromName(name) {
  const slug = String(name || "").replace(/[^A-Za-z0-9]+/g, "").toUpperCase().slice(0, 16);
  return slug || "EXAM";
}

function ensureClassroomDevice(lab) {
  if (!lab?.id) return null;
  const existing = db.prepare("SELECT * FROM devices WHERE lab_id = ? AND kind = 'CLASSROOM'").get(lab.id);
  if (existing) return existing;
  const id = "DEV-" + lab.id;
  try {
    db.prepare(
      "INSERT INTO devices (id, kind, centre_id, lab_id, status, last_sync) VALUES (?,?,?,?,?,datetime('now'))"
    ).run(id, "CLASSROOM", lab.centre_id, lab.id, "ONLINE");
  } catch {
    return db.prepare("SELECT * FROM devices WHERE lab_id = ?").get(lab.id) || null;
  }
  return db.prepare("SELECT * FROM devices WHERE id = ?").get(id);
}

function pingBoundDevice(user) {
  if (user?.lab_id) {
    db.prepare("UPDATE devices SET last_sync = datetime('now'), status = 'ONLINE' WHERE lab_id = ?").run(user.lab_id);
  } else if (user?.gate_id) {
    db.prepare("UPDATE devices SET last_sync = datetime('now'), status = 'ONLINE' WHERE gate_id = ?").run(user.gate_id);
  }
}

function ensureLabsForCentre(centreId) {
  let labs = db.prepare("SELECT * FROM labs WHERE centre_id = ?").all(centreId);
  if (!labs.length) {
    const centre = db.prepare("SELECT * FROM centres WHERE id = ?").get(centreId);
    const seats = Number(centre?.capacity) || 120;
    const n = Math.max(1, Math.ceil(seats / 40));
    for (let i = 1; i <= n; i++) {
      const id = db.newId("LAB");
      db.prepare(
        "INSERT INTO labs (id, centre_id, name, building, floor, capacity, status) VALUES (?,?,?,?,?,?,?)"
      ).run(id, centreId, `Lab ${i}`, "", String(i), 40, "ACTIVE");
    }
    labs = db.prepare("SELECT * FROM labs WHERE centre_id = ?").all(centreId);
  }
  labs.forEach(ensureClassroomDevice);
  return labs;
}

function pickLabForStudent(examId, centreId, preferredLabId) {
  const labs = ensureLabsForCentre(centreId);
  if (preferredLabId && labs.some((l) => l.id === preferredLabId)) return preferredLabId;
  let best = labs[0];
  let bestUsed = Infinity;
  for (const lab of labs) {
    const used = db.prepare("SELECT COUNT(*) AS c FROM applications WHERE exam_id = ? AND lab_id = ?").get(examId, lab.id).c;
    const cap = Number(lab.capacity) || 40;
    if (used < cap && used < bestUsed) {
      best = lab;
      bestUsed = used;
    }
  }
  return best?.id || null;
}

function assignLabOnFace(appRow, preferredLabId) {
  if (!appRow?.centre_id) return null;
  const labId = pickLabForStudent(appRow.exam_id, appRow.centre_id, preferredLabId || appRow.lab_id);
  if (labId && appRow.lab_id !== labId) {
    db.prepare("UPDATE applications SET lab_id = ? WHERE id = ?").run(labId, appRow.id);
  }
  return labId;
}

function nextSeat(examId, labId) {
  const used = new Set(
    db.prepare("SELECT seat_no FROM applications WHERE exam_id = ? AND lab_id = ? AND seat_no IS NOT NULL AND seat_no != ''")
      .all(examId, labId)
      .map((r) => r.seat_no)
  );
  const lab = db.prepare("SELECT * FROM labs WHERE id = ?").get(labId);
  const cap = Number(lab?.capacity) || 40;
  for (let i = 1; i <= cap + 50; i++) {
    const seat = `S${String(i).padStart(2, "0")}`;
    if (!used.has(seat)) return seat;
  }
  return `S${String(used.size + 1).padStart(2, "0")}`;
}

function applyClassroomSeat(appRow, labId, exam) {
  const mode = String(exam?.mode || "OFFLINE").toUpperCase();
  let seat = null;
  if (mode === "CBT") {
    seat = appRow.lab_id === labId && appRow.seat_no ? appRow.seat_no : nextSeat(appRow.exam_id, labId);
    db.prepare(
      "UPDATE applications SET lab_id = ?, seat_no = ?, classroom_at = datetime('now') WHERE id = ?"
    ).run(labId, seat, appRow.id);
  } else {
    db.prepare(
      "UPDATE applications SET lab_id = ?, seat_no = NULL, classroom_at = datetime('now') WHERE id = ?"
    ).run(labId, appRow.id);
  }
  return { seat, examMode: mode };
}

function classroomOccupancy(examId, labId) {
  const present = db.prepare(
    `SELECT COUNT(DISTINCT subject_id) AS c FROM access_events
     WHERE exam_id = ? AND event_kind = 'CLASSROOM_PRESENCE' AND result = 'GRANTED' AND lab_id = ?`
  ).get(examId, labId).c;
  const lab = db.prepare("SELECT * FROM labs WHERE id = ?").get(labId);
  return { lab, present, capacity: lab?.capacity || 0 };
}

function pickCentreForAdmit(examId, centres) {
  for (const c of centres) {
    const used = db.prepare("SELECT COUNT(*) AS c FROM applications WHERE exam_id = ? AND centre_id = ?").get(examId, c.id).c;
    const cap = Number(c.capacity) || 99999;
    if (used < cap) return c;
  }
  return centres[0];
}

function nextRollNo(exam) {
  const n = db.prepare("SELECT COUNT(*) AS c FROM applications WHERE exam_id = ? AND roll_no IS NOT NULL AND roll_no != ''").get(exam.id).c;
  return `${exam.slug}-${String(n + 1).padStart(4, "0")}`;
}

function issueCandidatePass(appId, otrId, exam) {
  const appRow = db.prepare("SELECT * FROM applications WHERE id = ?").get(appId);
  db.prepare("DELETE FROM boarding_passes WHERE application_id = ?").run(appId);
  const payload = {
    typ: "CANDIDATE_BP",
    passId: db.newId("BP"),
    applicationId: appId,
    otrId,
    examId: exam.id,
    centreId: appRow?.centre_id || null,
    rollNo: appRow?.roll_no || null,
    date: exam.exam_date,
  };
  const token = signPayload(payload);
  db.prepare(
    `INSERT INTO boarding_passes (id, kind, application_id, token, status, qr_payload) VALUES (?,?,?,?,?,?)`
  ).run(payload.passId, "CANDIDATE", appId, token, "ACTIVE", token);
  return { id: payload.passId, token };
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
  const name = String(username || "").trim();
  const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(name);
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
      examIds: allowedExamIds(user),
      staffId: user.staff_id || null,
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
    examIds: allowedExamIds(req.user),
    staffId: req.user.staff_id || null,
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
  const apps = db.prepare(
    `SELECT a.id, a.status, a.centre_id, a.roll_no, a.lab_id, a.exam_id, e.name AS exam_name, e.slug, e.exam_date,
            e.registration_start, e.registration_close, ctr.name AS centre_name
     FROM applications a
     JOIN exams e ON e.id = a.exam_id
     LEFT JOIN centres ctr ON ctr.id = a.centre_id
     WHERE a.otr_id = ?`
  ).all(otrId);
  return { ...c, profile: p, documents, fingerprints, applications: apps };
}

app.post("/api/candidates/register", (req, res) => {
  const { mobile, email, fullName, dob, gender, photoData, consent } = req.body || {};
  if (!/^\d{10}$/.test(String(mobile || ""))) return res.status(400).json({ error: "INVALID_MOBILE" });
  if (!fullName) return res.status(400).json({ error: "NAME_REQUIRED" });
  if (!email) return res.status(400).json({ error: "EMAIL_REQUIRED" });
  if (!dob) return res.status(400).json({ error: "DOB_REQUIRED" });
  if (!photoData) return res.status(400).json({ error: "PHOTO_REQUIRED" });
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
  const required = ["fatherName", "motherName", "bloodGroup", "addressLine1", "city", "district", "state", "pincode", "category", "nationality", "aadhaar"];
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
      `INSERT INTO candidate_fingerprints (id, otr_id, hand, finger, image_data, print_hash) VALUES (?,?,?,?,?,?)`
    ).run(db.newId("FP"), cand.otr_id, f.hand, f.finger, f.imageData, averageHashFromDataUrl(f.imageData));
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
  const rows = db.prepare("SELECT * FROM exams WHERE status = 'ACTIVE' ORDER BY exam_date").all();
  const mapped = rows.map((e) => ({ ...e, registrationStatus: registrationStatus(e) }));
  if (req.query.all === "1") return res.json(mapped);
  res.json(mapped.filter((e) => e.registrationStatus === "OPEN"));
});

app.get("/api/exams/public/:slug", (req, res) => {
  const exam = db.prepare("SELECT * FROM exams WHERE UPPER(slug) = UPPER(?) OR UPPER(code) = UPPER(?)").get(req.params.slug, req.params.slug);
  if (!exam) return res.status(404).json({ error: "EXAM_NOT_FOUND" });
  const centres = db.prepare(
    `SELECT c.id, c.name, c.city FROM centres c JOIN exam_centres ec ON ec.centre_id = c.id WHERE ec.exam_id = ?`
  ).all(exam.id);
  res.json({
    ...exam,
    centres,
    registrationStatus: registrationStatus(exam),
    registrationOpen: registrationOpen(exam),
    registerPath: `/digi-exam/${exam.slug}`,
  });
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
  if (!registrationOpen(exam)) return res.status(400).json({ error: "REGISTRATION_CLOSED" });
  const dup = db.prepare("SELECT id FROM applications WHERE otr_id = ? AND exam_id = ?").get(otrId, exam.id);
  if (dup) return res.status(409).json({ error: "ALREADY_APPLIED", applicationId: dup.id });
  const shift = db.prepare("SELECT id FROM exam_shifts WHERE exam_id = ? LIMIT 1").get(exam.id);
  const id = db.newId("APP");
  db.prepare(
    `INSERT INTO applications (id, otr_id, exam_id, shift_id, centre_id, status) VALUES (?,?,?,?,?,?)`
  ).run(id, otrId, exam.id, shift?.id || null, null, "REGISTERED");
  db.emitAudit({ event_type: "ExamApplied", entity_id: id, actor_id: req.user.id, actor_role: req.user.role, result: "REGISTERED" });
  res.json({ applicationId: id, status: "REGISTERED", message: "Centre will be allotted when admit cards are issued." });
});

app.post("/api/exams/:id/apply-public", (req, res) => {
  const { mobile, otp } = req.body || {};
  if (String(otp) !== cfg("otp.demo", "123456")) return res.status(401).json({ error: "INVALID_OTP" });
  const cand = db.prepare("SELECT * FROM candidates WHERE mobile = ?").get(String(mobile));
  if (!cand) return res.status(404).json({ error: "COMPLETE_OTR_FIRST" });
  if (!["OTR_COMPLETE", "OTR_ACTIVE"].includes(cand.identity_status)) {
    return res.status(400).json({ error: "OTR_NOT_COMPLETE" });
  }
  const exam = db.prepare("SELECT * FROM exams WHERE id = ? OR UPPER(slug)=UPPER(?)").get(req.params.id, req.params.id);
  if (!exam) return res.status(404).json({ error: "EXAM_NOT_FOUND" });
  if (!registrationOpen(exam)) return res.status(400).json({ error: "REGISTRATION_CLOSED" });
  const dup = db.prepare("SELECT id FROM applications WHERE otr_id = ? AND exam_id = ?").get(cand.otr_id, exam.id);
  if (dup) {
    const pass = db.prepare("SELECT * FROM boarding_passes WHERE application_id = ?").get(dup.id);
    return res.json({
      applicationId: dup.id,
      status: dup.status,
      rollNo: dup.roll_no,
      centreId: dup.centre_id,
      boardingPassId: pass?.id,
      token: pass?.token,
      message: dup.centre_id ? "Admit card already issued." : "Already registered. Centre will come on the admit card.",
    });
  }
  const shift = db.prepare("SELECT id FROM exam_shifts WHERE exam_id = ? LIMIT 1").get(exam.id);
  const id = db.newId("APP");
  const prof = db.prepare("SELECT photo_data, face_hash FROM candidate_profiles WHERE otr_id = ?").get(cand.otr_id);
  const docPhoto = db.prepare(
    "SELECT file_data FROM candidate_documents WHERE otr_id = ? AND doc_type = 'PHOTO' ORDER BY created_at DESC LIMIT 1"
  ).get(cand.otr_id);
  const regPhoto = req.body.photoData || docPhoto?.file_data || prof?.photo_data || null;
  const regHash = averageHashFromDataUrl(regPhoto) || prof?.face_hash || null;
  db.prepare(
    `INSERT INTO applications (id, otr_id, exam_id, shift_id, centre_id, status) VALUES (?,?,?,?,?,?)`
  ).run(id, cand.otr_id, exam.id, shift?.id || null, null, "REGISTERED");
  try {
    db.prepare("UPDATE applications SET reg_photo_data = ?, reg_face_hash = ? WHERE id = ?").run(regPhoto, regHash, id);
  } catch (_) { /* column missing on old db */ }
  db.emitAudit({ event_type: "ExamApplied", entity_id: id, result: "REGISTERED", payload: { slug: exam.slug } });
  res.json({ applicationId: id, otrId: cand.otr_id, status: "REGISTERED", exam: exam.slug });
});

app.post("/api/admit-card/lookup", async (req, res) => {
  const { mobile, otp, slug } = req.body || {};
  if (String(otp) !== cfg("otp.demo", "123456")) return res.status(401).json({ error: "INVALID_OTP" });
  const cand = db.prepare("SELECT * FROM candidates WHERE mobile = ?").get(String(mobile));
  if (!cand) return res.status(404).json({ error: "OTR_NOT_FOUND" });
  const exam = slug
    ? db.prepare("SELECT * FROM exams WHERE UPPER(slug)=UPPER(?) OR UPPER(code)=UPPER(?)").get(slug, slug)
    : null;
  let appRow;
  if (exam) {
    appRow = db.prepare("SELECT * FROM applications WHERE otr_id = ? AND exam_id = ?").get(cand.otr_id, exam.id);
  } else {
    appRow = db.prepare("SELECT * FROM applications WHERE otr_id = ? AND centre_id IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(cand.otr_id);
  }
  if (!appRow) return res.status(404).json({ error: "NO_APPLICATION" });
  if (!appRow.centre_id) return res.status(400).json({ error: "ADMIT_NOT_ISSUED" });
  const ex = db.prepare("SELECT * FROM exams WHERE id = ?").get(appRow.exam_id);
  const centre = db.prepare("SELECT * FROM centres WHERE id = ?").get(appRow.centre_id);
  const lab = appRow.lab_id ? db.prepare("SELECT * FROM labs WHERE id = ?").get(appRow.lab_id) : null;
  const pass = db.prepare("SELECT * FROM boarding_passes WHERE application_id = ?").get(appRow.id);
  let qrDataUrl = null;
  if (pass?.token) qrDataUrl = await QRCode.toDataURL(pass.token, { width: 280, margin: 1, color: { dark: "#0b1a2e", light: "#ffffff" } });
  res.json({
    candidate: { otrId: cand.otr_id, fullName: cand.full_name, mobile: cand.mobile },
    exam: ex,
    centre,
    lab,
    rollNo: appRow.roll_no,
    seatNo: appRow.seat_no,
    examMode: String(ex.mode || "OFFLINE").toUpperCase(),
    status: appRow.status,
    token: pass?.token,
    qrDataUrl,
  });
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

function mapStaffUserRole(staff) {
  if (staff.kind === "INCHARGE" || staff.role_applied === "CENTRE_INCHARGE") return "CENTRE_HEAD";
  const r = String(staff.role_applied || "").toUpperCase();
  if (["SECURITY_OPERATOR", "BIOMETRIC_OPERATOR", "CENTRE_OPERATOR"].includes(r)) return r;
  return "STAFF";
}

function issueStaffLogin(staff) {
  const linked = db.prepare("SELECT * FROM users WHERE staff_id = ?").get(staff.id);
  if (linked) return { username: linked.username, userId: linked.id };
  const role = mapStaffUserRole(staff);
  const prefix = role === "CENTRE_HEAD" ? "inc-" : "stf-";
  const uname = prefix + String(staff.mobile).slice(-6);
  const exists = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(uname);
  if (exists) {
    db.prepare("UPDATE users SET staff_id = ?, centre_id = COALESCE(centre_id, ?) WHERE id = ?").run(staff.id, staff.centre_id, exists.id);
    return { username: exists.username, userId: exists.id };
  }
  const uid = db.newId("USR");
  const tempPass = "Pilot@123";
  db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, role, centre_id, lab_id, gate_id)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(uid, uname, hashPassword(tempPass), staff.full_name, role, staff.centre_id || null, null, null);
  try { db.prepare("UPDATE users SET staff_id = ? WHERE id = ?").run(staff.id, uid); } catch (_) { /* column missing */ }
  const centreExams = db.prepare("SELECT exam_id AS id FROM exam_centres WHERE centre_id = ?").all(staff.centre_id).map((r) => r.id);
  bindUserExams(uid, centreExams);
  return { username: uname, password: tempPass, userId: uid };
}

function issueStaffCredentials(staff, asg) {
  function ensure(kind, typ) {
    const row = db.prepare(
      "SELECT * FROM boarding_passes WHERE staff_assignment_id = ? AND kind = ? AND status = 'ACTIVE'"
    ).get(asg.id, kind);
    if (row) return row;
    const passId = db.newId(kind === "STAFF_ID" ? "SID" : "SBP");
    const payload = { typ, passId, assignmentId: asg.id, staffId: staff.id, examId: asg.exam_id, centreId: asg.centre_id };
    const token = signPayload(payload);
    db.prepare(
      `INSERT INTO boarding_passes (id, kind, staff_assignment_id, token, status, qr_payload) VALUES (?,?,?,?,?,?)`
    ).run(passId, kind, asg.id, token, "ACTIVE", token);
    return db.prepare("SELECT * FROM boarding_passes WHERE id = ?").get(passId);
  }
  const gate = ensure("STAFF", "STAFF_BP");
  const idCard = ensure("STAFF_ID", "STAFF_ID");
  return { gate, idCard };
}

function staffRecordForUser(user) {
  if (user.staff_id) {
    const byId = db.prepare("SELECT * FROM staff WHERE id = ?").get(user.staff_id);
    if (byId) return byId;
  }
  const digits = String(user.username || "").replace(/\D/g, "");
  if (digits.length >= 6) {
    const byTail = db.prepare("SELECT * FROM staff WHERE mobile LIKE ?").get("%" + digits.slice(-6));
    if (byTail) return byTail;
  }
  return null;
}

async function staffCredentialPack(staff) {
  const asgs = db.prepare("SELECT * FROM staff_assignments WHERE staff_id = ? AND status = 'ACTIVE'").all(staff.id);
  const centre = db.prepare("SELECT * FROM centres WHERE id = ?").get(staff.centre_id);
  const items = [];
  for (const asg of asgs) {
    const creds = issueStaffCredentials(staff, asg);
    const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(asg.exam_id);
    items.push({
      assignmentId: asg.id,
      role: asg.role,
      labId: asg.lab_id,
      gateId: asg.gate_id,
      exam: exam ? { id: exam.id, name: exam.name, slug: exam.slug, exam_date: exam.exam_date, reporting_time: exam.reporting_time } : null,
      centre: centre ? { id: centre.id, name: centre.name, city: centre.city, address: centre.address } : null,
      gatePass: { id: creds.gate.id, kind: creds.gate.kind, qrDataUrl: await QRCode.toDataURL(creds.gate.token, { width: 280, margin: 1 }) },
      idCard: { id: creds.idCard.id, kind: creds.idCard.kind, qrDataUrl: await QRCode.toDataURL(creds.idCard.token, { width: 280, margin: 1 }) },
    });
  }
  let profile = {};
  try { profile = JSON.parse(staff.profile_json || "{}"); } catch { profile = {}; }
  return {
    staff: {
      id: staff.id,
      fullName: staff.full_name,
      mobile: staff.mobile,
      email: staff.email,
      role: staff.role_applied,
      status: staff.status,
      photoData: staff.photo_data,
      designation: staff.designation || profile.designation || staff.role_applied,
      dob: staff.dob || profile.dob,
      bloodGroup: profile.bloodGroup,
      employeeCode: profile.employeeCode,
      centreId: staff.centre_id,
      centreName: centre?.name,
    },
    items,
  };
}

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
    message: staffKind === "INCHARGE"
      ? "Waiting for Main Admin approval. After approval, sign in to download ID card and gate pass."
      : "Waiting for Centre Incharge approval. After approval and exam assignment, sign in to download ID card and gate pass.",
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
  if (decision === "APPROVE") {
    login = issueStaffLogin(staff);
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
  if (!eid) return res.status(400).json({ error: "EXAM_REQUIRED" });
  db.prepare(
    `INSERT INTO staff_assignments (id, staff_id, exam_id, centre_id, lab_id, gate_id, role, shift_id, status)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(asgId, staff.id, eid, staff.centre_id, labId || null, gateId || null, role || staff.role_applied, "SHIFT-M", "ACTIVE");
  const asg = db.prepare("SELECT * FROM staff_assignments WHERE id = ?").get(asgId);
  const creds = issueStaffCredentials(staff, asg);
  issueStaffLogin(staff);
  db.emitAudit({ event_type: "StaffAssigned", entity_id: asgId, actor_id: req.user.id, actor_role: req.user.role });
  res.json({ assignmentId: asgId, boardingPassId: creds.gate.id, idCardId: creds.idCard.id });
});

app.get("/api/staff/me/pack", auth, async (req, res) => {
  if (!["STAFF", "CENTRE_HEAD", "SECURITY_OPERATOR", "BIOMETRIC_OPERATOR", "CENTRE_OPERATOR"].includes(req.user.role)) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  const staff = staffRecordForUser(req.user);
  if (!staff) return res.status(404).json({ error: "STAFF_PROFILE_MISSING" });
  res.json(await staffCredentialPack(staff));
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

function faceMatchCandidate(otrId, applicationId, livePhoto) {
  const prof = db.prepare("SELECT photo_data, face_hash FROM candidate_profiles WHERE otr_id = ?").get(otrId);
  const appRow = applicationId ? db.prepare("SELECT reg_photo_data, reg_face_hash FROM applications WHERE id = ?").get(applicationId) : null;
  const doc = db.prepare(
    "SELECT file_data FROM candidate_documents WHERE otr_id = ? AND doc_type = 'PHOTO' ORDER BY created_at DESC LIMIT 1"
  ).get(otrId);
  const otrHash = prof?.face_hash || averageHashFromDataUrl(prof?.photo_data);
  const regHash = appRow?.reg_face_hash
    || averageHashFromDataUrl(appRow?.reg_photo_data)
    || averageHashFromDataUrl(doc?.file_data)
    || otrHash;
  const otr = faceOutcome(otrHash, livePhoto);
  const reg = faceOutcome(regHash, livePhoto);
  const parts = [
    { key: "OTR", ...otr },
    { key: "REGISTRATION", ...reg },
  ];
  const scores = parts.map((p) => p.score);
  const min = Math.min(...scores);
  let klass = "VERIFIED";
  if (parts.some((p) => p.klass === "MISMATCH")) klass = "MISMATCH";
  else if (parts.some((p) => p.klass === "BORDERLINE")) klass = "BORDERLINE";
  return {
    score: min,
    klass,
    reason: klass === "VERIFIED" ? "OTR_AND_REG_PHOTO_MATCH" : klass,
    otr,
    registration: reg,
    parts,
  };
}

function fingerprintOutcome(otrId, livePrint) {
  const liveHash = averageHashFromDataUrl(livePrint);
  if (!livePrint || !liveHash) return { score: 0, klass: "MISMATCH", reason: "FP_CAPTURE_QUALITY", enrolled: 0 };
  const enrolled = db.prepare("SELECT hand, finger, image_data, print_hash FROM candidate_fingerprints WHERE otr_id = ?").all(otrId);
  if (!enrolled.length) return { score: 0, klass: "MISMATCH", reason: "NO_ENROLLED_FINGERPRINT", enrolled: 0 };
  let best = { score: 0, hand: null, finger: null };
  for (const row of enrolled) {
    const h = row.print_hash || averageHashFromDataUrl(row.image_data);
    const score = scoreFromDistance(hamming(h, liveHash));
    if (score > best.score) best = { score, hand: row.hand, finger: row.finger };
  }
  const klass = classify(best.score, thresholds());
  return { ...best, klass, reason: klass, enrolled: enrolled.length };
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
    if (!appRow?.centre_id) {
      return res.json({ valid: false, reason: "ADMIT_CARD_REQUIRED", subject: cand });
    }
    const centreOk = !req.user.centre_id || req.user.centre_id === appRow.centre_id;
    if (!centreOk) return res.json({ valid: false, reason: "WRONG_CENTRE", subject: cand });
    const lab = appRow.lab_id ? db.prepare("SELECT * FROM labs WHERE id = ?").get(appRow.lab_id) : null;
    const centre = db.prepare("SELECT * FROM centres WHERE id = ?").get(appRow.centre_id);
    const pres = presenceOf(p.otrId, p.examId);
    const fpCount = db.prepare("SELECT COUNT(*) AS c FROM candidate_fingerprints WHERE otr_id = ?").get(p.otrId).c;
    const docPhoto = db.prepare(
      "SELECT file_data FROM candidate_documents WHERE otr_id = ? AND doc_type = 'PHOTO' ORDER BY created_at DESC LIMIT 1"
    ).get(p.otrId);
    res.json({
      valid: true,
      kind: "CANDIDATE",
      pass,
      candidate: cand,
      profile: prof,
      registrationPhoto: appRow.reg_photo_data || docPhoto?.file_data || prof?.photo_data || null,
      otrPhoto: prof?.photo_data || null,
      application: appRow,
      exam,
      centre,
      lab,
      presence: pres,
      fingerprintEnrolled: fpCount,
    });
    return;
  }
  if (p.typ === "STAFF_BP" || p.typ === "STAFF_ID") {
    const staff = db.prepare("SELECT id, full_name, mobile, role_applied, centre_id, status, photo_data FROM staff WHERE id = ?").get(p.staffId);
    const asg = db.prepare("SELECT * FROM staff_assignments WHERE id = ?").get(p.assignmentId);
    res.json({ valid: true, kind: "STAFF", pass, staff, assignment: asg });
    return;
  }
  res.status(400).json({ error: "UNKNOWN_PASS_TYPE" });
});

app.post("/api/gate/access-decision", auth, (req, res) => {
  const { token, livePhoto, liveFingerprint, stage, override, overrideReason } = req.body || {};
  const v = verifyToken(token);
  if (!v.ok) return res.status(400).json({ error: v.reason });
  const p = v.payload;
  const deviceId = req.user.lab_id ? "DEV-" + req.user.lab_id : req.user.gate_id ? "DEV-" + req.user.gate_id : "DEV-UNKNOWN";
  const eventKind = stage === "CLASSROOM" ? "CLASSROOM_PRESENCE" : "CENTRE_ENTRY";

  if (p.typ === "CANDIDATE_BP") {
    const appRow = db.prepare("SELECT * FROM applications WHERE id = ?").get(p.applicationId);
    if (!appRow?.centre_id) return res.status(400).json({ error: "ADMIT_CARD_REQUIRED" });
    if (eventKind === "CLASSROOM_PRESENCE") {
      const gateOk = presenceOf(p.otrId, p.examId);
      if (gateOk.state === "EXAM_REGISTERED" && !override) {
        return res.status(400).json({ error: "CENTRE_ENTRY_REQUIRED" });
      }
    }
    const prof = db.prepare("SELECT face_hash FROM candidate_profiles WHERE otr_id = ?").get(p.otrId);
    let face = eventKind === "CLASSROOM_PRESENCE"
      ? faceOutcome(prof?.face_hash, livePhoto)
      : faceMatchCandidate(p.otrId, p.applicationId, livePhoto);
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

    let fingerprint = { score: null, klass: "SKIPPED", reason: "CLASSROOM_FACE_ONLY" };
    if (eventKind === "CENTRE_ENTRY") {
      if (!liveFingerprint) {
        fingerprint = { score: null, klass: "SKIPPED", reason: "FACE_GATE_AUTO" };
      } else {
      fingerprint = fingerprintOutcome(p.otrId, liveFingerprint);
      if (override && ["SUPER_ADMIN", "CENTRE_HEAD", "BIOMETRIC_OPERATOR", "SECURITY_OPERATOR"].includes(req.user.role)) {
        fingerprint = { ...fingerprint, klass: "VERIFIED", reason: "MANUAL_OVERRIDE" };
      } else if (fingerprint.klass === "MISMATCH") {
        const alertId = db.newId("ALR");
        db.prepare(
          `INSERT INTO alerts (id, type, severity, centre_id, message) VALUES (?,?,?,?,?)`
        ).run(alertId, "FINGERPRINT_MISMATCH", "HIGH", p.centreId, `Fingerprint mismatch at centre for ${p.otrId}`);
        const deniedId = db.newId("ACS");
        db.prepare(
          `INSERT INTO access_events (id, event_kind, subject_kind, subject_id, application_id, exam_id, centre_id, lab_id, gate_id, device_id, result, face_score, face_class, reason_code)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(deniedId, eventKind, "CANDIDATE", p.otrId, p.applicationId, p.examId, p.centreId, req.user.lab_id, req.user.gate_id, deviceId, "DENIED", face.score, face.klass, fingerprint.reason);
        db.prepare("UPDATE access_events SET fp_score = ?, fp_class = ?, fp_finger = ? WHERE id = ?").run(
          fingerprint.score, fingerprint.klass, fingerprint.finger || null, deniedId
        );
        db.emitAudit({ event_type: "FingerprintVerification", entity_id: p.otrId, result: "MISMATCH", actor_id: req.user.id, actor_role: req.user.role, centre_id: p.centreId, device_id: deviceId });
        return res.json({ decision: "DENIED", face, fingerprint, eventId: deniedId });
      } else if (fingerprint.klass === "BORDERLINE" && !override) {
        const reviewId = db.newId("ACS");
        db.prepare(
          `INSERT INTO access_events (id, event_kind, subject_kind, subject_id, application_id, exam_id, centre_id, lab_id, gate_id, device_id, result, face_score, face_class, reason_code)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(reviewId, eventKind, "CANDIDATE", p.otrId, p.applicationId, p.examId, p.centreId, req.user.lab_id, req.user.gate_id, deviceId, "REVIEW", face.score, face.klass, "FP_BORDERLINE");
        db.prepare("UPDATE access_events SET fp_score = ?, fp_class = ?, fp_finger = ? WHERE id = ?").run(
          fingerprint.score, fingerprint.klass, fingerprint.finger || null, reviewId
        );
        return res.json({ decision: "REVIEW", face, fingerprint, eventId: reviewId, message: "Fingerprint needs secondary check" });
      }
      }
    }

    const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(appRow.exam_id);
    const assignedLabId = eventKind === "CLASSROOM_PRESENCE" && req.user.lab_id
      ? req.user.lab_id
      : assignLabOnFace(appRow, eventKind === "CLASSROOM_PRESENCE" ? (req.user.lab_id || null) : appRow.lab_id);
    if (eventKind === "CLASSROOM_PRESENCE" && assignedLabId) {
      ensureClassroomDevice(db.prepare("SELECT * FROM labs WHERE id = ?").get(assignedLabId));
    }
    let classroom = null;
    if (eventKind === "CLASSROOM_PRESENCE" && assignedLabId) {
      classroom = applyClassroomSeat(appRow, assignedLabId, exam);
    }
    const labRow = assignedLabId ? db.prepare("SELECT * FROM labs WHERE id = ?").get(assignedLabId) : null;
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
      appRow.centre_id,
      assignedLabId,
      eventKind === "CENTRE_ENTRY" ? req.user.gate_id : null,
      deviceId,
      "GRANTED",
      face.score,
      face.klass,
      override ? "MANUAL_OVERRIDE" : face.reason
    );
    if (eventKind === "CENTRE_ENTRY") {
      db.prepare("UPDATE access_events SET fp_score = ?, fp_class = ?, fp_finger = ? WHERE id = ?").run(
        fingerprint.score, fingerprint.klass, fingerprint.finger || null, grantedId
      );
      db.prepare("UPDATE applications SET fingerprint_at = datetime('now') WHERE id = ?").run(appRow.id);
      db.prepare(
        `INSERT INTO exam_fingerprints (id, otr_id, exam_id, application_id, centre_id, event_id, live_image, matched_hand, matched_finger, score, klass)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        db.newId("EFP"),
        p.otrId,
        appRow.exam_id,
        appRow.id,
        appRow.centre_id,
        grantedId,
        liveFingerprint || null,
        fingerprint.hand || null,
        fingerprint.finger || null,
        fingerprint.score,
        fingerprint.klass
      );
      db.emitAudit({ event_type: "FingerprintVerification", entity_id: p.otrId, result: fingerprint.klass, actor_id: req.user.id, centre_id: appRow.centre_id, device_id: deviceId, payload: { finger: fingerprint.finger, score: fingerprint.score } });
    }
    db.emitAudit({
      event_type: eventKind === "CLASSROOM_PRESENCE" ? "ClassroomPresenceConfirmed" : "AccessGranted",
      entity_id: p.otrId,
      actor_id: req.user.id,
      actor_role: req.user.role,
      centre_id: appRow.centre_id,
      device_id: deviceId,
      result: "GRANTED",
      correlation_id: grantedId,
      payload: { labId: assignedLabId, seat: classroom?.seat || null, examMode: classroom?.examMode || exam?.mode, fingerprint, overrideReason },
    });
    db.emitAudit({ event_type: "BoardingPassValidated", entity_id: p.passId, result: eventKind });
    pingBoundDevice(req.user);
    const cand = db.prepare("SELECT full_name FROM candidates WHERE otr_id = ?").get(p.otrId);
    const occ = assignedLabId ? classroomOccupancy(appRow.exam_id, assignedLabId) : null;
    if (classroom && occ) classroom = { ...classroom, ...occ, syncedAt: new Date().toISOString() };
    const seatBit = classroom?.examMode === "CBT" && classroom.seat ? ` · seat ${classroom.seat}` : "";
    return res.json({
      decision: "GRANTED",
      face,
      fingerprint,
      eventId: grantedId,
      assignedLab: labRow,
      classroom,
      examMode: String(exam?.mode || "OFFLINE").toUpperCase(),
      syncedAt: new Date().toISOString(),
      headline: eventKind === "CLASSROOM_PRESENCE"
        ? `${p.otrId} – ${cand.full_name} – CLASSROOM PRESENT – ${labRow?.name || assignedLabId}${seatBit}`
        : `${p.otrId} – ${cand.full_name} – GATE OPEN – face matched to OTR and registration photo – proceed`,
      presence: presenceOf(p.otrId, p.examId),
    });
  }

  if (p.typ === "STAFF_BP" || p.typ === "STAFF_ID") {
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
  const fingerprintMatched = centreId
    ? db.prepare("SELECT COUNT(*) AS c FROM exam_fingerprints WHERE exam_id = ? AND centre_id = ? AND klass = 'VERIFIED'").get(examId, centreId).c
    : db.prepare("SELECT COUNT(*) AS c FROM exam_fingerprints WHERE exam_id = ? AND klass = 'VERIFIED'").get(examId).c;
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
  const lastClassroomSql = centreId
    ? db.prepare(
      `SELECT ae.created_at, ae.subject_id AS otr_id, ae.lab_id, ae.device_id, c.full_name, a.seat_no, l.name AS lab_name
       FROM access_events ae
       LEFT JOIN candidates c ON c.otr_id = ae.subject_id
       LEFT JOIN applications a ON a.id = ae.application_id
       LEFT JOIN labs l ON l.id = ae.lab_id
       WHERE ae.exam_id = ? AND ae.event_kind = 'CLASSROOM_PRESENCE' AND ae.result = 'GRANTED' AND ae.centre_id = ?
       ORDER BY ae.created_at DESC LIMIT 10`
    )
    : db.prepare(
      `SELECT ae.created_at, ae.subject_id AS otr_id, ae.lab_id, ae.device_id, c.full_name, a.seat_no, l.name AS lab_name
       FROM access_events ae
       LEFT JOIN candidates c ON c.otr_id = ae.subject_id
       LEFT JOIN applications a ON a.id = ae.application_id
       LEFT JOIN labs l ON l.id = ae.lab_id
       WHERE ae.exam_id = ? AND ae.event_kind = 'CLASSROOM_PRESENCE' AND ae.result = 'GRANTED'
       ORDER BY ae.created_at DESC LIMIT 10`
    );
  const lastClassroom = centreId ? lastClassroomSql.all(examId, centreId) : lastClassroomSql.all(examId);
  res.json({
    examId,
    examName: exam.name,
    examSlug: exam.slug,
    examMode: String(exam.mode || "OFFLINE").toUpperCase(),
    lifecycle: exam.lifecycle,
    centreId,
    centreName: centre?.name || "All centres",
    totalApps: appSql.c,
    centreEntered,
    classroomPresent,
    fingerprintMatched,
    centreEnteredOnly: Math.max(0, centreEntered - classroomPresent),
    denied,
    staffActive,
    staffPending,
    openAlerts,
    devices,
    lastClassroom,
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
    ensureClassroomDevice(lab);
    const present = db.prepare(
      `SELECT COUNT(DISTINCT subject_id) AS c FROM access_events
       WHERE exam_id = ? AND event_kind = 'CLASSROOM_PRESENCE' AND result = 'GRANTED' AND lab_id = ?`
    ).get(examId, lab.id).c;
    const device = db.prepare("SELECT * FROM devices WHERE lab_id = ? AND kind = 'CLASSROOM'").get(lab.id);
    const lastAt = db.prepare(
      `SELECT MAX(created_at) AS t FROM access_events
       WHERE exam_id = ? AND event_kind = 'CLASSROOM_PRESENCE' AND result = 'GRANTED' AND lab_id = ?`
    ).get(examId, lab.id).t;
    return {
      ...lab,
      present,
      occupancy: lab.capacity ? Math.round((present / lab.capacity) * 100) : 0,
      deviceId: device?.id || null,
      deviceStatus: device?.status || "UNKNOWN",
      lastSync: device?.last_sync || null,
      lastPresentAt: lastAt || null,
    };
  });
  res.json(out);
});

app.get("/api/live/students", auth, (req, res) => {
  const examId = resolveExam(req)?.id;
  const centreId = scopedCentre(req);
  const apps = centreId
    ? db.prepare(
      `SELECT a.*, c.full_name, c.mobile, e.name AS exam_name, e.mode AS exam_mode, lab.name AS lab_name
       FROM applications a
       JOIN candidates c ON c.otr_id = a.otr_id
       JOIN exams e ON e.id = a.exam_id
       LEFT JOIN labs lab ON lab.id = a.lab_id
       WHERE a.exam_id = ? AND a.centre_id = ?`
    ).all(examId, centreId)
    : db.prepare(
      `SELECT a.*, c.full_name, c.mobile, e.name AS exam_name, e.mode AS exam_mode, lab.name AS lab_name
       FROM applications a
       JOIN candidates c ON c.otr_id = a.otr_id
       JOIN exams e ON e.id = a.exam_id
       LEFT JOIN labs lab ON lab.id = a.lab_id
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
  let rows = db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 400").all();
  const examId = String(req.query.examId || "");
  const q = String(req.query.q || "").trim().toLowerCase();
  if (examId) rows = rows.filter((r) => r.entity_id === examId || String(r.payload_json || "").includes(examId));
  if (q) rows = rows.filter((r) => Object.values(r).join(" ").toLowerCase().includes(q));
  res.json(rows);
});

app.get("/api/reports/access", auth, (req, res) => {
  let rows = db.prepare("SELECT * FROM access_events ORDER BY created_at DESC LIMIT 800").all();
  const examId = String(req.query.examId || "");
  const centreId = String(req.query.centreId || "");
  const q = String(req.query.q || "").trim().toLowerCase();
  if (examId) rows = rows.filter((r) => r.exam_id === examId);
  if (centreId) rows = rows.filter((r) => r.centre_id === centreId);
  if (q) rows = rows.filter((r) => Object.values(r).join(" ").toLowerCase().includes(q));
  res.json(rows);
});

app.get("/api/centres", auth, (req, res) => {
  const centreId = scopedCentre(req);
  let rows;
  if (centreId && req.user.role !== "SUPER_ADMIN") {
    rows = db.prepare("SELECT * FROM centres WHERE id = ?").all(centreId);
  } else {
    rows = db.prepare("SELECT * FROM centres").all();
    const examId = String(req.query.examId || "");
    const q = String(req.query.q || "").trim().toLowerCase();
    const pick = String(req.query.centreId || "");
    if (examId) {
      const ids = new Set(db.prepare("SELECT centre_id FROM exam_centres WHERE exam_id = ?").all(examId).map((r) => r.centre_id));
      rows = rows.filter((c) => ids.has(c.id));
    }
    if (pick) rows = rows.filter((c) => c.id === pick);
    if (q) rows = rows.filter((c) => Object.values(c).join(" ").toLowerCase().includes(q));
  }
  res.json(rows.map((c) => {
    const { download_key_hash, ...rest } = c;
    return { ...rest, hasDownloadKey: Boolean(download_key_hash) };
  }));
});

app.get("/api/admin/overview", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const examRows = db.prepare("SELECT * FROM exams ORDER BY exam_date").all().map((e) => ({
    ...e,
    ...examDeskStats(e.id),
    registrationStatus: registrationStatus(e),
  }));
  const gateIn = db.prepare(
    `SELECT COUNT(DISTINCT subject_id) AS c FROM access_events WHERE event_kind = 'CENTRE_ENTRY' AND result = 'GRANTED'`
  ).get().c;
  const present = db.prepare(
    `SELECT COUNT(DISTINCT subject_id) AS c FROM access_events WHERE event_kind = 'CLASSROOM_PRESENCE' AND result = 'GRANTED'`
  ).get().c;
  const denied = db.prepare(`SELECT COUNT(*) AS c FROM access_events WHERE result = 'DENIED'`).get().c;
  const admitIssued = examRows.reduce((n, e) => n + (e.admitIssued || 0), 0);
  const pendingAdmit = examRows.reduce((n, e) => n + (e.pendingAdmit || 0), 0);
  const openPapers = examRows.filter((e) => e.registrationStatus === "OPEN").length;
  const insights = [];
  if (pendingAdmit) insights.push({ level: "warn", text: `${pendingAdmit} applications waiting for boarding-pass allotment.` });
  if (openPapers) insights.push({ level: "ok", text: `${openPapers} paper(s) currently in the registration window.` });
  if (examRows.filter((e) => e.lifecycle === "LIVE").length) {
    insights.push({ level: "ok", text: "Live papers are on Sentinel Gate. Face scan assigns the lab." });
  }
  if (!examRows.length) insights.push({ level: "warn", text: "No papers yet. Open Paper Forge to create one." });
  if (denied) insights.push({ level: "bad", text: `${denied} denied access events — review Audit Spine.` });
  res.json({
    exams: examRows.length,
    centres: db.prepare("SELECT COUNT(*) AS c FROM centres").get().c,
    users: db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
    candidates: db.prepare("SELECT COUNT(*) AS c FROM candidates").get().c,
    applications: db.prepare("SELECT COUNT(*) AS c FROM applications").get().c,
    staffPending: db.prepare("SELECT COUNT(*) AS c FROM staff WHERE status = 'PENDING'").get().c,
    devices: db.prepare("SELECT COUNT(*) AS c FROM devices").get().c,
    otrUnassigned: db.prepare(
      `SELECT COUNT(*) AS c FROM candidates c
       WHERE NOT EXISTS (SELECT 1 FROM applications a WHERE a.otr_id = c.otr_id)`
    ).get().c,
    pipeline: {
      identity: db.prepare("SELECT COUNT(*) AS c FROM candidates").get().c,
      applied: db.prepare("SELECT COUNT(*) AS c FROM applications").get().c,
      boarding: admitIssued,
      gate: gateIn,
      present,
    },
    pendingAdmit,
    openPapers,
    denied,
    exceptions: db.prepare("SELECT COUNT(*) AS c FROM allocation_exceptions WHERE status = 'OPEN'").get().c,
    allocated: db.prepare("SELECT COUNT(*) AS c FROM applications WHERE centre_id IS NOT NULL AND centre_id != ''").get().c,
    insights,
    examRows,
  });
});

app.get("/api/admin/exams/:id/desk", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const exam = db.prepare("SELECT * FROM exams WHERE id = ? OR UPPER(slug)=UPPER(?)").get(req.params.id, req.params.id);
  if (!exam) return res.status(404).json({ error: "EXAM_NOT_FOUND" });
  const q = String(req.query.q || "").trim();
  let students;
  if (q) {
    const like = "%" + q + "%";
    students = db.prepare(
      `SELECT a.id AS application_id, a.status, a.centre_id, a.created_at, a.shift_id, a.roll_no, a.lab_id, a.admit_issued_at, a.seat_no, a.classroom_at,
              c.otr_id, c.full_name, c.mobile, c.email, c.identity_status,
              ctr.name AS centre_name, lab.name AS lab_name, bp.token AS admit_token
       FROM applications a
       JOIN candidates c ON c.otr_id = a.otr_id
       LEFT JOIN centres ctr ON ctr.id = a.centre_id
       LEFT JOIN labs lab ON lab.id = a.lab_id
       LEFT JOIN boarding_passes bp ON bp.application_id = a.id AND bp.kind = 'CANDIDATE'
       WHERE a.exam_id = ? AND (c.full_name LIKE ? OR c.mobile LIKE ? OR c.otr_id LIKE ? OR IFNULL(a.roll_no,'') LIKE ?)
       ORDER BY c.full_name`
    ).all(exam.id, like, like, like, like);
  } else {
    students = db.prepare(
      `SELECT a.id AS application_id, a.status, a.centre_id, a.created_at, a.shift_id, a.roll_no, a.lab_id, a.admit_issued_at, a.seat_no, a.classroom_at,
              c.otr_id, c.full_name, c.mobile, c.email, c.identity_status,
              ctr.name AS centre_name, lab.name AS lab_name, bp.token AS admit_token
       FROM applications a
       JOIN candidates c ON c.otr_id = a.otr_id
       LEFT JOIN centres ctr ON ctr.id = a.centre_id
       LEFT JOIN labs lab ON lab.id = a.lab_id
       LEFT JOIN boarding_passes bp ON bp.application_id = a.id AND bp.kind = 'CANDIDATE'
       WHERE a.exam_id = ?
       ORDER BY c.full_name`
    ).all(exam.id);
  }
  const centres = db.prepare(
    `SELECT c.* FROM centres c JOIN exam_centres ec ON ec.centre_id = c.id WHERE ec.exam_id = ?`
  ).all(exam.id);
  const allCentres = db.prepare("SELECT * FROM centres ORDER BY name").all();
  const staff = db.prepare(
    `SELECT sa.*, s.full_name, s.mobile, s.role_applied, s.status AS staff_status, s.kind
     FROM staff_assignments sa
     JOIN staff s ON s.id = sa.staff_id
     WHERE sa.exam_id = ?
     ORDER BY s.full_name`
  ).all(exam.id);
  res.json({
    exam,
    stats: examDeskStats(exam.id),
    students,
    centres,
    allCentres,
    staff,
    registerPath: `/digi-exam/${exam.slug}`,
    registrationStatus: registrationStatus(exam),
  });
});

app.post("/api/admin/exams/:id/admit-cards", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(req.params.id);
  if (!exam) return res.status(404).json({ error: "EXAM_NOT_FOUND" });
  const centres = db.prepare(
    `SELECT c.* FROM centres c JOIN exam_centres ec ON ec.centre_id = c.id WHERE ec.exam_id = ?`
  ).all(exam.id);
  if (!centres.length) return res.status(400).json({ error: "LINK_CENTRES_FIRST" });
  for (const c of centres) ensureLabsForCentre(c.id);
  const apps = db.prepare("SELECT * FROM applications WHERE exam_id = ?").all(exam.id);
  let issued = 0;
  for (const app of apps) {
    let centreId = app.centre_id;
    if (!centreId) {
      const picked = pickCentreForAdmit(exam.id, centres);
      centreId = picked.id;
      db.prepare("UPDATE applications SET centre_id = ? WHERE id = ?").run(centreId, app.id);
    }
    ensureLabsForCentre(centreId);
    const fresh = db.prepare("SELECT * FROM applications WHERE id = ?").get(app.id);
    if (!fresh.roll_no) {
      db.prepare("UPDATE applications SET roll_no = ? WHERE id = ?").run(nextRollNo(exam), app.id);
    }
    db.prepare(
      "UPDATE applications SET status = 'ADMIT_ISSUED', admit_issued_at = datetime('now') WHERE id = ?"
    ).run(app.id);
    issueCandidatePass(app.id, app.otr_id, exam);
    issued++;
  }
  db.emitAudit({ event_type: "AdmitCardsIssued", entity_id: exam.id, actor_id: req.user.id, result: "OK", payload: { issued } });
  res.json({ issued, centres: centres.length });
});

app.get("/api/admin/applications/:id/boarding", auth, requireRoles("SUPER_ADMIN"), async (req, res) => {
  const appRow = db.prepare("SELECT * FROM applications WHERE id = ?").get(req.params.id);
  if (!appRow) return res.status(404).json({ error: "NOT_FOUND" });
  const cand = db.prepare("SELECT * FROM candidates WHERE otr_id = ?").get(appRow.otr_id);
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(appRow.exam_id);
  const centre = appRow.centre_id ? db.prepare("SELECT * FROM centres WHERE id = ?").get(appRow.centre_id) : null;
  const lab = appRow.lab_id ? db.prepare("SELECT * FROM labs WHERE id = ?").get(appRow.lab_id) : null;
  const pass = db.prepare("SELECT * FROM boarding_passes WHERE application_id = ?").get(appRow.id);
  const qrDataUrl = pass?.token
    ? await QRCode.toDataURL(pass.token, { width: 280, margin: 1, color: { dark: "#0b1a2e", light: "#ffffff" } })
    : null;
  res.json({
    passenger: cand.full_name,
    otrId: cand.otr_id,
    flight: exam.slug,
    examName: exam.name,
    date: exam.exam_date,
    reporting: exam.reporting_time,
    centre: centre?.name,
    city: centre?.city,
    seat: appRow.roll_no,
    seatNo: appRow.seat_no,
    examMode: String(exam.mode || "OFFLINE").toUpperCase(),
    lab: lab?.name,
    token: pass?.token,
    qrDataUrl,
    serial: pass?.id,
  });
});

app.post("/api/admin/exams/:id/centres", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(req.params.id);
  if (!exam) return res.status(404).json({ error: "EXAM_NOT_FOUND" });
  const centreId = req.body.centreId;
  if (!centreId) return res.status(400).json({ error: "CENTRE_REQUIRED" });
  db.prepare("INSERT OR IGNORE INTO exam_centres (exam_id, centre_id) VALUES (?,?)").run(exam.id, centreId);
  res.json({ ok: true });
});

app.get("/api/admin/otr", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  let rows = db.prepare(
    `SELECT c.otr_id, c.full_name, c.mobile, c.email, c.identity_status, c.created_at,
            GROUP_CONCAT(e.slug, ', ') AS exams,
            GROUP_CONCAT(DISTINCT a.exam_id) AS exam_ids,
            GROUP_CONCAT(DISTINCT a.centre_id) AS centre_ids
     FROM candidates c
     LEFT JOIN applications a ON a.otr_id = c.otr_id
     LEFT JOIN exams e ON e.id = a.exam_id
     GROUP BY c.otr_id
     ORDER BY c.created_at DESC`
  ).all();
  const q = String(req.query.q || "").trim().toLowerCase();
  const examId = String(req.query.examId || "").trim();
  const centreId = String(req.query.centreId || "").trim();
  if (q) {
    rows = rows.filter((r) => [r.otr_id, r.full_name, r.mobile, r.email].some((v) => String(v || "").toLowerCase().includes(q)));
  }
  if (examId) rows = rows.filter((r) => String(r.exam_ids || "").split(",").includes(examId));
  if (centreId) rows = rows.filter((r) => String(r.centre_ids || "").split(",").includes(centreId));
  res.json({ rows });
});

app.get("/api/admin/users", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const rows = db.prepare(
    "SELECT id, username, display_name, role, centre_id, lab_id, gate_id, status FROM users WHERE role != 'SUPER_ADMIN' ORDER BY role"
  ).all();
  res.json(rows.map((u) => {
    const exams = userExamRows(u.id);
    return { ...u, examIds: exams.map((e) => e.id), exams: exams.map((e) => e.slug).join(", ") };
  }));
});

app.post("/api/admin/users", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const { username, password, displayName, role, centreId, examIds } = req.body || {};
  if (!username || !password || !role) return res.status(400).json({ error: "MISSING_FIELDS" });
  if (role === "SUPER_ADMIN") return res.status(400).json({ error: "FORBIDDEN_ROLE" });
  const uname = String(username).trim();
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(uname)) return res.status(409).json({ error: "USERNAME_TAKEN" });
  let ids = Array.isArray(examIds) ? examIds.filter(Boolean) : [];
  if (!ids.length && centreId) {
    ids = db.prepare("SELECT exam_id AS id FROM exam_centres WHERE centre_id = ?").all(centreId).map((r) => r.id);
  }
  if ((role === "CLIENT" || role === "DEPARTMENT_OFFICER") && !ids.length) {
    return res.status(400).json({ error: "EXAM_REQUIRED" });
  }
  const id = db.newId("USR");
  db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, role, centre_id, lab_id, gate_id)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, uname, hashPassword(password), displayName || uname, role, centreId || null, null, null);
  bindUserExams(id, ids);
  db.emitAudit({ event_type: "UserCreated", entity_id: id, actor_id: req.user.id, actor_role: req.user.role, result: "OK", payload: { role, examIds: ids } });
  res.json({ id, username: uname, examIds: ids });
});

app.put("/api/admin/users/:id/exams", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user || user.role === "SUPER_ADMIN") return res.status(404).json({ error: "USER_NOT_FOUND" });
  const ids = Array.isArray(req.body?.examIds) ? req.body.examIds.filter(Boolean) : [];
  if ((user.role === "CLIENT" || user.role === "DEPARTMENT_OFFICER") && !ids.length) {
    return res.status(400).json({ error: "EXAM_REQUIRED" });
  }
  bindUserExams(user.id, ids);
  db.emitAudit({ event_type: "UserExamBind", entity_id: user.id, actor_id: req.user.id, actor_role: req.user.role, result: "OK", payload: { examIds: ids } });
  res.json({ id: user.id, examIds: ids, exams: userExamRows(user.id) });
});

app.delete("/api/admin/users/:id", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "CANNOT_DELETE_SELF" });
  const target = db.prepare("SELECT role FROM users WHERE id = ?").get(req.params.id);
  if (target?.role === "SUPER_ADMIN") return res.status(400).json({ error: "CANNOT_DELETE_ADMIN" });
  db.prepare("DELETE FROM exam_clients WHERE user_id = ?").run(req.params.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/admin/export/candidates", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const examId = req.query.examId;
  if (examId) {
    const rows = db.prepare(
      `SELECT c.otr_id, c.full_name, c.mobile, c.email, a.exam_id, e.slug, e.name AS exam_name, a.centre_id, a.status
       FROM applications a
       JOIN candidates c ON c.otr_id = a.otr_id
       JOIN exams e ON e.id = a.exam_id
       WHERE a.exam_id = ?`
    ).all(examId);
    return res.json({ examId, rows });
  }
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
  const examHint = req.body.examId;
  const exam = examHint
    ? db.prepare("SELECT * FROM exams WHERE id = ? OR UPPER(slug)=UPPER(?) OR UPPER(code)=UPPER(?)").get(examHint, examHint, examHint)
    : null;
  if (examHint && !exam) return res.status(404).json({ error: "EXAM_NOT_FOUND" });
  let created = 0;
  let linked = 0;
  let skipped = 0;
  const errors = [];
  for (const r of rows) {
    const mobile = cell(r, ["mobile", "phone", "mobileno", "mobile_no", "contact"]).replace(/\D/g, "");
    const fullName = cell(r, ["fullName", "fullname", "full_name", "name", "candidate", "student", "candidatename"]);
    const email = cell(r, ["email", "mail"]) || null;
    const address = cell(r, ["address", "addr"]) || null;
    if (!mobile || mobile.length < 10 || !fullName) {
      skipped++;
      continue;
    }
    let cand = db.prepare("SELECT * FROM candidates WHERE mobile = ?").get(mobile);
    if (!cand) {
      const otrId = nextOtrId();
      db.prepare("INSERT INTO candidates (otr_id, mobile, email, full_name, identity_status) VALUES (?,?,?,?,?)").run(
        otrId, mobile, email, fullName, "OTR_ACTIVE"
      );
      db.prepare("INSERT INTO candidate_profiles (otr_id, dob, gender, address) VALUES (?,?,?,?)").run(otrId, null, null, address);
      cand = db.prepare("SELECT * FROM candidates WHERE otr_id = ?").get(otrId);
      created++;
    } else if (fullName && cand.full_name !== fullName) {
      db.prepare("UPDATE candidates SET full_name = ? WHERE otr_id = ?").run(fullName, cand.otr_id);
    }
    if (!exam) continue;
    const dup = db.prepare("SELECT id FROM applications WHERE otr_id = ? AND exam_id = ?").get(cand.otr_id, exam.id);
    if (dup) continue;
    const shift = db.prepare("SELECT id FROM exam_shifts WHERE exam_id = ? LIMIT 1").get(exam.id);
    const id = db.newId("APP");
    try {
      db.prepare(
        `INSERT INTO applications (id, otr_id, exam_id, shift_id, centre_id, status) VALUES (?,?,?,?,?,?)`
      ).run(id, cand.otr_id, exam.id, shift?.id || null, null, "REGISTERED");
      linked++;
    } catch (err) {
      errors.push({ mobile, error: String(err.message || err) });
    }
  }
  db.emitAudit({
    event_type: "CandidatesImported",
    entity_id: exam?.id || "OTR",
    actor_id: req.user.id,
    actor_role: req.user.role,
    result: "OK",
    payload: { created, linked, skipped, examId: exam?.id },
  });
  res.json({ created, linked, skipped, errors, examId: exam?.id || null });
});

app.get("/api/admin/export/pack", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  res.json({
    exportedAt: new Date().toISOString(),
    exams: db.prepare("SELECT id, code, slug, name, exam_date, reporting_time, status, lifecycle FROM exams").all(),
    centres: db.prepare("SELECT id, name, city, state, capacity, status FROM centres").all(),
    labs: db.prepare("SELECT id, centre_id, name, building, floor, capacity FROM labs").all(),
    staff: db.prepare("SELECT id, full_name, mobile, email, role_applied, centre_id, status, kind FROM staff").all(),
    candidates: db.prepare(
      `SELECT c.otr_id, c.full_name, c.mobile, c.email, c.identity_status, a.exam_id, e.slug, a.centre_id, a.status AS application_status
       FROM candidates c
       LEFT JOIN applications a ON a.otr_id = c.otr_id
       LEFT JOIN exams e ON e.id = a.exam_id`
    ).all(),
    users: db.prepare("SELECT username, display_name, role, centre_id FROM users WHERE role != 'SUPER_ADMIN'").all(),
  });
});

app.get("/api/admin/export/staff", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  res.json({ rows: db.prepare("SELECT id, full_name, mobile, email, role_applied, centre_id, status, kind FROM staff").all() });
});

app.get("/api/admin/labs", auth, requireRoles("SUPER_ADMIN", "CENTRE_HEAD"), (req, res) => {
  let rows = db.prepare("SELECT * FROM labs").all();
  const centreId = String(req.query.centreId || "");
  const q = String(req.query.q || "").trim().toLowerCase();
  if (centreId) rows = rows.filter((l) => l.centre_id === centreId);
  if (q) rows = rows.filter((l) => Object.values(l).join(" ").toLowerCase().includes(q));
  res.json(rows);
});

app.post("/api/admin/labs", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const { name, centreId, building, floor, capacity } = req.body || {};
  if (!name || !centreId) return res.status(400).json({ error: "MISSING_FIELDS" });
  const id = db.newId("LAB");
  db.prepare("INSERT INTO labs (id, centre_id, name, building, floor, capacity) VALUES (?,?,?,?,?,?)").run(
    id, centreId, name, building || "", floor || "", Number(capacity) || 40
  );
  res.json({ id });
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
  const { name, examDate, registrationStart, registrationClose, reportingTime, mode, authority, examType } = req.body || {};
  if (!name || !examDate || !registrationStart || !registrationClose) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }
  const examMode = String(mode || "OFFLINE").toUpperCase() === "CBT" ? "CBT" : "OFFLINE";
  let examSlug = slugFromName(name);
  if (db.prepare("SELECT id FROM exams WHERE UPPER(slug)=? OR UPPER(code)=?").get(examSlug, examSlug)) {
    examSlug = examSlug.slice(0, 12) + db.newId("").slice(-4);
  }
  const id = db.newId("EXM");
  const life = registrationOpen({ registration_start: registrationStart, registration_close: registrationClose, lifecycle: "DRAFT" })
    ? "OPEN"
    : "DRAFT";
  db.prepare(
    `INSERT INTO exams (id, code, name, exam_date, reporting_time, status, slug, lifecycle, registration_start, registration_close, mode, authority, exam_type)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, examSlug, name, examDate, reportingTime || "08:30", "ACTIVE", examSlug, life, registrationStart, registrationClose, examMode, authority || "", examType || "Offline");
  db.prepare("INSERT INTO exam_shifts (id, exam_id, name, start_time, end_time) VALUES (?,?,?,?,?)").run(
    "SHIFT-" + examSlug, id, "Morning", "09:00", "12:00"
  );
  res.json({ id, slug: examSlug, registerPath: `/digi-exam/${examSlug}`, lifecycle: life, mode: examMode });
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
  if (!city || !state || !req.body.address) return res.status(400).json({ error: "MISSING_FIELDS" });
  const id = db.newId("CTR");
  db.prepare("INSERT INTO centres (id, name, address, city, state, capacity, status) VALUES (?,?,?,?,?,?,?)").run(
    id, name, req.body.address || "", city || "", state || "", Number(capacity) || 0, "ACTIVE"
  );
  res.json({ id });
});

app.post("/api/admin/centres/:id/download-key", auth, requireRoles("SUPER_ADMIN"), (req, res) => {
  const centre = db.prepare("SELECT * FROM centres WHERE id = ?").get(req.params.id);
  if (!centre) return res.status(404).json({ error: "CENTRE_NOT_FOUND" });
  const raw = "DSX-" + centre.id.replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase() + "-" + crypto.randomBytes(10).toString("hex").toUpperCase();
  const hash = hashPassword(raw);
  const hint = raw.slice(-4);
  db.prepare("UPDATE centres SET download_key_hash = ?, download_key_hint = ?, download_key_at = datetime('now') WHERE id = ?").run(hash, hint, centre.id);
  db.emitAudit({ event_type: "CentreDownloadKeyIssued", entity_id: centre.id, actor_id: req.user.id, actor_role: req.user.role, result: "OK" });
  res.json({
    centreId: centre.id,
    centreName: centre.name,
    downloadKey: raw,
    hint,
    note: "Give this key only to the centre main server / incharge. Gate and classroom devices must not store it. It is shown once.",
  });
});

function buildCentreExamPack(centreId, examId) {
  const centre = db.prepare("SELECT id, code, name, address, city, state, capacity FROM centres WHERE id = ?").get(centreId);
  const exam = db.prepare("SELECT id, code, slug, name, exam_date, reporting_time, mode, lifecycle FROM exams WHERE id = ?").get(examId);
  if (!centre || !exam) return null;
  const linked = db.prepare("SELECT 1 AS ok FROM exam_centres WHERE exam_id = ? AND centre_id = ?").get(examId, centreId);
  if (!linked) return { error: "CENTRE_NOT_ON_EXAM" };
  const labs = db.prepare("SELECT id, code, name, floor, capacity, lab_type FROM labs WHERE centre_id = ?").all(centreId);
  const gates = db.prepare("SELECT id, name, location FROM gates WHERE centre_id = ?").all(centreId);
  const devices = db.prepare("SELECT id, kind, lab_id, gate_id, status FROM devices WHERE centre_id = ?").all(centreId);
  const staff = db.prepare(
    `SELECT s.id, s.full_name, s.role_applied, s.status, sa.lab_id, sa.gate_id, sa.role
     FROM staff s
     LEFT JOIN staff_assignments sa ON sa.staff_id = s.id AND sa.exam_id = ?
     WHERE s.centre_id = ?`
  ).all(examId, centreId);
  const apps = db.prepare(
    `SELECT a.id, a.otr_id, a.roll_no, a.lab_id, a.seat_no, a.status, a.allocation_status,
            c.full_name, c.mobile, p.photo_data, p.face_hash
     FROM applications a
     JOIN candidates c ON c.otr_id = a.otr_id
     LEFT JOIN candidate_profiles p ON p.otr_id = a.otr_id
     WHERE a.exam_id = ? AND a.centre_id = ?`
  ).all(examId, centreId);
  const candidates = apps.map((a) => ({
    applicationId: a.id,
    otrId: a.otr_id,
    fullName: a.full_name,
    mobile: String(a.mobile || "").slice(0, 4) + "******",
    rollNo: a.roll_no,
    labId: a.lab_id,
    seatNo: String(exam.mode || "").toUpperCase() === "CBT" ? a.seat_no : null,
    status: a.status,
    faceHash: a.face_hash,
    photoData: a.photo_data,
    fingerprints: db.prepare("SELECT hand, finger, print_hash FROM candidate_fingerprints WHERE otr_id = ?").all(a.otr_id),
    pass: db.prepare("SELECT id, kind, status FROM boarding_passes WHERE application_id = ? AND status = 'ACTIVE'").get(a.id),
  }));
  return {
    packFor: "CENTRE_MAIN_SERVER",
    notFor: "GATE_OR_CLASSROOM_DEVICES",
    downloadedAt: new Date().toISOString(),
    exam,
    centre,
    labs,
    gates,
    devices,
    staff,
    candidateCount: candidates.length,
    candidates,
  };
}

app.post("/api/centre/download-pack", (req, res) => {
  const { centreId, downloadKey, examId } = req.body || {};
  if (!centreId || !downloadKey || !examId) return res.status(400).json({ error: "CENTRE_KEY_EXAM_REQUIRED" });
  const centre = db.prepare("SELECT * FROM centres WHERE id = ?").get(centreId);
  if (!centre?.download_key_hash) return res.status(403).json({ error: "NO_DOWNLOAD_KEY" });
  if (!verifyPassword(String(downloadKey), centre.download_key_hash)) {
    db.emitAudit({ event_type: "CentrePackDenied", entity_id: centreId, result: "BAD_KEY" });
    return res.status(403).json({ error: "INVALID_CENTRE_KEY" });
  }
  const pack = buildCentreExamPack(centreId, examId);
  if (!pack) return res.status(404).json({ error: "NOT_FOUND" });
  if (pack.error) return res.status(400).json({ error: pack.error });
  db.emitAudit({ event_type: "CentrePackDownloaded", entity_id: centreId, result: "OK", payload: { examId, count: pack.candidateCount } });
  res.json(pack);
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

registerSrsAdmin(app, {
  getDb: () => db,
  auth,
  requireRoles,
  cell,
  ensureLabsForCentre,
  pickLabForStudent,
  issueCandidatePass,
  nextRollNo,
  examDeskStats,
});
registerDashboard(app, {
  getDb: () => db,
  auth,
  allowedExamIds,
  scopedCentre,
  presenceOf,
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
      console.log(`Digisecurexam running on http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
