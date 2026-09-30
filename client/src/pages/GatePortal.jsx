import { useState } from "react";
import CameraCapture from "../CameraCapture.jsx";
import { api } from "../api";

export default function GatePortal() {
  const [token, setToken] = useState("");
  const [scan, setScan] = useState(null);
  const [photo, setPhoto] = useState("");
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  async function lookup(e) {
    e?.preventDefault();
    setErr("");
    setResult(null);
    try {
      setScan(await api("/api/gate/scan", { method: "POST", body: { token } }));
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function decide(override = false) {
    setErr("");
    try {
      const data = await api("/api/gate/access-decision", {
        method: "POST",
        body: { token, livePhoto: photo, stage: "GATE", override, overrideReason: override ? "Authorized secondary review" : "" },
      });
      setResult(data);
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="kicker">Stage 1 · Centre gate</div>
          <h2 style={{ margin: 0 }}>Boarding pass validation</h2>
        </div>
      </div>
      <div className="panel">
        <form onSubmit={lookup}>
          <label>Paste signed QR token (or scan into this field)</label>
          <textarea rows={3} value={token} onChange={(e) => setToken(e.target.value)} />
          <button className="btn" type="submit" style={{ marginTop: 10 }}>Validate pass</button>
        </form>
        {err && <p className="err">{err}</p>}
        {scan?.valid && scan.kind === "CANDIDATE" && (
          <div style={{ marginTop: 16 }}>
            <p>
              <b>{scan.candidate.full_name}</b> · {scan.candidate.otr_id}
              <br />Exam {scan.exam.name} · Centre {scan.application.centre_id}
              <br />Presence: <span className="pill warnp">{scan.presence.state}</span>
            </p>
            {scan.profile?.photo_data && <img src={scan.profile.photo_data} alt="Enrolled" width="96" style={{ borderRadius: 8 }} />}
            <h3>Live face</h3>
            <CameraCapture onCapture={setPhoto} />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" type="button" onClick={() => decide(false)}>Verify & grant centre entry</button>
              <button className="btn ghost" type="button" onClick={() => decide(true)}>Supervisor override</button>
            </div>
          </div>
        )}
        {scan?.valid && scan.kind === "STAFF" && (
          <div style={{ marginTop: 16 }}>
            <p><b>{scan.staff.full_name}</b> · {scan.staff.id} · {scan.staff.status}</p>
            <CameraCapture onCapture={setPhoto} />
            <button className="btn" type="button" onClick={() => decide(false)}>Staff access decision</button>
          </div>
        )}
        {result && (
          <div className="panel">
            <span className={`pill ${result.decision === "GRANTED" ? "ok" : result.decision === "REVIEW" ? "warnp" : "bad"}`}>{result.decision}</span>
            <p>{result.headline}</p>
            <p className="mono">Face {result.face?.klass} · score {result.face?.score} · {result.eventId}</p>
          </div>
        )}
      </div>
    </div>
  );
}
