const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");
const { hashPassword, signPayload } = require("./token");

const dataDir = path.join(__dirname, "..", "data");
const dbPathNew = path.join(dataDir, "digi-exam.sqlite");
const dbPathOld = path.join(dataDir, "eialm.sqlite");
const dbPath = fs.existsSync(dbPathOld) && !fs.existsSync(dbPathNew) ? dbPathOld : dbPathNew;

function nowId(prefix) {
  const n = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}${n}${r}`;
}

function emit(db, event) {
  const id = event.id || nowId("EVT");
  db.prepare(
    `INSERT INTO audit_events (
      id, event_type, entity_id, actor_id, actor_role, centre_id, device_id,
      result, reason_code, correlation_id, payload_json, created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`
  ).run(
    id,
    event.event_type,
    event.entity_id || null,
    event.actor_id || null,
    event.actor_role || null,
    event.centre_id || null,
    event.device_id || null,
    event.result || null,
    event.reason_code || null,
    event.correlation_id || null,
    JSON.stringify(event.payload || {})
  );
  return id;
}

function createSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      centre_id TEXT,
      lab_id TEXT,
      gate_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_configurations (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS candidates (
      otr_id TEXT PRIMARY KEY,
      mobile TEXT UNIQUE NOT NULL,
      email TEXT,
      full_name TEXT NOT NULL,
      identity_status TEXT NOT NULL DEFAULT 'REGISTERED',
      consent INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidate_profiles (
      otr_id TEXT PRIMARY KEY,
      dob TEXT,
      gender TEXT,
      address TEXT,
      photo_data TEXT,
      face_hash TEXT,
      FOREIGN KEY (otr_id) REFERENCES candidates(otr_id)
    );

    CREATE TABLE IF NOT EXISTS candidate_documents (
      id TEXT PRIMARY KEY,
      otr_id TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (otr_id) REFERENCES candidates(otr_id)
    );

    CREATE TABLE IF NOT EXISTS centres (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      capacity INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE'
    );

    CREATE TABLE IF NOT EXISTS labs (
      id TEXT PRIMARY KEY,
      centre_id TEXT NOT NULL,
      name TEXT NOT NULL,
      building TEXT,
      floor TEXT,
      capacity INTEGER NOT NULL DEFAULT 40,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      FOREIGN KEY (centre_id) REFERENCES centres(id)
    );

    CREATE TABLE IF NOT EXISTS gates (
      id TEXT PRIMARY KEY,
      centre_id TEXT NOT NULL,
      name TEXT NOT NULL,
      location TEXT,
      FOREIGN KEY (centre_id) REFERENCES centres(id)
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      centre_id TEXT,
      lab_id TEXT,
      gate_id TEXT,
      status TEXT NOT NULL DEFAULT 'ONLINE',
      last_sync TEXT,
      health TEXT DEFAULT 'OK'
    );

    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      exam_date TEXT NOT NULL,
      reporting_time TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      slug TEXT,
      lifecycle TEXT NOT NULL DEFAULT 'DRAFT'
    );

    CREATE TABLE IF NOT EXISTS exam_clients (
      exam_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (exam_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS exam_centres (
      exam_id TEXT NOT NULL,
      centre_id TEXT NOT NULL,
      PRIMARY KEY (exam_id, centre_id)
    );

    CREATE TABLE IF NOT EXISTS exam_shifts (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      FOREIGN KEY (exam_id) REFERENCES exams(id)
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      otr_id TEXT NOT NULL,
      exam_id TEXT NOT NULL,
      shift_id TEXT,
      centre_id TEXT,
      status TEXT NOT NULL DEFAULT 'APPLIED',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(otr_id, exam_id),
      FOREIGN KEY (otr_id) REFERENCES candidates(otr_id),
      FOREIGN KEY (exam_id) REFERENCES exams(id)
    );

    CREATE TABLE IF NOT EXISTS boarding_passes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      application_id TEXT,
      staff_assignment_id TEXT,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      qr_payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      mobile TEXT UNIQUE NOT NULL,
      email TEXT,
      role_applied TEXT NOT NULL,
      centre_id TEXT,
      photo_data TEXT,
      face_hash TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS staff_approvals (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      comments TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (staff_id) REFERENCES staff(id)
    );

    CREATE TABLE IF NOT EXISTS staff_assignments (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      exam_id TEXT NOT NULL,
      centre_id TEXT NOT NULL,
      lab_id TEXT,
      gate_id TEXT,
      role TEXT NOT NULL,
      shift_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      FOREIGN KEY (staff_id) REFERENCES staff(id)
    );

    CREATE TABLE IF NOT EXISTS access_events (
      id TEXT PRIMARY KEY,
      event_kind TEXT NOT NULL,
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      application_id TEXT,
      exam_id TEXT,
      centre_id TEXT,
      lab_id TEXT,
      gate_id TEXT,
      device_id TEXT,
      result TEXT NOT NULL,
      face_score INTEGER,
      face_class TEXT,
      reason_code TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      centre_id TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      entity_id TEXT,
      actor_id TEXT,
      actor_role TEXT,
      centre_id TEXT,
      device_id TEXT,
      result TEXT,
      reason_code TEXT,
      correlation_id TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function seedIfEmpty(db) {
  const n = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (n > 0) return;

  const pw = hashPassword("Pilot@123");

  const centreId = "CTR-DEL-01";
  db.prepare(
    `INSERT INTO centres (id, name, address, city, state, capacity, status)
     VALUES (?,?,?,?,?,?,?)`
  ).run(centreId, "Delhi Examination Centre 01", "Sector 12, Dwarka", "New Delhi", "DL", 480, "ACTIVE");

  db.prepare("INSERT INTO labs (id, centre_id, name, building, floor, capacity) VALUES (?,?,?,?,?,?)").run(
    "LAB-01", centreId, "Computer Lab 01", "Block A", "1", 40
  );
  db.prepare("INSERT INTO labs (id, centre_id, name, building, floor, capacity) VALUES (?,?,?,?,?,?)").run(
    "LAB-03", centreId, "Computer Lab 03", "Block A", "2", 40
  );
  db.prepare("INSERT INTO gates (id, centre_id, name, location) VALUES (?,?,?,?)").run(
    "GATE-A", centreId, "Main Gate A", "Front plaza"
  );

  db.prepare("INSERT INTO devices (id, kind, centre_id, gate_id, status) VALUES (?,?,?,?,?)").run(
    "DEV-GATE-A", "GATE", centreId, "GATE-A", "ONLINE"
  );
  db.prepare("INSERT INTO devices (id, kind, centre_id, lab_id, status) VALUES (?,?,?,?,?)").run(
    "DEV-LAB-01", "CLASSROOM", centreId, "LAB-01", "ONLINE"
  );
  db.prepare("INSERT INTO devices (id, kind, centre_id, lab_id, status) VALUES (?,?,?,?,?)").run(
    "DEV-LAB-03", "CLASSROOM", centreId, "LAB-03", "ONLINE"
  );

  const users = [
    ["USR-ADMIN", "Sai_2026", "Main Admin", "SUPER_ADMIN", null, null, null],
    ["USR-CLIENT", "client", "Client Control Room", "CLIENT", null, null, null],
    ["USR-HEAD", "supervisor", "Centre Supervisor - Delhi 01", "CENTRE_HEAD", centreId, null, null],
    ["USR-GATE", "gate", "Security Operator Gate A", "SECURITY_OPERATOR", centreId, null, "GATE-A"],
    ["USR-CLASS", "classroom", "Biometric Operator Lab 03", "BIOMETRIC_OPERATOR", centreId, "LAB-03", null],
    ["USR-OP", "operator", "Centre Operator", "CENTRE_OPERATOR", centreId, null, null],
  ];
  const insU = db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, role, centre_id, lab_id, gate_id)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  for (const u of users) {
    const hash = u[1] === "Sai_2026" ? hashPassword("Sai@2026") : pw;
    insU.run(u[0], u[1], hash, u[2], u[3], u[4], u[5], u[6]);
  }

  const examId = "EXM-PILOT-2026";
  db.prepare("INSERT INTO exams (id, code, name, exam_date, reporting_time, status) VALUES (?,?,?,?,?,?)").run(
    examId, "PILOT-2026", "National Pilot Examination 2026", "2026-10-12", "08:30", "ACTIVE"
  );
  db.prepare("INSERT INTO exam_shifts (id, exam_id, name, start_time, end_time) VALUES (?,?,?,?,?)").run(
    "SHIFT-M", examId, "Morning", "09:00", "12:00"
  );

  db.prepare(
    `INSERT INTO system_configurations (key, value) VALUES
     ('face.passThreshold','70'),
     ('face.borderlineThreshold','50'),
     ('gate.windowMinutes','180'),
     ('otp.demo','123456')`
  ).run();

  const cand = db.prepare(
    `INSERT INTO candidates (otr_id, mobile, email, full_name, identity_status) VALUES (?,?,?,?,?)`
  );
  const prof = db.prepare(
    `INSERT INTO candidate_profiles (otr_id, dob, gender, address) VALUES (?,?,?,?)`
  );
  cand.run("OTR10241", "9810000001", "rahul@example.com", "Rahul Sharma", "OTR_ACTIVE");
  prof.run("OTR10241", "1999-04-12", "M", "Dwarka, New Delhi");
  cand.run("OTR10242", "9810000002", "priya@example.com", "Priya Verma", "OTR_ACTIVE");
  prof.run("OTR10242", "2000-08-21", "F", "Rohini, New Delhi");
  cand.run("OTR10243", "9810000003", "amit@example.com", "Amit Singh", "OTR_ACTIVE");
  prof.run("OTR10243", "1998-01-03", "M", "Noida, UP");

  const appId = "APP-10241-PILOT";
  db.prepare(
    `INSERT INTO applications (id, otr_id, exam_id, shift_id, centre_id, status) VALUES (?,?,?,?,?,?)`
  ).run(appId, "OTR10241", examId, "SHIFT-M", centreId, "CENTRE_AUTHORIZED");
  db.prepare(
    `INSERT INTO applications (id, otr_id, exam_id, shift_id, centre_id, status) VALUES (?,?,?,?,?,?)`
  ).run("APP-10242-PILOT", "OTR10242", examId, "SHIFT-M", centreId, "CENTRE_AUTHORIZED");

  function issuePass(passId, applicationId, otrId) {
    const payload = {
      typ: "CANDIDATE_BP",
      passId,
      applicationId,
      otrId,
      examId,
      centreId,
      date: "2026-10-12",
    };
    const token = signPayload(payload);
    db.prepare(
      `INSERT INTO boarding_passes (id, kind, application_id, token, status, qr_payload) VALUES (?,?,?,?,?,?)`
    ).run(passId, "CANDIDATE", applicationId, token, "ACTIVE", token);
    emit(db, { event_type: "BoardingPassGenerated", entity_id: passId, actor_id: "USR-ADMIN", actor_role: "SUPER_ADMIN", payload });
  }
  issuePass("BP-C-10241", appId, "OTR10241");
  issuePass("BP-C-10242", "APP-10242-PILOT", "OTR10242");

  db.prepare(
    `INSERT INTO staff (id, full_name, mobile, email, role_applied, centre_id, status) VALUES (?,?,?,?,?,?,?)`
  ).run("STF-9001", "Neha Gupta", "9820000001", "neha@centre.local", "INVIGILATOR", centreId, "PENDING");
  db.prepare(
    `INSERT INTO staff (id, full_name, mobile, email, role_applied, centre_id, status) VALUES (?,?,?,?,?,?,?)`
  ).run("STF-9002", "Vikram Yadav", "9820000002", "vikram@centre.local", "SECURITY_OPERATOR", centreId, "ACTIVE");

  const asg = "ASG-9002-PILOT";
  db.prepare(
    `INSERT INTO staff_assignments (id, staff_id, exam_id, centre_id, gate_id, role, shift_id, status)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(asg, "STF-9002", examId, centreId, "GATE-A", "SECURITY_OPERATOR", "SHIFT-M", "ACTIVE");
  const staffPayload = { typ: "STAFF_BP", passId: "BP-S-9002", assignmentId: asg, staffId: "STF-9002", examId, centreId };
  const staffToken = signPayload(staffPayload);
  db.prepare(
    `INSERT INTO boarding_passes (id, kind, staff_assignment_id, token, status, qr_payload) VALUES (?,?,?,?,?,?)`
  ).run("BP-S-9002", "STAFF", asg, staffToken, "ACTIVE", staffToken);

  emit(db, { event_type: "CandidateRegistered", entity_id: "OTR10241", result: "OK" });
  emit(db, { event_type: "ExamApplied", entity_id: appId, result: "OK" });
}

