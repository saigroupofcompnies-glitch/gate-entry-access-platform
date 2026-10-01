import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, getUser } from "../api";
import { useAdminFilters } from "../AdminFilters.jsx";
import { downloadCsv } from "../parseSheet";

const TABS = [
  ["centres", "Centres"],
  ["labs", "Labs / Classrooms"],
  ["staff", "Staff"],
  ["candidates", "Candidates"],
  ["gate", "Gate pass / entry"],
  ["verify", "Verification"],
  ["attendance", "Attendance"],
  ["allocation", "Allocation"],
  ["devices", "Devices"],
  ["alerts", "Alerts"],
  ["timeline", "Timeline"],
];

function toneClass(tone) {
  if (tone === "green") return "ok";
  if (tone === "amber") return "warnp";
  if (tone === "red") return "bad";
  return "muted";
}

export default function ExamDashboard({ variant = "client", initialTab = "centres" }) {
  const user = getUser();
  const adminF = useAdminFilters();
  const isAdmin = variant === "admin" || user?.role === "SUPER_ADMIN";
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState(adminF.filters?.examId || sessionStorage.getItem("dsx_dash_exam") || "");
  const [shiftId, setShiftId] = useState("");
  const [centreId, setCentreId] = useState(adminF.filters?.centreId || "");
  const [labId, setLabId] = useState("");
  const [status, setStatus] = useState("");
  const [auto, setAuto] = useState(true);
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState(null);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    api("/api/dashboard/exams").then((list) => {
      setExams(list);
      const allowed = new Set(list.map((e) => e.id));
      if (examId && !allowed.has(examId)) {
        const next = list.length === 1 ? list[0].id : "";
        setExamId(next);
        if (next) sessionStorage.setItem("dsx_dash_exam", next);
        else sessionStorage.removeItem("dsx_dash_exam");
      } else if (!examId && list.length === 1) {
        setExamId(list[0].id);
        sessionStorage.setItem("dsx_dash_exam", list[0].id);
      }
    }).catch(() => setExams([]));
  }, []);

  useEffect(() => {
    if (adminF.filters?.examId && adminF.filters.examId !== examId) setExamId(adminF.filters.examId);
  }, [adminF.filters?.examId]);

  function qs(extra = {}) {
    const p = new URLSearchParams();
    if (shiftId) p.set("shiftId", shiftId);
    if (centreId) p.set("centreId", centreId);
    if (labId) p.set("labId", labId);
    if (status) p.set("status", status);
    if (extra.candidateId) p.set("candidateId", extra.candidateId);
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  async function load() {
    if (!examId) { setData(null); return; }
    setErr("");
    try {
      const d = await api(`/api/dashboard/exams/${examId}${qs()}`);
      setData(d);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
    if (!auto || !examId) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [examId, shiftId, centreId, labId, status, auto]);

  function pickExam(id) {
    setExamId(id);
    if (id) sessionStorage.setItem("dsx_dash_exam", id);
    else sessionStorage.removeItem("dsx_dash_exam");
    setCentreId("");
    setLabId("");
    if (isAdmin && adminF.setFilters) adminF.setFilters((f) => ({ ...f, examId: id }));
  }

  async function openCandidate(row) {
    const d = await api(`/api/dashboard/exams/${examId}${qs({ candidateId: row.otr_id })}`);
    setDetail(d.candidateDetail);
    setTab("candidates");
  }

  if (!examId) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Select an examination</h2>
        <p className="hint">Exam-wise dashboard. Counts are never mixed across papers. Choose Exam → Date → Shift, then drill Centre → Lab → Staff → Candidate.</p>
        <div className="exam-desk-grid">
          {exams.map((x) => (
            <button key={x.id} type="button" className="exam-desk" onClick={() => pickExam(x.id)}>
              <span className={`pill ${x.lifecycle === "LIVE" ? "ok" : "muted"}`}>{x.lifecycle}</span>
              <strong>{x.name}</strong>
              <em>{x.exam_date} · {x.mode || "OFFLINE"}</em>
              <span className="mono">{x.slug}</span>
              Open exam dashboard →
            </button>
          ))}
        </div>
        {!exams.length && <p className="hint">No examination is bound to this login. Ask Main Admin to bind an exam on Users.</p>}
      </div>
    );
  }

  const k = data?.kpis || {};
  const exam = data?.exam || exams.find((e) => e.id === examId);

  return (
    <div className="dsx-examdash">
      <div className="dsx-dash-scope">
        <label>Examination
          {exams.length <= 1 ? (
            <input value={exam ? `${exam.slug || exam.code || ""} — ${exam.name}` : ""} readOnly />
          ) : (
            <select value={examId} onChange={(e) => pickExam(e.target.value)}>
              {exams.map((x) => <option key={x.id} value={x.id}>{x.slug} — {x.name}</option>)}
            </select>
          )}
        </label>
        <label>Exam date
          <input value={exam?.exam_date || ""} readOnly />
        </label>
        <label>Shift
          <select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">All shifts</option>
            {(data?.shifts || []).map((s) => <option key={s.id} value={s.id}>{s.name} {s.start_time}–{s.end_time}</option>)}
          </select>
        </label>
        <label>Centre
          <select value={centreId} onChange={(e) => { setCentreId(e.target.value); setLabId(""); }}>
            <option value="">All centres</option>
            {(data?.centres || []).map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
          </select>
        </label>
        <label>Lab / classroom
          <select value={labId} onChange={(e) => setLabId(e.target.value)}>
            <option value="">All labs</option>
            {(data?.labs || []).filter((l) => !centreId || l.centre_id === centreId).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option>Normal</option>
            <option>Attention</option>
            <option>Critical</option>
            <option>Offline</option>
          </select>
        </label>
        <label className="row" style={{ alignItems: "center" }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto refresh
        </label>
        <button className="btn ghost" type="button" onClick={load}>Refresh</button>
      </div>
      <p className="hint">
        {exam?.name} · {exam?.exam_date} · live operational view · last refresh {data?.refreshedAt ? new Date(data.refreshedAt).toLocaleTimeString() : "—"}
        {data?.live ? " · LIVE" : " · stale"}
      </p>
      {err && <p className="err">{err}</p>}
      {!data && <p>Loading exam dashboard…</p>}
      {data && (
        <>
          <div className="cards dsx-kpi-row">
            {[
              ["OTR", k.otr], ["Registered", k.registered], ["Eligible", k.eligible], ["Allocated", k.allocated],
              ["Unallocated", k.unallocated], ["Exceptions", k.exceptions], ["Centres", k.centres], ["Labs", k.labs],
              ["Gate pass", k.passes], ["Gate entry", k.gateEntry], ["Present", k.present], ["Absent", k.absent],
              ["Face verified", k.face], ["Fingerprint", k.fingerprint], ["Pending verify", k.pendingVerify],
              ["Centres online", k.centresOnline], ["Centres offline", k.centresOffline],
            ].map(([label, n]) => (
              <div key={label} className="metric"><span>{label}</span><b>{n ?? 0}</b></div>
            ))}
          </div>

          <div className="panel">
            <h3>Attendance funnel</h3>
            <p className="hint">Registered → Allocated → Gate entry → Verified → Present / Absent</p>
            <div className="pipeline">
              <div className="pipe"><span>Registered</span><b>{data.funnel.registered}</b></div>
              <div className="pipe"><span>Allocated</span><b>{data.funnel.allocated}</b></div>
              <div className="pipe"><span>Gate entry</span><b>{data.funnel.gateEntry}</b></div>
              <div className="pipe"><span>Verified</span><b>{data.funnel.verified}</b></div>
              <div className="pipe"><span>Present</span><b>{data.funnel.present}</b></div>
              <div className="pipe"><span>Absent</span><b>{data.funnel.absent}</b></div>
            </div>
          </div>

          {isAdmin && (
            <div className="panel">
              <h3>Admin controls</h3>
              <p className="hint">Allocation rule-set v{data.allocation.ruleVersion} · last run {data.allocation.lastRun || "never"}</p>
              <div className="dsx-quick">
                <Link className="btn" to="/admin/exams">Create exam</Link>
                <Link className="btn" to="/admin/centres">Upload centres</Link>
                <Link className="btn" to="/admin/allocation">Configure rules / run</Link>
                <Link className="btn" to="/admin/passes">Generate passes</Link>
                <Link className="btn" to="/admin/reports">Reports</Link>
                <Link className="btn ghost" to={`/admin/exams/${examId}`}>Exam desk</Link>
              </div>
              {data.control && (
                <div className="cards">
                  <div className="metric"><span>Devices</span><b>{data.control.devices}</b></div>
                  <div className="metric"><span>Offline</span><b>{data.control.offline}</b></div>
                  <div className="metric"><span>Sync queue</span><b>{data.control.pendingSync}</b></div>
                  <div className="metric"><span>Open alerts</span><b>{data.control.openAlerts}</b></div>
                </div>
              )}
            </div>
          )}

          <div className="dsx-quick">
            {[
              ["/admin/reports", "Exam summary"],
              ["/admin/attendance", "Attendance report"],
              ["/admin/centres", "Centre report"],
              ["/admin/staff", "Staff report"],
            ].filter(() => isAdmin).map(([to, label]) => <Link key={to} className="btn ghost" to={to}>{label}</Link>)}
            {!isAdmin && <button className="btn ghost" type="button" onClick={() => downloadCsv(`exam-${exam?.slug}-centres.csv`, data.centres)}>Export centre CSV</button>}
          </div>

          <div className="tabs desk-tabs">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {tab === "centres" && (
            <div className="panel">
              <h3>Centre performance</h3>
              <table>
                <thead>
                  <tr>
                    <th>Centre</th><th>City</th><th>Capacity</th><th>Allocated</th><th>Remaining</th>
                    <th>Present</th><th>Absent</th><th>Gate</th><th>Labs</th><th>Staff</th>
                    <th>Devices</th><th>Util %</th><th>Att %</th><th>Status</th><th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {data.centres.map((c) => (
                    <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => { setCentreId(c.id); setTab("labs"); }}>
                      <td><b>{c.code}</b><div>{c.name}</div></td>
                      <td>{c.city}</td>
                      <td>{c.capacity}</td>
                      <td>{c.allocated}</td>
                      <td>{c.remaining}</td>
                      <td>{c.present}</td>
                      <td>{c.absent}</td>
                      <td>{c.gateEntry}</td>
                      <td>{c.labsActive}/{c.labs}</td>
                      <td>{c.staff}</td>
                      <td>{c.devicesOnline}/{c.devicesTotal}</td>
                      <td>{c.utilization}</td>
                      <td>{c.attendancePct}</td>
                      <td><span className={`pill ${toneClass(c.tone)}`}>{c.status}</span></td>
                      <td className="hint">{c.lastUpdate || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">Click a centre to open its labs. Status is rule-based: offline devices, utilization and denials.</p>
            </div>
          )}

          {tab === "labs" && (
            <div className="panel">
              <h3>Labs / classrooms {centreId ? "· this centre" : ""}</h3>
              <p className="hint">Seat numbers are not required unless the exam is CBT.</p>
              <table>
                <thead>
                  <tr><th>Lab</th><th>Centre</th><th>Type</th><th>Cap</th><th>Allocated</th><th>Present</th><th>Util %</th><th>Staff</th><th>Device</th><th>Status</th><th>Last</th></tr>
                </thead>
                <tbody>
                  {data.labs.map((l) => (
                    <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => { setLabId(l.id); setCentreId(l.centre_id); setTab("candidates"); }}>
                      <td><b>{l.name}</b><div className="mono">{l.code}</div></td>
                      <td>{l.centreName}</td>
                      <td>{l.roomType}</td>
                      <td>{l.capacity}</td>
                      <td>{l.allocated}</td>
                      <td>{l.present}</td>
                      <td>{l.utilization}</td>
                      <td>{l.staff}</td>
                      <td>{l.deviceId || "—"} {l.deviceStatus}</td>
                      <td><span className={`pill ${toneClass(l.tone)}`}>{l.status}</span></td>
                      <td className="hint">{l.lastActivity || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "staff" && (
            <div className="panel">
              <h3>Staff — centre and lab</h3>
              {isAdmin && <Link className="btn" to="/admin/staff">Manage assignments</Link>}
              <table>
                <thead><tr><th>Name</th><th>Role</th><th>Centre</th><th>Lab</th><th>Status</th></tr></thead>
                <tbody>
                  {data.staff.map((s) => (
                    <tr key={s.id}>
                      <td>{s.full_name}<div className="mono">{s.staff_id}</div></td>
                      <td>{s.role}</td>
                      <td>{s.centre_id}</td>
                      <td>{s.lab_id || "—"}</td>
                      <td>{s.staff_status} / {s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "candidates" && (
            <div className="panel">
              <h3>Candidates {labId ? "· this lab" : centreId ? "· this centre" : ""}</h3>
              <table>
                <thead>
                  <tr><th>OTR</th><th>Name</th><th>Centre</th><th>Lab</th><th>Allocation</th><th>Pass</th><th>Presence</th><th></th></tr>
                </thead>
                <tbody>
                  {data.candidates.map((c) => (
                    <tr key={c.applicationId}>
                      <td className="mono">{c.otr_id}</td>
                      <td>{c.full_name}{isAdmin ? <div className="hint">{c.mobile}</div> : null}</td>
                      <td>{c.centre_id || "—"}</td>
                      <td>{c.lab_id || "—"}</td>
                      <td>{c.allocation_status || "—"}</td>
                      <td>{c.passStatus}</td>
                      <td><span className={`pill ${c.presence === "CLASSROOM_PRESENT" ? "ok" : c.presence === "CENTRE_ENTRY_VERIFIED" ? "warnp" : "muted"}`}>{c.presence || "—"}</span></td>
                      <td><button className="btn ghost" type="button" onClick={() => openCandidate(c)}>History</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detail && (
                <div className="panel" style={{ marginTop: 12 }}>
                  <h3>{detail.full_name} · {detail.otr_id}</h3>
                  <p className="hint">Gate pass → gate entry → verification → attendance</p>
                  <p>Pass: {detail.pass?.status || "none"} · Application {detail.application?.status} · Centre {detail.application?.centre_id} · Lab {detail.application?.lab_id}</p>
                  <table>
                    <thead><tr><th>Time</th><th>Event</th><th>Result</th><th>Face</th><th>FP</th></tr></thead>
                    <tbody>
                      {(detail.events || []).map((e) => (
                        <tr key={e.id}>
                          <td>{e.created_at}</td>
                          <td>{e.event_kind}</td>
                          <td>{e.result}</td>
                          <td>{e.face_class || e.face_score || "—"}</td>
                          <td>{e.fp_score ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="btn ghost" type="button" onClick={() => setDetail(null)}>Close</button>
                </div>
              )}
            </div>
          )}

          {tab === "gate" && (
            <div className="panel">
              <h3>Gate pass &amp; gate entry</h3>
              <div className="cards">
                <div className="metric"><span>Generated</span><b>{data.gate.generated}</b></div>
                <div className="metric"><span>Scanned</span><b>{data.gate.scanned}</b></div>
                <div className="metric"><span>Invalid / denied</span><b>{data.gate.invalid}</b></div>
                <div className="metric"><span>Successful entry</span><b>{data.gate.entry}</b></div>
                <div className="metric"><span>Pending / hold</span><b>{data.gate.pending}</b></div>
              </div>
              {isAdmin && <Link className="btn" to="/admin/gate">Open gate events</Link>}
            </div>
          )}

          {tab === "verify" && (
            <div className="panel">
              <h3>Verification</h3>
              <div className="cards">
                <div className="metric"><span>Face matched</span><b>{data.verification.faceOk}</b></div>
                <div className="metric"><span>Face failed</span><b>{data.verification.faceFail}</b></div>
                <div className="metric"><span>Fingerprint matched</span><b>{data.verification.fpOk}</b></div>
                <div className="metric"><span>Fingerprint failed</span><b>{data.verification.fpFail}</b></div>
                <div className="metric"><span>Pending</span><b>{data.verification.pending}</b></div>
              </div>
            </div>
          )}

          {tab === "attendance" && (
            <div className="panel">
              <h3>Attendance</h3>
              <p className="hint">Present is classroom-gate success. Absent = allocated − present for this exam scope.</p>
              <div className="cards">
                <div className="metric"><span>Present</span><b>{k.present}</b></div>
                <div className="metric"><span>Absent</span><b>{k.absent}</b></div>
                <div className="metric"><span>Attendance %</span><b>{k.allocated ? Math.round((k.present / k.allocated) * 100) : 0}</b></div>
              </div>
              {isAdmin && <Link className="btn" to="/admin/attendance">Corrections</Link>}
            </div>
          )}

          {tab === "allocation" && (
            <div className="panel">
              <h3>Allocation</h3>
              <div className="cards">
                <div className="metric"><span>Eligible</span><b>{data.allocation.eligible}</b></div>
                <div className="metric"><span>Allocated</span><b>{data.allocation.allocated}</b></div>
                <div className="metric"><span>Unallocated</span><b>{data.allocation.unallocated}</b></div>
                <div className="metric"><span>Exceptions</span><b>{data.allocation.exceptions}</b></div>
                <div className="metric"><span>Manual</span><b>{data.allocation.manual}</b></div>
                <div className="metric"><span>Locked</span><b>{data.allocation.locked}</b></div>
              </div>
              <p className="hint">Rule-set version {data.allocation.ruleVersion}. Client can view counts only.</p>
              {isAdmin && (
                <div className="dsx-quick">
                  <Link className="btn" to="/admin/allocation">Run / configure</Link>
                  <Link className="btn ghost" to="/admin/exceptions">Exception queue</Link>
                </div>
              )}
            </div>
          )}

          {tab === "devices" && (
            <div className="panel">
              <h3>Device &amp; technical health</h3>
              <table>
                <thead><tr><th>Device</th><th>Kind</th><th>Centre</th><th>Lab</th><th>Status</th><th>Last sync</th></tr></thead>
                <tbody>
                  {data.devices.map((d) => (
                    <tr key={d.id}>
                      <td className="mono">{d.id}</td>
                      <td>{d.kind}</td>
                      <td>{d.centre_id}</td>
                      <td>{d.lab_id || "—"}</td>
                      <td><span className={`pill ${d.status === "ONLINE" ? "ok" : "warnp"}`}>{d.status}</span></td>
                      <td>{d.last_sync || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "alerts" && (
            <div className="panel">
              <h3>Incidents &amp; alerts</h3>
              {!data.alerts.length && <p className="hint">No incidents in this scope.</p>}
              {data.alerts.map((a) => (
                <div key={a.id} className="row" style={{ marginBottom: 8 }}>
                  <span className={`pill ${String(a.severity).toLowerCase().includes("crit") ? "bad" : "warnp"}`}>{a.severity}</span>
                  <span>{a.message}</span>
                  <span className="hint">{a.centre_id} · {a.status} · {a.created_at}</span>
                </div>
              ))}
            </div>
          )}

          {tab === "timeline" && (
            <div className="panel">
              <h3>Exam timeline</h3>
              <table>
                <thead><tr><th>Milestone</th><th>Time</th><th>Status</th></tr></thead>
                <tbody>
                  {data.timeline.map((t) => (
                    <tr key={t.key}>
                      <td>{t.label}</td>
                      <td>{t.at}</td>
                      <td><span className={`pill ${t.status === "live" ? "ok" : t.status === "done" ? "muted" : "warnp"}`}>{t.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
