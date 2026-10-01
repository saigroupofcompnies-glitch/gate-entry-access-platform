import { useEffect, useRef, useState } from "react";
import CameraCapture from "../CameraCapture.jsx";
import { api } from "../api";

export default function GatePortal() {
  const [token, setToken] = useState("");
  const [scan, setScan] = useState(null);
  const [photo, setPhoto] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const deciding = useRef(false);
  const open = result?.decision === "GRANTED";

  async function lookup(raw) {
    const value = String(raw || token).trim();
    if (!value) return;
    setErr("");
    setResult(null);
    setPhoto("");
    deciding.current = false;
    try {
      const data = await api("/api/gate/scan", { method: "POST", body: { token: value } });
      setScan(data);
      setToken(value);
      if (data.valid === false) setErr(data.reason === "ADMIT_CARD_REQUIRED" ? "Gate pass / admit card not issued." : data.reason);
    } catch (e2) {
      setScan(null);
      setErr(e2.message === "PASS_NOT_FOUND" ? "This QR is not a valid DigiSecureExam gate pass." : e2.message);
    }
  }

  async function decide(livePhoto) {
    if (!livePhoto || deciding.current) return;
    deciding.current = true;
    setBusy(true);
    setErr("");
    try {
      const data = await api("/api/gate/access-decision", {
        method: "POST",
        body: { token, livePhoto, stage: "GATE" },
      });
      setResult(data);
      if (data.decision === "GRANTED") {
        setTimeout(() => {
          setToken("");
          setScan(null);
          setPhoto("");
          setResult(null);
          deciding.current = false;
        }, 7000);
      } else {
        deciding.current = false;
      }
    } catch (e2) {
      setErr(e2.message);
      deciding.current = false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (photo && scan?.valid) decide(photo);
  }, [photo]);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="kicker">Sentinel Gate</div>
          <h2 style={{ margin: 0 }}>Scan gate pass → face auto-match → gate opens</h2>
        </div>
      </div>

      <div className={`gate-stage ${open ? "open" : ""}`}>
        <div className="gate-hall">{open ? "GATE OPEN · PROCEED" : busy ? "MATCHING FACE…" : "HOLD POSITION · SCAN PASS"}</div>
        <div className="gate-door left" />
        <div className="gate-door right" />
      </div>
      <p className="gate-hold">
        {open
          ? `${result.headline}`
          : scan?.valid && scan.kind === "CANDIDATE"
            ? "Look at the camera. Live face is matched to OTR photo and registration photo."
            : "Student scans gate pass / admit card QR on this machine first."}
      </p>

      <div className="panel">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            lookup();
          }}
        >
          <label>Gate pass / admit card QR</label>
          <input
            autoFocus
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onBlur={() => { if (token.trim().length > 20) lookup(token); }}
            placeholder="USB scanner types the QR here, then Enter"
          />
          <button className="btn" type="submit" style={{ marginTop: 10 }}>Read pass</button>
        </form>
        {err && <p className="err">{err}</p>}

        {scan?.valid && scan.kind === "CANDIDATE" && (
          <div className="gate-match" style={{ marginTop: 16 }}>
            <p>
              Pass holder identified: <b>{scan.candidate.full_name}</b> · {scan.candidate.otr_id}
              <br />{scan.exam.name} · {scan.centre?.name}
            </p>
            <div className="gate-photos">
              <figure>
                {scan.otrPhoto ? <img src={scan.otrPhoto} alt="OTR" /> : <div className="pass-photo-miss">No OTR photo</div>}
                <figcaption>OTR photo</figcaption>
              </figure>
              <figure>
                {scan.registrationPhoto ? <img src={scan.registrationPhoto} alt="Registration" /> : <div className="pass-photo-miss">No registration photo</div>}
                <figcaption>Registration photo</figcaption>
              </figure>
              <figure>
                <CameraCapture autoSnap kiosk onCapture={setPhoto} />
                <figcaption>Live camera</figcaption>
              </figure>
            </div>
            {busy && <p className="hint">Auto-matching live face with both enrolled photos…</p>}
          </div>
        )}

        {scan?.valid && scan.kind === "STAFF" && (
          <div style={{ marginTop: 16 }}>
            <p><b>{scan.staff.full_name}</b> · staff duty pass</p>
            <CameraCapture autoSnap kiosk onCapture={setPhoto} />
          </div>
        )}

        {result && (
          <div className="panel">
            <span className={`pill ${result.decision === "GRANTED" ? "ok" : result.decision === "REVIEW" ? "warnp" : "bad"}`}>{result.decision}</span>
            <p>{result.headline || result.message || (result.decision === "GRANTED" ? "Gate opening." : "Face did not match enrolled photos.")}</p>
            {result.face?.otr && (
              <p className="hint">OTR photo score {result.face.otr.score} · Registration photo score {result.face.registration?.score}</p>
            )}
            {result.assignedLab && result.decision === "GRANTED" && <p><b>Go to classroom: {result.assignedLab.name}</b></p>}
          </div>
        )}
      </div>
    </div>
  );
}