function tryExec(db, sql) {
  try { db.exec(sql); } catch (_) { /* already exists */ }
}

function migrateMultiExam(db) {
  tryExec(db, "ALTER TABLE exams ADD COLUMN slug TEXT");
  tryExec(db, "ALTER TABLE exams ADD COLUMN lifecycle TEXT DEFAULT 'DRAFT'");
  tryExec(db, "ALTER TABLE users ADD COLUMN exam_id TEXT");
  tryExec(db, "ALTER TABLE staff ADD COLUMN kind TEXT DEFAULT 'STAFF'");
  tryExec(db, `CREATE TABLE IF NOT EXISTS exam_clients (
      exam_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (exam_id, user_id))`);
  tryExec(db, `CREATE TABLE IF NOT EXISTS exam_centres (
      exam_id TEXT NOT NULL, centre_id TEXT NOT NULL, PRIMARY KEY (exam_id, centre_id))`);

  const exams = db.prepare("SELECT * FROM exams").all();
  for (const e of exams) {
    if (!e.slug) {
      const slug = String(e.code || "EXAM").replace(/[^A-Za-z0-9]+/g, "").toUpperCase().slice(0, 16) || "EXAM";
      db.prepare("UPDATE exams SET slug = ? WHERE id = ?").run(slug, e.id);
    }
    if (!e.lifecycle) {
      db.prepare("UPDATE exams SET lifecycle = 'OPEN' WHERE id = ?").run(e.id);
    }
  }

  const centre = db.prepare("SELECT id FROM centres LIMIT 1").get();
  const centreId = centre?.id || "CTR-DEL-01";

  function upsertExam(id, code, slug, name, date, lifecycle) {
    const exists = db.prepare("SELECT id FROM exams WHERE id = ? OR slug = ? OR code = ?").get(id, slug, code);
    if (!exists) {
      db.prepare(
        "INSERT INTO exams (id, code, name, exam_date, reporting_time, status, slug, lifecycle) VALUES (?,?,?,?,?,?,?,?)"
      ).run(id, code, name, date, "08:30", "ACTIVE", slug, lifecycle);
      db.prepare("INSERT INTO exam_shifts (id, exam_id, name, start_time, end_time) VALUES (?,?,?,?,?)").run(
        "SHIFT-" + slug, id, "Morning", "09:00", "12:00"
      );
    }
    const examRow = exists || { id };
    db.prepare("INSERT OR IGNORE INTO exam_centres (exam_id, centre_id) VALUES (?,?)").run(examRow.id, centreId);
  }

  upsertExam("EXM-BPSC", "BPSC", "BPSC", "BPSC Combined Competitive Examination", "2026-11-15", "OPEN");
  upsertExam("EXM-SSC", "SSC", "SSC", "SSC Combined Graduate Level", "2026-12-06", "DRAFT");

  migrateOtrKyc(db);
  migrateSrsAdmin(db);

  for (const e of db.prepare("SELECT id FROM exams").all()) {
    db.prepare("INSERT OR IGNORE INTO exam_centres (exam_id, centre_id) VALUES (?,?)").run(e.id, centreId);
  }

  tryExec(db, "ALTER TABLE exams ADD COLUMN registration_start TEXT");
  tryExec(db, "ALTER TABLE exams ADD COLUMN registration_close TEXT");
  tryExec(db, "ALTER TABLE applications ADD COLUMN roll_no TEXT");
  tryExec(db, "ALTER TABLE applications ADD COLUMN lab_id TEXT");
  tryExec(db, "ALTER TABLE applications ADD COLUMN admit_issued_at TEXT");
  tryExec(db, "ALTER TABLE exams ADD COLUMN mode TEXT DEFAULT 'OFFLINE'");
  tryExec(db, "ALTER TABLE applications ADD COLUMN seat_no TEXT");
  tryExec(db, "ALTER TABLE applications ADD COLUMN classroom_at TEXT");
  db.prepare("UPDATE exams SET mode = 'OFFLINE' WHERE mode IS NULL OR mode = ''").run();
  const insDev = db.prepare(
    "INSERT INTO devices (id, kind, centre_id, lab_id, status, last_sync) VALUES (?,?,?,?,?,datetime('now'))"
  );
  for (const lab of db.prepare("SELECT * FROM labs").all()) {
    const d = db.prepare("SELECT id FROM devices WHERE lab_id = ? AND kind = 'CLASSROOM'").get(lab.id);
    if (!d) {
      try {
        insDev.run("DEV-" + lab.id, "CLASSROOM", lab.centre_id, lab.id, "ONLINE");
      } catch {
        /* already exists */
      }
    }
  }
  for (const e of db.prepare("SELECT id, exam_date, registration_start FROM exams").all()) {
    if (!e.registration_start) {
      db.prepare(
        "UPDATE exams SET registration_start = ?, registration_close = ? WHERE id = ?"
      ).run(e.exam_date + "T09:00", e.exam_date + "T18:00", e.id);
    }
  }
}

