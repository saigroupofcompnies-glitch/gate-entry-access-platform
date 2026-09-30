import { useState } from "react";
import CameraCapture from "../CameraCapture.jsx";
import { api, getUser } from "../api";

export default function ClassroomPortal() {
  const user = getUser();
  const [token, setToken] = useState("");
  const [scan, setScan] = useState(null);
  const [photo, setPhoto] = useState("");
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  async function lookup(e) {
    e.preventDefault();
    setErr("");
    setResult(null);
    try {
      setScan(await api("/api/gate/scan", { method: "POST", body: { token } }));
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function decide(override = false) {
    try {
      const data = await api("/api/gate/access-decision", {
        method: "POST",
        body: { token, livePhoto: photo, stage: "CLASSROOM", override },
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
          <div className="kicker">Stage 2 · Classroom / Lab</div>
          <h2 style={{ margin: 0 }}>Device {user?.labId || "unbound"} — second face verification</h2>
        </div>
      </div>
      <div className="panel">
        <p className="hint">The student does not choose a lab. This device identity is {user?.labId}. Centre-entered students are not PRESENT until this check succeeds.</p>
        <form onSubmit={lookup}>
          <label>Boarding pass token</label>
          <textarea rows={3} value={token} onChange={(e) => setToken(e.target.value)} />
          <button className="btn" type="submit" style={{ marginTop: 10 }}>Identify student</button>
        </form>
        {err && <p className="err">{err}</p>}
        {scan?.candidate && (
          <div>
            <p>{scan.candidate.full_name} · {scan.presence.state}</p>
            <CameraCapture onCapture={setPhoto} />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => decide(false)}>Confirm classroom presence</button>
              <button className="btn ghost" onClick={() => decide(true)}>Authorized exception</button>
            </div>
          </div>
        )}
        {result && (
          <div>
            <h3>{result.headline}</h3>
            <span className={`pill ${result.decision === "GRANTED" ? "ok" : "bad"}`}>{result.decision}</span>
          </div>
        )}
      </div>
    </div>
  );
}
