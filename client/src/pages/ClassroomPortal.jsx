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
  const open = result?.decision === "GRANTED";

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

  const cbt = result?.examMode === "CBT" || scan?.exam?.mode === "CBT";

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="kicker">Classroom gate</div>
          <h2 style={{ margin: 0 }}>One device · {user?.labId || "unbound"} · face verify</h2>
        </div>
      </div>

      <div className={`gate-stage ${open ? "open" : ""}`}>
        <div className="gate-hall">{open ? "CLASSROOM OPEN · PRESENT" : "HOLD AT CLASSROOM GATE"}</div>
        <div className="gate-door left" />
        <div className="gate-door right" />
      </div>
      <p className="gate-hold">
        {open
          ? `Control room & server updated${result.classroom?.seat ? ` · seat ${result.classroom.seat}` : " · offline · no seat"}`
          : "Centre entry first, then this classroom device"}
      </p>

      <div className="panel">
        <p className="hint">
          Install one device on this classroom gate. After face match the student is marked present in this room.
          CBT assigns a seat here. Offline paper does not assign a seat. Occupancy posts to the control room immediately.
        </p>
        <form onSubmit={lookup}>
          <label>Boarding pass token</label>
          <textarea rows={3} value={token} onChange={(e) => setToken(e.target.value)} />
          <button className="btn" type="submit" style={{ marginTop: 10 }}>Identify student</button>
        </form>
        {err && <p className="err">{err}</p>}
        {scan?.candidate && (
          <div>
            <p>
              {scan.candidate.full_name} · {scan.presence?.state} · {scan.exam?.mode || "OFFLINE"}
              <br />This device classroom: {user?.labId}
            </p>
            <CameraCapture onCapture={setPhoto} />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => decide(false)}>Verify face &amp; mark classroom present</button>
              <button className="btn ghost" onClick={() => decide(true)}>Authorized exception</button>
            </div>
          </div>
        )}
        {result && (
          <div style={{ marginTop: 12 }}>
            <h3>{result.headline}</h3>
            {result.classroom && (
              <p>
                Present in room: {result.classroom.present}/{result.classroom.capacity}
                {cbt && result.classroom.seat ? ` · Seat ${result.classroom.seat}` : " · No seat (offline)"}
                <br />
                <span className="hint">Synced {result.syncedAt ? new Date(result.syncedAt).toLocaleTimeString() : "now"}</span>
              </p>
            )}
            <span className={`pill ${result.decision === "GRANTED" ? "ok" : "bad"}`}>{result.decision}</span>
          </div>
        )}
      </div>
    </div>
  );
}