function migrateOtrKyc(db) {
  const cols = [
    "father_name TEXT",
    "mother_name TEXT",
    "guardian_name TEXT",
    "nationality TEXT",
    "category TEXT",
    "religion TEXT",
    "marital_status TEXT",
    "blood_group TEXT",
    "id_mark TEXT",
    "disability TEXT",
    "aadhaar TEXT",
    "pan TEXT",
    "voter_id TEXT",
    "passport_no TEXT",
    "address_line1 TEXT",
    "address_line2 TEXT",
    "city TEXT",
    "district TEXT",
    "state TEXT",
    "pincode TEXT",
    "perm_address TEXT",
    "signature_data TEXT",
    "kyc_complete INTEGER DEFAULT 0",
  ];
  for (const col of cols) tryExec(db, `ALTER TABLE candidate_profiles ADD COLUMN ${col}`);
  tryExec(db, "ALTER TABLE candidate_documents ADD COLUMN file_data TEXT");
  tryExec(db, "ALTER TABLE candidate_documents ADD COLUMN file_name TEXT");
  tryExec(db, `CREATE TABLE IF NOT EXISTS candidate_fingerprints (
      id TEXT PRIMARY KEY,
      otr_id TEXT NOT NULL,
      hand TEXT NOT NULL,
      finger TEXT NOT NULL,
      image_data TEXT,
      UNIQUE(otr_id, hand, finger)
    )`);
  tryExec(db, "ALTER TABLE candidate_fingerprints ADD COLUMN print_hash TEXT");
  tryExec(db, "ALTER TABLE access_events ADD COLUMN fp_score INTEGER");
  tryExec(db, "ALTER TABLE access_events ADD COLUMN fp_class TEXT");
  tryExec(db, "ALTER TABLE access_events ADD COLUMN fp_finger TEXT");
  tryExec(db, "ALTER TABLE applications ADD COLUMN fingerprint_at TEXT");
  tryExec(db, `CREATE TABLE IF NOT EXISTS exam_fingerprints (
      id TEXT PRIMARY KEY,
      otr_id TEXT NOT NULL,
      exam_id TEXT,
      application_id TEXT,
      centre_id TEXT,
      event_id TEXT,
      live_image TEXT,
      matched_hand TEXT,
      matched_finger TEXT,
      score INTEGER,
      klass TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  tryExec(db, "ALTER TABLE staff ADD COLUMN profile_json TEXT");
  tryExec(db, "ALTER TABLE staff ADD COLUMN father_name TEXT");
  tryExec(db, "ALTER TABLE staff ADD COLUMN dob TEXT");
  tryExec(db, "ALTER TABLE staff ADD COLUMN gender TEXT");
  tryExec(db, "ALTER TABLE staff ADD COLUMN aadhaar TEXT");
  tryExec(db, "ALTER TABLE staff ADD COLUMN designation TEXT");
}

function migrateSrsAdmin(db) {
  const examCols = [
    "authority TEXT",
    "exam_type TEXT",
    "allocation_profile TEXT",
    "security_profile TEXT",
  ];
  for (const col of examCols) tryExec(db, `ALTER TABLE exams ADD COLUMN ${col}`);
  const centreCols = [
    "code TEXT",
    "district TEXT",
    "pincode TEXT",
    "latitude TEXT",
    "longitude TEXT",
    "centre_type TEXT",
    "pwd_accessible TEXT",
    "accessible_facilities TEXT",
  ];
  for (const col of centreCols) tryExec(db, `ALTER TABLE centres ADD COLUMN ${col}`);
  const labCols = ["code TEXT", "lab_type TEXT", "shift_capacity INTEGER"];
  for (const col of labCols) tryExec(db, `ALTER TABLE labs ADD COLUMN ${col}`);
  tryExec(db, "ALTER TABLE applications ADD COLUMN application_no TEXT");
  tryExec(db, "ALTER TABLE applications ADD COLUMN allocation_status TEXT");
  tryExec(db, "ALTER TABLE applications ADD COLUMN allocation_reason TEXT");
  tryExec(db, "ALTER TABLE applications ADD COLUMN allocation_locked INTEGER DEFAULT 0");
  tryExec(db, "ALTER TABLE users ADD COLUMN staff_id TEXT");
  tryExec(db, "ALTER TABLE centres ADD COLUMN download_key_hash TEXT");
  tryExec(db, "ALTER TABLE centres ADD COLUMN download_key_hint TEXT");
  tryExec(db, "ALTER TABLE centres ADD COLUMN download_key_at TEXT");
  tryExec(db, "ALTER TABLE applications ADD COLUMN reg_photo_data TEXT");
  tryExec(db, "ALTER TABLE applications ADD COLUMN reg_face_hash TEXT");
  tryExec(db, `CREATE TABLE IF NOT EXISTS exam_configs (
      exam_id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  tryExec(db, `CREATE TABLE IF NOT EXISTS allocation_rule_sets (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      rules_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  tryExec(db, `CREATE TABLE IF NOT EXISTS allocation_exceptions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      otr_id TEXT,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  tryExec(db, `CREATE TABLE IF NOT EXISTS helpdesk_tickets (
      id TEXT PRIMARY KEY,
      otr_id TEXT,
      exam_id TEXT,
      subject TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  tryExec(db, `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      exam_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  tryExec(db, `CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      filename TEXT,
      status TEXT NOT NULL,
      error_json TEXT,
      committed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
}

function ensureAccounts(db) {
  const pw = hashPassword("Pilot@123");
  const ins = db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, role, centre_id, lab_id, gate_id)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  const extras = [
    ["USR-CLIENT", "client", "Client Control Room", "CLIENT", null, null, null],
    ["USR-HEAD2", "supervisor", "Centre Supervisor - Delhi 01", "CENTRE_HEAD", "CTR-DEL-01", null, null],
  ];
  for (const u of extras) {
    const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(u[1]);
    if (!exists) ins.run(u[0], u[1], pw, u[2], u[3], u[4], u[5], u[6]);
  }
  const adminHash = hashPassword("Sai@2026");
  const superAdmins = db.prepare("SELECT * FROM users WHERE role = 'SUPER_ADMIN'").all();
  if (superAdmins.length) {
    const primary = superAdmins[0];
    db.prepare("UPDATE users SET username = ?, password_hash = ?, display_name = ? WHERE id = ?").run(
      "Sai_2026", adminHash, "Main Admin", primary.id
    );
    for (const extra of superAdmins.slice(1)) {
      db.prepare("DELETE FROM users WHERE id = ?").run(extra.id);
    }
  } else {
    ins.run("USR-ADMIN", "Sai_2026", adminHash, "Main Admin", "SUPER_ADMIN", null, null, null);
  }
  const client = db.prepare("SELECT id FROM users WHERE username = 'client' COLLATE NOCASE").get();
  if (client) {
    const bound = db.prepare("SELECT exam_id FROM exam_clients WHERE user_id = ?").all(client.id);
    const allExams = db.prepare("SELECT id FROM exams").all();
    const mixedAll = bound.length && allExams.length && bound.length >= allExams.length;
    if (!bound.length || mixedAll) {
      const exam = db.prepare("SELECT id FROM exams WHERE id = 'EXM-PILOT-2026'").get()
        || db.prepare("SELECT id FROM exams ORDER BY exam_date LIMIT 1").get();
      db.prepare("DELETE FROM exam_clients WHERE user_id = ?").run(client.id);
      if (exam) db.prepare("INSERT OR IGNORE INTO exam_clients (exam_id, user_id) VALUES (?,?)").run(exam.id, client.id);
    }
  }
  try {
    const gate = db.prepare("SELECT id FROM users WHERE username = 'gate'").get();
    const stf = db.prepare("SELECT id FROM staff WHERE id = 'STF-9002'").get();
    if (gate && stf) db.prepare("UPDATE users SET staff_id = ? WHERE id = ?").run(stf.id, gate.id);
    const cls = db.prepare("SELECT id FROM users WHERE username = 'classroom'").get();
    if (cls && stf) {
      /* classroom uses same centre; leave unlinked unless dedicated staff */
    }
    const asg = db.prepare("SELECT * FROM staff_assignments WHERE id = 'ASG-9002-PILOT'").get();
    if (asg && stf && !db.prepare("SELECT id FROM boarding_passes WHERE staff_assignment_id = ? AND kind = 'STAFF_ID'").get(asg.id)) {
      const { signPayload } = require("./token");
      const passId = "SID-9002";
      const payload = { typ: "STAFF_ID", passId, assignmentId: asg.id, staffId: stf.id, examId: asg.exam_id, centreId: asg.centre_id };
      const token = signPayload(payload);
      db.prepare(
        `INSERT INTO boarding_passes (id, kind, staff_assignment_id, token, status, qr_payload) VALUES (?,?,?,?,?,?)`
      ).run(passId, "STAFF_ID", asg.id, token, "ACTIVE", token);
    }
  } catch (_) { /* staff_id column or seed missing */ }
}

function makeId(prefix) {
  const n = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}${n}${r}`;
}

function wrapSql(raw, persistFn) {
  return {
    exec(sql) {
      raw.exec(sql);
      persistFn();
    },
    prepare(sql) {
      return {
        run(...params) {
          raw.run(sql, params);
          persistFn();
        },
        get(...params) {
          const stmt = raw.prepare(sql);
          stmt.bind(params);
          const row = stmt.step() ? stmt.getAsObject() : undefined;
          stmt.free();
          return row;
        },
        all(...params) {
          const stmt = raw.prepare(sql);
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        },
      };
    },
  };
}

async function openDb() {
  fs.mkdirSync(dataDir, { recursive: true });
  const wasmDir = path.join(__dirname, "..", "node_modules", "sql.js", "dist");
  const SQL = await initSqlJs({ locateFile: (file) => path.join(wasmDir, file) });
  const raw = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
  const persistFn = () => fs.writeFileSync(dbPath, Buffer.from(raw.export()));
  const db = wrapSql(raw, persistFn);
  createSchema(db);
  migrateMultiExam(db);
  migrateSrsAdmin(db);
  seedIfEmpty(db);
  ensureAccounts(db);
  persistFn();
  db.emitAudit = (event) => emit(db, event);
  db.newId = makeId;
  return db;
}

module.exports = { openDb };
