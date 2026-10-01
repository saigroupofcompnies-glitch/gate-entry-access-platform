import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api";
import { downloadCsv, rowsFromSpreadsheet } from "../parseSheet";
import { matchAdminFilters, useAdminFilters } from "../AdminFilters.jsx";

export function AdminRegistrations() {
  const { query } = useAdminFilters();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api("/api/admin/registrations" + query).then(setRows).catch(() => setRows([]));
  }, [query]);
  return (
    <div>
      <h2>Exam Registration</h2>
      <p className="hint">Linked to OTR. Use the OTR, exam and centre filters above. {rows.length} application(s).</p>
      <div className="panel">
        <table>
          <thead>
            <tr><th>Application</th><th>OTR</th><th>Name</th><th>Exam</th><th>Centre</th><th>Lab</th><th>Allocation</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.application_no || r.id}</td>
                <td className="mono">{r.otr_id}</td>
                <td>{r.full_name}</td>
                <td><Link to={`/admin/exams/${r.exam_id}`}>{r.slug}</Link></td>
                <td>{r.centre_name || "—"}</td>
                <td>{r.lab_name || "—"}</td>
                <td>{r.allocation_status || "Not Allocated"}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminCentres() {
  const { query } = useAdminFilters();
  const [centres, setCentres] = useState([]);
  const [labs, setLabs] = useState([]);
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState(null);
  async function load() {
    setCentres(await api("/api/centres" + query));
    setLabs(await api("/api/admin/labs" + query));
  }
  useEffect(() => { load(); }, [query]);

  function template() {
    downloadCsv("centre-lab-template.csv", [{
      centreCode: "CTR-PAT-01",
      centreName: "Patna Centre 01",
      address: "Bailey Road",
      city: "Patna",
      district: "Patna",
      state: "BR",
      pincode: "800001",
      latitude: "25.61",
      longitude: "85.14",
      centreType: "College",
      centreStatus: "ACTIVE",
      totalCapacity: "400",
      pwdAccessible: "Yes",
      accessibleFacilities: "Ramp, Lift",
      labCode: "LAB-P1",
      labName: "Hall A",
      labCapacity: "40",
      labType: "Classroom",
      floor: "Ground",
    }]);
  }

  async function onUpload(e, commit) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const rows = await rowsFromSpreadsheet(file);
    const out = await api("/api/centres/import", { method: "POST", body: { rows, commit, filename: file.name } });
    setPreview(out);
    setMsg(out.committed ? `Committed ${out.count} rows.` : `${out.errors?.length || 0} validation issue(s). Fix and upload again.`);
    if (out.committed) load();
  }

  return (
    <div>
      <h2>Centre Management</h2>
      <p className="hint">Download template → upload Excel → preview errors → commit. Issue a unique download key per centre. Only the centre main server uses that key — not every gate/classroom device.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn ghost" type="button" onClick={template}>Download template</button>
        <label className="btn ghost">Preview Excel<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => onUpload(e, false)} /></label>
        <label className="btn">Commit Excel<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => onUpload(e, true)} /></label>
        <Link className="btn ghost" to="/admin/labs">Labs &amp; capacity</Link>
      </div>
      {msg && <p className="hint">{msg}</p>}
      {preview?.errors?.length > 0 && (
        <div className="panel">
          <h3>Validation errors</h3>
          {preview.errors.map((err, i) => <p key={i} className="err">Row {err.row}: {err.error}</p>)}
        </div>
      )}
      <div className="panel">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>City</th><th>Capacity</th><th>Download key</th><th></th></tr></thead>
          <tbody>
            {centres.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.code || c.id}</td>
                <td>{c.name}</td>
                <td>{c.city}</td>
                <td>{c.capacity}</td>
                <td>{c.hasDownloadKey ? `Issued · hint …${c.download_key_hint || ""}` : "Not issued"}</td>
                <td>
                  {labs.filter((l) => l.centre_id === c.id).length} labs
                  <button className="btn ghost" type="button" style={{ marginLeft: 8 }} onClick={async () => {
                    if (!window.confirm(`Issue a new unique download key for ${c.name}? The previous key will stop working. Give the new key only to the centre main server.`)) return;
                    const out = await api(`/api/admin/centres/${c.id}/download-key`, { method: "POST" });
                    setMsg(`Key for ${out.centreName} (shown once): ${out.downloadKey}`);
                    load();
                  }}>Issue centre key</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminLabs() {
  const { query, centres } = useAdminFilters();
  const [labs, setLabs] = useState([]);
  const [form, setForm] = useState({ name: "", centreId: "", capacity: 40, floor: "" });
  async function load() {
    const l = await api("/api/admin/labs" + query);
    setLabs(l);
    setForm((f) => ({ ...f, centreId: f.centreId || centres[0]?.id || "" }));
  }
  useEffect(() => { load(); }, [query, centres]);
  async function add(e) {
    e.preventDefault();
    await api("/api/admin/labs", { method: "POST", body: form });
    load();
  }
  return (
    <div>
      <h2>Labs &amp; Capacity</h2>
      <p className="hint">Lab inventory for allocation. Seat numbers stay off unless the exam is CBT.</p>
      <form className="form-grid panel" onSubmit={add}>
        <div>
          <label>Centre</label>
          <select value={form.centreId} onChange={(e) => setForm({ ...form, centreId: e.target.value })}>
            {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label>Lab name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label>Capacity</label>
          <input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
        </div>
        <div>
          <label>Floor</label>
          <input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
        </div>
        <div><button className="btn" type="submit" style={{ marginTop: 22 }}>Add lab</button></div>
      </form>
      <div className="panel">
        <table>
          <thead><tr><th>Lab</th><th>Centre</th><th>Floor</th><th>Capacity</th><th>Type</th></tr></thead>
          <tbody>
            {labs.map((l) => (
              <tr key={l.id}>
                <td>{l.name}<div className="mono">{l.code || l.id}</div></td>
                <td>{centres.find((c) => c.id === l.centre_id)?.name || l.centre_id}</td>
                <td>{l.floor}</td>
                <td>{l.capacity}</td>
                <td>{l.lab_type || "Classroom"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminAllocation() {
  const { filters } = useAdminFilters();
  const examId = filters.examId;
  const [cfg, setCfg] = useState(null);
  const [rules, setRules] = useState({ distanceKm: 100, preferHomeCity: true, genderHomeCity: true, pwdAccessible: true });
  const [out, setOut] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!examId) { setCfg(null); return; }
    api(`/api/admin/exams/${examId}/config`).then((d) => {
      setCfg(d);
      setRules({ ...rules, ...(d.rules?.rules || {}) });
    }).catch(() => {});
  }, [examId]);
  async function saveRules(e) {
    e.preventDefault();
    await api("/api/allocation/rules", { method: "PUT", body: { examId, name: "Exam rule set", rules } });
    setOut({ saved: true });
  }
  async function run() {
    setErr("");
    try {
      setOut(await api("/api/allocation/run", { method: "POST", body: { examId } }));
    } catch (e2) {
      setErr(e2.message);
    }
  }
  return (
    <div>
      <h2>Allocation Engine</h2>
      <p className="hint">Pick an exam in the filter bar, then save rules and run. Seat-number allocation stays off unless the paper is CBT. Locked allocations are not overwritten.</p>
      {!examId && <p className="err">Select an exam in the filter bar to run allocation.</p>}
      {cfg && <p className="hint">Active rule-set version {cfg.rules?.version || 1}. Link centres on <Link to={`/admin/exams/${examId}`}>the exam desk</Link> first.</p>}
      <form className="panel form-grid" onSubmit={saveRules}>
        <div>
          <label>Distance threshold (km)</label>
          <input type="number" value={rules.distanceKm} onChange={(e) => setRules({ ...rules, distanceKm: Number(e.target.value) })} />
        </div>
        <label className="row"><input type="checkbox" checked={!!rules.preferHomeCity} onChange={(e) => setRules({ ...rules, preferHomeCity: e.target.checked })} /> Prefer home city</label>
        <label className="row"><input type="checkbox" checked={!!rules.genderHomeCity} onChange={(e) => setRules({ ...rules, genderHomeCity: e.target.checked })} /> Gender home-city operational rule</label>
        <label className="row"><input type="checkbox" checked={!!rules.pwdAccessible} onChange={(e) => setRules({ ...rules, pwdAccessible: e.target.checked })} /> PwD accessible centres</label>
        <button className="btn" type="submit" disabled={!examId}>Save rule set (new version)</button>
      </form>
      <div className="row">
        <button className="btn" type="button" disabled={!examId} onClick={run}>Run auto allocation</button>
        <button className="btn ghost" type="button" disabled={!examId} onClick={() => api("/api/allocation/lock", { method: "POST", body: { examId } }).then(() => setOut({ locked: true }))}>Lock allocated</button>
        <Link className="btn ghost" to="/admin/exceptions">Open exceptions</Link>
        <Link className="btn ghost" to="/admin/passes">Generate gate passes</Link>
      </div>
      {err && <p className="err">{err}</p>}
      {out && <pre className="panel">{JSON.stringify(out, null, 2)}</pre>}
    </div>
  );
}

export function AdminExceptions() {
  const { query } = useAdminFilters();
  const [rows, setRows] = useState([]);
  const { centres } = useAdminFilters();
  const [labs, setLabs] = useState([]);
  useEffect(() => {
    api("/api/allocation/exceptions" + query).then(setRows).catch(() => setRows([]));
  }, [query]);
  useEffect(() => {
    api("/api/admin/labs").then(setLabs);
  }, []);
  async function override(row) {
    const centreId = window.prompt("Centre ID", centres[0]?.id || "");
    if (!centreId) return;
    const labId = window.prompt("Lab ID (optional)", labs.find((l) => l.centre_id === centreId)?.id || "");
    const reason = window.prompt("Mandatory reason");
    if (!reason) return;
    await api("/api/allocation/override", { method: "POST", body: { applicationId: row.application_id, centreId, labId, reason } });
    setRows(await api("/api/allocation/exceptions" + query));
  }
  return (
    <div>
      <h2>Allocation Exceptions</h2>
      <p className="hint">Manual override requires a reason and is fully audited. Override also locks the allocation. {rows.length} row(s).</p>
      <div className="panel">
        <table>
          <thead><tr><th>OTR</th><th>Name</th><th>Exam</th><th>Reason</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.otr_id}</td>
                <td>{r.full_name}</td>
                <td>{r.exam_name}</td>
                <td>{r.reason}</td>
                <td>{r.status}</td>
                <td>{r.status === "OPEN" && <button className="btn" type="button" onClick={() => override(r)}>Manual allocate</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminPasses() {
  const { filters, exams } = useAdminFilters();
  const list = exams.filter((x) => !filters.examId || x.id === filters.examId);
  const [msg, setMsg] = useState("");
  async function generate(id) {
    setMsg("");
    try {
      const out = await api(`/api/admin/exams/${id}/admit-cards`, { method: "POST", body: {} });
      setMsg(`Gate passes issued: ${out.issued}. Open the exam desk to print.`);
    } catch (e) {
      setMsg(e.message === "LINK_CENTRES_FIRST" ? "Link centres and run allocation first." : e.message);
    }
  }
  return (
    <div>
      <h2>Admit Card &amp; Gate Pass</h2>
      <p className="hint">Issued after allocation. QR is a signed token — not raw personal data. Seat number is omitted unless the exam is CBT.</p>
      {msg && <p className="hint">{msg}</p>}
      <div className="exam-desk-grid">
        {list.map((x) => (
          <div key={x.id} className="exam-desk">
            <strong>{x.name}</strong>
            <em>{x.exam_date} · {x.mode || "OFFLINE"}</em>
            <div className="row" style={{ marginTop: 10 }}>
              <Link className="btn ghost" to={`/admin/exams/${x.id}`}>Exam desk</Link>
              <button className="btn" type="button" onClick={() => generate(x.id)}>Generate passes</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminGateEvents({ biometric }) {
  const { query } = useAdminFilters();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api("/api/admin/gate-events" + query).then((all) => {
      setRows(biometric ? all.filter((r) => r.face_score != null || r.fp_score != null) : all.filter((r) => r.event_kind === "CENTRE_ENTRY" || r.event_kind === "CLASSROOM_PRESENCE"));
    }).catch(() => setRows([]));
  }, [query, biometric]);
  return (
    <div>
      <h2>{biometric ? "Identity / Biometric Verification" : "Gate Entry"}</h2>
      <p className="hint">{biometric ? "Face and fingerprint outcomes linked to the candidate and exam." : "Scan results from centre gate and classroom gate."} {rows.length} event(s).</p>
      <div className="panel">
        <table>
          <thead><tr><th>Time</th><th>Kind</th><th>Subject</th><th>Result</th><th>Face</th><th>FP</th><th>Centre</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.created_at}</td>
                <td>{r.event_kind}</td>
                <td className="mono">{r.subject_id}</td>
                <td>{r.result}</td>
                <td>{r.face_score ?? "—"} {r.face_class || ""}</td>
                <td>{r.fp_score ?? "—"} {r.fp_class || ""}</td>
                <td>{r.centre_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminAttendance() {
  const { query } = useAdminFilters();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api("/api/admin/attendance" + query).then(setRows).catch(() => setRows([]));
  }, [query]);
  async function correct(row) {
    const mark = window.prompt("PRESENT or ABSENT", row.present_at ? "PRESENT" : "ABSENT");
    const reason = window.prompt("Mandatory reason");
    if (!mark || !reason) return;
    await api("/api/attendance/correct", { method: "POST", body: { applicationId: row.id, mark, reason } });
    setRows(await api("/api/admin/attendance" + query));
  }
  return (
    <div>
      <h2>Attendance</h2>
      <p className="hint">Present from classroom-gate success. Corrections require a reason and are audited. {rows.length} row(s).</p>
      <div className="panel">
        <table>
          <thead><tr><th>Name</th><th>OTR</th><th>Exam</th><th>Gate</th><th>Present</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.full_name}</td>
                <td className="mono">{r.otr_id}</td>
                <td>{r.exam_name}</td>
                <td>{r.gate_at || "—"}</td>
                <td>{r.present_at ? "Present" : "Absent"}</td>
                <td><button className="btn ghost" type="button" onClick={() => correct(r)}>Correct</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminNotify() {
  const { filters } = useAdminFilters();
  const [rows, setRows] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  async function load() { setRows(await api("/api/admin/notifications")); }
  useEffect(() => { load(); }, []);
  const shown = rows.filter((r) => matchAdminFilters(r, filters));
  async function send(e) {
    e.preventDefault();
    await api("/api/admin/notifications", { method: "POST", body: { title, body, kind: "ADMIN" } });
    setTitle(""); setBody("");
    load();
  }
  return (
    <div>
      <h2>Notifications</h2>
      <form className="panel" onSubmit={send}>
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label>Message</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="btn" type="submit" style={{ marginTop: 12 }}>Send admin alert</button>
      </form>
      <div className="panel">
        {shown.map((r) => (
          <p key={r.id}><b>{r.title}</b> <span className="hint">{r.created_at} · {r.kind}</span><br />{r.body}</p>
        ))}
      </div>
    </div>
  );
}

export function AdminHelpdesk() {
  const { filters } = useAdminFilters();
  const [rows, setRows] = useState([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  async function load() { setRows(await api("/api/admin/helpdesk")); }
  useEffect(() => { load(); }, []);
  async function add(e) {
    e.preventDefault();
    await api("/api/admin/helpdesk", { method: "POST", body: { subject, message } });
    setSubject(""); setMessage("");
    load();
  }
  return (
    <div>
      <h2>Helpdesk / Grievance</h2>
      <form className="panel" onSubmit={add}>
        <label>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
        <label>Details</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} />
        <button className="btn" type="submit" style={{ marginTop: 12 }}>Open ticket</button>
      </form>
      <div className="panel">
        <table>
          <thead><tr><th>ID</th><th>Subject</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.filter((r) => matchAdminFilters(r, filters)).map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.id}</td>
                <td>{r.subject}<div className="hint">{r.message}</div></td>
                <td>{r.status}</td>
                <td>{r.status === "OPEN" && <button className="btn ghost" type="button" onClick={async () => { await api(`/api/admin/helpdesk/${r.id}/close`, { method: "POST" }); load(); }}>Close</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminReports() {
  const { query } = useAdminFilters();
  const nav = useNavigate();
  async function pull(path, name) {
    const join = path.includes("?") ? "&" : "?";
    const data = await api(path + (query ? (query.startsWith("?") ? query : join + query.slice(1)) : ""));
    const list = Array.isArray(data) ? data : data.rows || [];
    if (list.length) downloadCsv(name, list);
    else window.alert("No rows");
  }
  return (
    <div>
      <h2>Reports &amp; Analytics</h2>
      <p className="hint">CSV exports. Sensitive identity fields stay off these operational extracts.</p>
      <div className="ops-cards" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <button className="ops-pick" type="button" onClick={() => pull("/api/admin/otr", "otr-report.csv")}>OTR report</button>
        <button className="ops-pick" type="button" onClick={() => pull("/api/admin/registrations", "exam-registration.csv")}>Exam registration</button>
        <button className="ops-pick" type="button" onClick={() => pull("/api/reports/allocation", "centre-allocation.csv")}>Centre allocation</button>
        <button className="ops-pick" type="button" onClick={() => pull("/api/allocation/exceptions", "allocation-exceptions.csv")}>Allocation exceptions</button>
        <button className="ops-pick" type="button" onClick={() => pull("/api/admin/gate-events", "gate-entry.csv")}>Gate entry</button>
        <button className="ops-pick" type="button" onClick={() => pull("/api/admin/attendance", "attendance.csv")}>Attendance</button>
        <button className="ops-pick" type="button" onClick={() => nav("/admin/audit")}>Audit (open module)</button>
        <button className="ops-pick" type="button" onClick={() => pull("/api/centres", "centre-capacity.csv")}>Centre capacity</button>
      </div>
      <p className="hint">CSV uses the OTR / exam / centre filters above.</p>
    </div>
  );
}

export function AdminHealth() {
  const [h, setH] = useState(null);
  useEffect(() => { api("/api/admin/health").then(setH); }, []);
  async function backup() {
    const pack = await api("/api/admin/backup", { method: "POST", body: {} });
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "digisecureexam-backup.json";
    a.click();
  }
  if (!h) return <p>Checking health…</p>;
  return (
    <div>
      <h2>Backup / Health / Security</h2>
      <div className="cards">
        <div className="metric"><span>Exams</span><b>{h.exams}</b></div>
        <div className="metric"><span>OTR</span><b>{h.otr}</b></div>
        <div className="metric"><span>Applications</span><b>{h.applications}</b></div>
        <div className="metric"><span>Devices</span><b>{h.devices}</b></div>
        <div className="metric"><span>Offline devices</span><b>{h.offlineDevices}</b></div>
        <div className="metric"><span>Pending sync</span><b>{h.pendingSync}</b></div>
        <div className="metric"><span>Audit rows</span><b>{h.audit}</b></div>
      </div>
      <p className="hint">Server time {h.time}. Audit is append-only from the application.</p>
      <button className="btn" type="button" onClick={backup}>Download operational backup JSON</button>
    </div>
  );
}

export function AdminStaff() {
  const { filters } = useAdminFilters();
  const [rows, setRows] = useState([]);
  useEffect(() => { api("/api/staff").then(setRows).catch(() => setRows([])); }, []);
  const shown = rows.filter((r) => matchAdminFilters(r, filters));
  return (
    <div>
      <h2>Staff &amp; Operators</h2>
      <p className="hint">Duty applications. Approve incharge on Users; centre incharge approves venue staff.</p>
      <Link className="btn" to="/admin/users">Open Users / Roles</Link>
      <div className="panel">
        <table>
          <thead><tr><th>Name</th><th>Mobile</th><th>Role</th><th>Centre</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{r.full_name}</td>
                <td>{r.mobile}</td>
                <td>{r.role_applied}</td>
                <td>{r.centre_id}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
