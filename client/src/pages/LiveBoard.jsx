import { useEffect, useState } from "react";
import { api } from "../api";

export default function LiveBoard({ mode }) {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [ov, setOv] = useState(null);
  const [labs, setLabs] = useState([]);
  const [students, setStudents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const client = mode === "client";

  useEffect(() => {
    api("/api/live/exams").then((rows) => {
      setExams(rows);
      if (rows[0] && !examId) setExamId(rows[0].id);
    }).catch(() => {});
  }, []);

  async function refresh(id) {
    const q = id || examId;
    const qs = q ? `?examId=${encodeURIComponent(q)}` : "";
    const [a, b, c, d] = await Promise.all([
      api("/api/live/overview" + qs),
      api("/api/live/labs" + qs),
      api("/api/live/students" + qs),
      api("/api/live/alerts" + qs),
    ]);
    setOv(a); setLabs(b); setStudents(c); setAlerts(d);
  }

  useEffect(() => {
    if (!examId && exams.length === 0) return;
    refresh(examId);
    const timer = setInterval(() => refresh(examId), 8000);
    return () => clearInterval(timer);
  }, [examId]);

  if (!ov) return <p>Loading live counters…</p>;

  return (
    <div className={client ? "control-room" : ""}>
      <div className="topbar">
        <div>
          <div className="kicker">{client ? "Client Control Room · all centres" : "Centre Incharge · this venue"}</div>
          <h2 style={{ margin: 0 }}>{ov.examName} · {ov.centreName}</h2>
        </div>
        <div>
          <label className="hint">Exam</label>
          <select value={examId} onChange={(e) => setExamId(e.target.value)}>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.slug || ex.code} · {ex.name} ({ex.lifecycle})</option>
            ))}
          </select>
          <div className="hint">{client ? "Full exam: centres, classrooms, students" : "Staff approval is on the Staff tab"} · {new Date(ov.generatedAt).toLocaleTimeString()}</div>
        </div>
      </div>
      <div className="cards">
        <div className="metric"><span>Applications</span><b>{ov.totalApps}</b></div>
        <div className="metric"><span>Centre entered</span><b>{ov.centreEntered}</b></div>
        <div className="metric"><span>Not yet in lab</span><b>{ov.centreEnteredOnly}</b></div>
        <div className="metric"><span>Classroom present</span><b>{ov.classroomPresent}</b></div>
        <div className="metric"><span>Denied</span><b>{ov.denied}</b></div>
        <div className="metric"><span>Open alerts</span><b>{ov.openAlerts}</b></div>
      </div>
      <div className="panel">
        <h3>Classrooms / labs</h3>
        <table>
          <thead><tr><th>Lab</th><th>Building</th><th>Present</th><th>Capacity</th><th>%</th></tr></thead>
          <tbody>
            {labs.map((l) => (
              <tr key={l.id}>
                <td className="mono">{l.id} {l.name}</td>
                <td>{l.building} / {l.floor}</td>
                <td>{l.present}</td>
                <td>{l.capacity}</td>
                <td>{l.occupancy}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mode === "students" || mode === "client" ? (
        <div className="panel">
          <h3>Students — centre entry is not classroom presence</h3>
          <table>
            <thead><tr><th>OTR</th><th>Name</th><th>State</th><th>Lab</th></tr></thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.otr_id}</td>
                  <td>{s.full_name}</td>
                  <td>
                    <span className={`pill ${s.presence.state === "CLASSROOM_PRESENT" ? "ok" : s.presence.state === "CENTRE_ENTRY_VERIFIED" ? "warnp" : "muted"}`}>
                      {s.presence.state}
                    </span>
                  </td>
                  <td>{s.presence.room?.lab_id || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {(mode === "alerts" || mode === "client" || mode === "centre") && (
        <div className="panel">
          <h3>Exceptions</h3>
          {alerts.length === 0 && <p className="hint">No open exceptions.</p>}
          {alerts.map((a) => (
            <div key={a.id} className="row" style={{ marginBottom: 6 }}>
              <span className={`pill bad`}>{a.severity}</span>
              <span>{a.message}</span>
              <span className="hint">{a.created_at}</span>
            </div>
          ))}
        </div>
      )}
      {mode === "centre" && (
        <div className="panel">
          <h3>Devices on this centre</h3>
          <table>
            <thead><tr><th>ID</th><th>Kind</th><th>Status</th></tr></thead>
            <tbody>
              {ov.devices.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.id}</td>
                  <td>{d.kind}</td>
                  <td><span className={`pill ${d.status === "ONLINE" ? "ok" : "warnp"}`}>{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
