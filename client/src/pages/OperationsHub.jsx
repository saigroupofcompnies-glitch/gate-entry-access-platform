import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setSession } from "../api";
import PublicChrome from "../PublicChrome.jsx";
import { homeForRole } from "../homeForRole.js";

const DESKS = [
  { id: "student", title: "Student", text: "Mobile and OTP after OTR." },
  { id: "staff", title: "Staff", text: "Duty login. Download ID card and gate pass." },
  { id: "incharge", title: "Centre Incharge", text: "Venue staff and presence." },
  { id: "client", title: "Control room", text: "Live view across centres." },
  { id: "admin", title: "Admin", text: "Exams, boarding passes and users." },
];

export default function OperationsHub() {
  const nav = useNavigate();
  const [desk, setDesk] = useState("student");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const spec = DESKS.find((d) => d.id === desk);
  const isStudent = desk === "student";

  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      if (isStudent) {
        const data = await api("/api/auth/candidate-otp", { method: "POST", body: { mobile, otp } });
        setSession(data.token, data.user);
        nav("/candidate");
        return;
      }
      const data = await api("/api/auth/login", { method: "POST", body: { username, password } });
      setSession(data.token, data.user);
      nav(homeForRole(data.user.role));
    } catch (e2) {
      const map = {
        CANDIDATE_NOT_FOUND: "No OTR found for this mobile. Register first.",
        INVALID_OTP: "OTP is incorrect.",
        INVALID_CREDENTIALS: "User ID or password is incorrect.",
      };
      setErr(map[e2.message] || e2.message);
    }
  }

  return (
    <PublicChrome
      page="login"
      banner="/exam/face-match-kiosk.jpg"
      title="Login"
      subtitle="Student, staff, centre incharge, control room and admin — one sign-in."
    >
      <div className="dsx-login-picks">
        {DESKS.map((d) => (
          <button key={d.id} type="button" className={`dsx-pick ${desk === d.id ? "on" : ""}`} onClick={() => { setDesk(d.id); setErr(""); }}>
            <strong>{d.title}</strong>
            <span>{d.text}</span>
          </button>
        ))}
      </div>
      <form className="panel dsx-panel" style={{ maxWidth: 480, margin: "18px auto" }} onSubmit={submit}>
        <h3>{spec.title}</h3>
        {isStudent ? (
          <>
            <label>Registered mobile</label>
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} required />
            <label>OTP</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} required />
            <p className="hint">New student? <Link to="/otr">Create OTR</Link></p>
          </>
        ) : (
          <>
            <label>User ID</label>
            <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <label>Password</label>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {desk === "staff" && (
              <p className="hint">New staff? <Link to="/staff-register">Register for duty</Link></p>
            )}
          </>
        )}
        {err && <p className="err">{err}</p>}
        <button className="btn" type="submit" style={{ marginTop: 14 }}>Sign in</button>
      </form>
    </PublicChrome>
  );
}
