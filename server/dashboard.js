function registerDashboard(app, ctx) {
  const db = () => ctx.getDb();

  function canExam(user, examId) {
    const ids = ctx.allowedExamIds(user);
    return ids.includes(examId);
  }

  function scope(req, examId) {
    const centreLock = ctx.scopedCentre(req);
    const centreId = centreLock || req.query.centreId || "";
    const labId = req.query.labId || "";
    const shiftId = req.query.shiftId || "";
    return { centreId, labId, shiftId, centreLock: Boolean(centreLock) };
  }

  function apps(examId, s) {
    let rows = db().prepare("SELECT * FROM applications WHERE exam_id = ?").all(examId);
    if (s.centreId) rows = rows.filter((a) => a.centre_id === s.centreId);
    if (s.labId) rows = rows.filter((a) => a.lab_id === s.labId);
    if (s.shiftId) rows = rows.filter((a) => a.shift_id === s.shiftId);
    return rows;
  }

  function granted(examId, kind, s) {
    let rows = db().prepare(
      "SELECT * FROM access_events WHERE exam_id = ? AND event_kind = ? AND result = 'GRANTED'"
    ).all(examId, kind);
    if (s.centreId) rows = rows.filter((e) => e.centre_id === s.centreId);
    if (s.labId) rows = rows.filter((e) => e.lab_id === s.labId);
    return new Set(rows.map((e) => e.subject_id));
  }

  function centreHealth(centre, devices, util, denied) {
    const online = devices.filter((d) => d.status === "ONLINE");
    if (!devices.length || online.length === 0) return { status: "Offline", tone: "offline" };
    if (denied > 8 || util >= 100) return { status: "Critical", tone: "red" };
    if (util >= 85 || denied > 2 || online.length < devices.length) return { status: "Attention", tone: "amber" };
    return { status: "Normal", tone: "green" };
  }

  function labHealth(lab, present, device) {
    if (!device || device.status !== "ONLINE") return { status: "Offline", tone: "offline" };
    const util = lab.capacity ? present / lab.capacity : 0;
    if (util >= 1) return { status: "Attention", tone: "amber" };
    if (present > 0) return { status: "Running", tone: "green" };
    return { status: "Ready", tone: "green" };
  }

  app.get("/api/dashboard/exams", ctx.auth, (req, res) => {
    const ids = ctx.allowedExamIds(req.user);
    const rows = db().prepare("SELECT * FROM exams ORDER BY exam_date").all().filter((e) => ids.includes(e.id));
    res.json(rows.map((e) => ({
      id: e.id,
      code: e.code,
      slug: e.slug,
      name: e.name,
      exam_date: e.exam_date,
      reporting_time: e.reporting_time,
      mode: e.mode,
      lifecycle: e.lifecycle,
      shifts: db().prepare("SELECT * FROM exam_shifts WHERE exam_id = ?").all(e.id),
    })));
  });

  app.get("/api/dashboard/exams/:id", ctx.auth, (req, res) => {
    try {
    const exam = db().prepare("SELECT * FROM exams WHERE id = ? OR UPPER(slug)=UPPER(?)").get(req.params.id, req.params.id);
    if (!exam) return res.status(404).json({ error: "EXAM_NOT_FOUND" });
    if (!canExam(req.user, exam.id)) return res.status(403).json({ error: "FORBIDDEN" });
    const s = scope(req, exam.id);
    const isAdmin = req.user.role === "SUPER_ADMIN";
    const mask = (mobile) => {
      if (isAdmin || !mobile) return mobile || "";
      const m = String(mobile);
      return m.slice(0, 4) + "******";
    };

    const allApps = apps(exam.id, s);
    const registered = allApps.length;
    const allocatedRows = allApps.filter((a) => a.centre_id);
    const allocated = allocatedRows.length;
    const unallocated = registered - allocated;
    const locked = allApps.filter((a) => Number(a.allocation_locked) === 1).length;
    const manual = allApps.filter((a) => a.allocation_status === "MANUAL").length;
    const exceptions = (() => {
      try {
        return db().prepare(
          "SELECT COUNT(*) AS c FROM allocation_exceptions WHERE exam_id = ? AND status = 'OPEN'"
        ).get(exam.id).c;
      } catch {
        return 0;
      }
    })();
    const otrIds = new Set(allApps.map((a) => a.otr_id));
    const gateSet = granted(exam.id, "CENTRE_ENTRY", s);
    const presentSet = granted(exam.id, "CLASSROOM_PRESENCE", s);
    const present = presentSet.size;
    const gateEntry = gateSet.size;
    const absent = Math.max(0, allocated - present);
    const passes = db().prepare(
      `SELECT COUNT(*) AS c FROM boarding_passes bp
       JOIN applications a ON a.id = bp.application_id
       WHERE a.exam_id = ? AND bp.kind = 'CANDIDATE' AND bp.status = 'ACTIVE'`
    ).get(exam.id).c;
    const scans = db().prepare("SELECT * FROM access_events WHERE exam_id = ?").all(exam.id);
    const scopedScans = scans.filter((e) => (!s.centreId || e.centre_id === s.centreId) && (!s.labId || e.lab_id === s.labId));
    const denied = scopedScans.filter((e) => e.result === "DENIED").length;
    const faceOk = scopedScans.filter((e) => e.face_class === "PASS" || (e.face_score != null && e.result === "GRANTED")).length;
    const faceFail = scopedScans.filter((e) => e.face_class === "FAIL" || (e.event_kind && e.result === "DENIED" && e.face_score != null)).length;
    const fpOk = (() => {
      try {
        return db().prepare("SELECT COUNT(*) AS c FROM exam_fingerprints WHERE exam_id = ? AND klass = 'VERIFIED'").get(exam.id).c;
      } catch {
        return 0;
      }
    })();
    const fpFail = (() => {
      try {
        return db().prepare("SELECT COUNT(*) AS c FROM exam_fingerprints WHERE exam_id = ? AND klass != 'VERIFIED'").get(exam.id).c;
      } catch {
        return 0;
      }
    })();
    const pendingVerify = Math.max(0, gateEntry - present);

    const examCentres = db().prepare(
      `SELECT c.* FROM centres c JOIN exam_centres ec ON ec.centre_id = c.id WHERE ec.exam_id = ?`
    ).all(exam.id);
    const centreRows = (s.centreId ? examCentres.filter((c) => c.id === s.centreId) : examCentres).map((c) => {
      const cap = Number(c.capacity) || 0;
      const alloc = db().prepare("SELECT COUNT(*) AS c FROM applications WHERE exam_id = ? AND centre_id = ?").get(exam.id, c.id).c;
      const pres = db().prepare(
        `SELECT COUNT(DISTINCT subject_id) AS c FROM access_events
         WHERE exam_id = ? AND centre_id = ? AND event_kind = 'CLASSROOM_PRESENCE' AND result = 'GRANTED'`
      ).get(exam.id, c.id).c;
      const gate = db().prepare(
        `SELECT COUNT(DISTINCT subject_id) AS c FROM access_events
         WHERE exam_id = ? AND centre_id = ? AND event_kind = 'CENTRE_ENTRY' AND result = 'GRANTED'`
      ).get(exam.id, c.id).c;
      const labs = db().prepare("SELECT * FROM labs WHERE centre_id = ?").all(c.id);
      const devices = db().prepare("SELECT * FROM devices WHERE centre_id = ?").all(c.id);
      const staffN = db().prepare("SELECT COUNT(*) AS c FROM staff_assignments WHERE exam_id = ? AND centre_id = ?").get(exam.id, c.id).c;
      const last = db().prepare(
        "SELECT MAX(created_at) AS t FROM access_events WHERE exam_id = ? AND centre_id = ?"
      ).get(exam.id, c.id).t;
      const den = db().prepare(
        "SELECT COUNT(*) AS c FROM access_events WHERE exam_id = ? AND centre_id = ? AND result = 'DENIED'"
      ).get(exam.id, c.id).c;
      const util = cap ? Math.round((alloc / cap) * 100) : 0;
      const health = centreHealth(c, devices, util, den);
      const statusFilter = String(req.query.status || "");
      return {
        id: c.id,
        code: c.code || c.id,
        name: c.name,
        city: c.city,
        district: c.district || "",
        state: c.state,
        address: c.address,
        capacity: cap,
        allocated: alloc,
        remaining: Math.max(0, cap - alloc),
        present: pres,
        absent: Math.max(0, alloc - pres),
        gateEntry: gate,
        labs: labs.length,
        labsActive: devices.filter((d) => d.kind === "CLASSROOM" && d.status === "ONLINE").length,
        staff: staffN,
        devicesOnline: devices.filter((d) => d.status === "ONLINE").length,
        devicesTotal: devices.length,
        utilization: util,
        attendancePct: alloc ? Math.round((pres / alloc) * 100) : 0,
        status: health.status,
        tone: health.tone,
        lastUpdate: last,
        _hide: statusFilter && health.status.toLowerCase() !== statusFilter.toLowerCase(),
      };
    }).filter((r) => !r._hide);

    let labs = [];
    const centreIds = s.centreId ? [s.centreId] : examCentres.map((c) => c.id);
    for (const cid of centreIds) {
      for (const lab of db().prepare("SELECT * FROM labs WHERE centre_id = ?").all(cid)) {
        if (s.labId && lab.id !== s.labId) continue;
        const alloc = db().prepare("SELECT COUNT(*) AS c FROM applications WHERE exam_id = ? AND lab_id = ?").get(exam.id, lab.id).c;
        const pres = db().prepare(
          `SELECT COUNT(DISTINCT subject_id) AS c FROM access_events
           WHERE exam_id = ? AND event_kind = 'CLASSROOM_PRESENCE' AND result = 'GRANTED' AND lab_id = ?`
        ).get(exam.id, lab.id).c;
        const device = db().prepare("SELECT * FROM devices WHERE lab_id = ? AND kind = 'CLASSROOM'").get(lab.id);
        const last = db().prepare(
          `SELECT MAX(created_at) AS t FROM access_events WHERE exam_id = ? AND lab_id = ?`
        ).get(exam.id, lab.id).t;
        const staffN = db().prepare("SELECT COUNT(*) AS c FROM staff_assignments WHERE exam_id = ? AND lab_id = ?").get(exam.id, lab.id).c;
        const health = labHealth(lab, pres, device);
        labs.push({
          id: lab.id,
          code: lab.code || lab.id,
          name: lab.name,
          centre_id: lab.centre_id,
          centreName: examCentres.find((c) => c.id === lab.centre_id)?.name,
          roomType: lab.lab_type || "Classroom",
          floor: lab.floor,
          capacity: lab.capacity,
          allocated: alloc,
          present: pres,
          absent: Math.max(0, alloc - pres),
          utilization: lab.capacity ? Math.round((pres / lab.capacity) * 100) : 0,
          staff: staffN,
          deviceId: device?.id,
          deviceStatus: device?.status || "UNKNOWN",
          lastActivity: last || device?.last_sync,
          status: health.status,
          tone: health.tone,
        });
      }
    }

    const staff = db().prepare(
      `SELECT sa.*, s.full_name, s.mobile, s.role_applied, s.status AS staff_status, s.kind
       FROM staff_assignments sa JOIN staff s ON s.id = sa.staff_id
       WHERE sa.exam_id = ?`
    ).all(exam.id).filter((r) => (!s.centreId || r.centre_id === s.centreId) && (!s.labId || r.lab_id === s.labId))
      .map((r) => ({
        ...r,
        mobile: mask(r.mobile),
        role: r.role || r.role_applied,
      }));

    const devices = db().prepare("SELECT * FROM devices").all().filter((d) => {
      if (s.centreId && d.centre_id !== s.centreId) return false;
      if (s.labId && d.lab_id && d.lab_id !== s.labId) return false;
      if (!s.centreId) {
        const allowed = new Set(examCentres.map((c) => c.id));
        return !d.centre_id || allowed.has(d.centre_id);
      }
      return true;
    });

    const candidates = allApps.slice(0, 300).map((a) => {
      const cand = db().prepare("SELECT otr_id, full_name, mobile FROM candidates WHERE otr_id = ?").get(a.otr_id);
      const pres = ctx.presenceOf(a.otr_id, exam.id);
      const pass = db().prepare("SELECT id, status FROM boarding_passes WHERE application_id = ?").get(a.id);
      return {
        applicationId: a.id,
        otr_id: a.otr_id,
        full_name: cand?.full_name,
        mobile: mask(cand?.mobile),
        centre_id: a.centre_id,
        lab_id: a.lab_id,
        roll_no: a.roll_no,
        seat_no: String(exam.mode || "").toUpperCase() === "CBT" ? a.seat_no : null,
        allocation_status: a.allocation_status,
        status: a.status,
        presence: pres?.state,
        gateAt: pres?.centre?.created_at,
        classroomAt: a.classroom_at,
        passStatus: pass?.status || "NONE",
      };
    });

    const candidateId = req.query.candidateId;
    let candidateDetail = null;
    if (candidateId) {
      const a = db().prepare("SELECT * FROM applications WHERE exam_id = ? AND (id = ? OR otr_id = ?)").get(exam.id, candidateId, candidateId);
      if (a) {
        const cand = db().prepare("SELECT otr_id, full_name, mobile, email, identity_status FROM candidates WHERE otr_id = ?").get(a.otr_id);
        const events = db().prepare(
          "SELECT id, event_kind, result, face_score, face_class, created_at, lab_id, centre_id FROM access_events WHERE exam_id = ? AND subject_id = ? ORDER BY created_at"
        ).all(exam.id, a.otr_id);
        candidateDetail = {
          ...cand,
          mobile: mask(cand?.mobile),
          email: isAdmin ? cand?.email : undefined,
          application: a,
          events,
          pass: db().prepare("SELECT id, status, created_at FROM boarding_passes WHERE application_id = ?").get(a.id),
        };
      }
    }

    const alerts = db().prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 40").all()
      .filter((a) => !s.centreId || a.centre_id === s.centreId);

    const shifts = db().prepare("SELECT * FROM exam_shifts WHERE exam_id = ?").all(exam.id);
    const shift = shifts.find((x) => x.id === s.shiftId) || shifts[0];
    const timeline = [
      { key: "open", label: "Centre opens / reporting", at: exam.reporting_time || "08:30", status: "scheduled" },
      { key: "staff", label: "Staff check-in", at: exam.reporting_time || "08:30", status: "scheduled" },
      { key: "entry", label: "Candidate entry opens", at: shift?.start_time || "09:00", status: gateEntry ? "live" : "scheduled" },
      { key: "start", label: "Exam starts", at: shift?.start_time || "09:00", status: exam.lifecycle === "LIVE" ? "live" : "scheduled" },
      { key: "end", label: "Exam ends", at: shift?.end_time || "12:00", status: exam.lifecycle === "CLOSED" ? "done" : "scheduled" },
      { key: "attendance", label: "Attendance finalization", at: shift?.end_time || "12:00", status: "scheduled" },
      { key: "close", label: "Centre closure", at: shift?.end_time || "12:00", status: exam.lifecycle === "CLOSED" ? "done" : "scheduled" },
    ];

    const lastAlloc = db().prepare(
      "SELECT created_at, payload_json FROM audit_events WHERE event_type = 'AllocationBatchRun' AND entity_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(exam.id);
    const rule = db().prepare(
      "SELECT version, name FROM allocation_rule_sets WHERE exam_id = ? AND status = 'ACTIVE' ORDER BY version DESC LIMIT 1"
    ).get(exam.id);
    const health = isAdmin ? {
      devices: devices.length,
      offline: devices.filter((d) => d.status !== "ONLINE").length,
      pendingSync: db().prepare("SELECT COUNT(*) AS c FROM sync_queue WHERE status = 'PENDING'").get().c,
      openAlerts: alerts.filter((a) => a.status === "OPEN").length,
    } : null;

    const onlineCentres = centreRows.filter((c) => c.tone !== "offline").length;

    res.json({
      live: true,
      refreshedAt: new Date().toISOString(),
      role: req.user.role,
      canControl: isAdmin,
      exam: {
        id: exam.id,
        name: exam.name,
        code: exam.code,
        slug: exam.slug,
        exam_date: exam.exam_date,
        reporting_time: exam.reporting_time,
        mode: exam.mode,
        lifecycle: exam.lifecycle,
      },
      shifts,
      scope: s,
      kpis: {
        otr: otrIds.size,
        registered,
        eligible: registered,
        allocated,
        unallocated,
        exceptions,
        centres: examCentres.length,
        labs: labs.length,
        passes,
        gateEntry,
        present,
        absent,
        face: faceOk,
        fingerprint: fpOk,
        pendingVerify,
        centresOnline: onlineCentres,
        centresOffline: Math.max(0, centreRows.length - onlineCentres),
      },
      funnel: { registered, allocated, gateEntry, verified: faceOk, present, absent },
      allocation: { eligible: registered, allocated, unallocated, exceptions, manual, locked, ruleVersion: rule?.version || 1, ruleName: rule?.name, lastRun: lastAlloc?.created_at || null },
      gate: {
        generated: passes,
        scanned: scopedScans.filter((e) => e.event_kind === "CENTRE_ENTRY").length,
        invalid: denied,
        duplicate: 0,
        entry: gateEntry,
        pending: pendingVerify,
      },
      verification: { faceOk, faceFail, fpOk, fpFail, pending: pendingVerify },
      centres: centreRows,
      labs,
      staff,
      devices,
      candidates,
      candidateDetail,
      alerts,
      timeline,
      control: health,
    });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "DASHBOARD_FAILED", message: String(e.message || e) });
    }
  });
}

module.exports = { registerDashboard };
