import { useEffect, useState } from "react";
import { api } from "../api";

export default function CommandPortal() {
  const [ov, setOv] = useState(null);
  const [labs, setLabs] = useState([]);
  const [students, setStudents] = useState([]);
  const [alerts, setAlerts] = useState([]);

  async function refresh() {
    const [a, b, c, d] = await Promise.all([
      api("/api/live/overview"),
      api("/api/live/labs"),
      api("/api/live/students"),
      api("/api/live/alerts"),
    ]);
    setOv(a); setLabs(b); setStudents(c); setAlerts(d);
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  if (!ov) return <p>Loading live counters…</p>;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="kicker">Department command centre</div>
          <h2 style={{ margin: 0 }}>Pilot 2026 · live presence</h2>
        </div>
        <span className="hint">Classroom gate → server → this board · 3s · {new Date(ov.generatedAt).toLocaleTimeString()}</span>
      </div>
      <div className="cards">
        <div className="metric"><span>Applications</span><b>{ov.totalApps}</b></div>
        <div className="metric"><span>Centre entered</span><b>{ov.centreEntered}</b></div>
        <div className="metric"><span>Entered only (not in lab)</span><b>{ov.centreEnteredOnly}</b></div>
        <div className="metric"><span>Classroom present</span><b>{ov.classroomPresent}</b></div>
        <div className="metric"><span>Fingerprint at centre</span><b>{ov.fingerprintMatched ?? 0}</b></div>
        <div className="metric"><span>Denied</span><b>{ov.denied}</b></div>
        <div className="metric"><span>Open alerts</span><b>{ov.openAlerts}</b></div>
      </div>
      <div className="panel">
        <h3>Classroom gates (one device per room){ov.examMode === "CBT" ? " · CBT seats" : " · offline · no seats"}</h3>
        <table>
          <thead><tr><th>Lab</th><th>Device</th><th>Present</th><th>Capacity</th><th>%</th><th>Last update</th></tr></thead>
          <tbody>
            {labs.map((l) => (
              <tr key={l.id}>
                <td className="mono">{l.id} {l.name}</td>
                <td>{l.deviceId || "—"}</td>
                <td>{l.present}</td>
                <td>{l.capacity}</td>
                <td>{l.occupancy}%</td>
                <td className="hint">{l.lastPresentAt || l.lastSync || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h3>Students — identity vs presence</h3>
        <table>
            <thead><tr><th>OTR</th><th>Name</th><th>State</th><th>Lab</th>{ov.examMode === "CBT" ? <th>Seat</th> : null}</tr></thead>
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
                  <td>{s.lab_name || s.presence.room?.lab_id || "—"}</td>
                  {ov.examMode === "CBT" ? <td className="mono">{s.seat_no || "—"}</td> : null}
                </tr>
              ))}
            </tbody>
        </table>
      </div>
      <div className="panel">
        <h3>Alerts</h3>
        {alerts.length === 0 && <p className="hint">No open exceptions.</p>}
        {alerts.map((a) => (
          <div key={a.id} className="row" style={{ marginBottom: 6 }}>
            <span className="pill bad">{a.severity}</span>
            <span>{a.message}</span>
            <span className="hint">{a.created_at}</span>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>Devices</h3>
        <table>
          <thead><tr><th>ID</th><th>Kind</th><th>Status</th><th>Lab/Gate</th></tr></thead>
          <tbody>
            {ov.devices.map((d) => (
              <tr key={d.id}>
                <td className="mono">{d.id}</td>
                <td>{d.kind}</td>
                <td><span className={`pill ${d.status === "ONLINE" ? "ok" : "warnp"}`}>{d.status}</span></td>
                <td>{d.lab_id || d.gate_id || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
