import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setSession } from "../api";

const HOME = {
  SUPER_ADMIN: "/command",
  DEPARTMENT_OFFICER: "/command",
  CENTRE_HEAD: "/head",
  SECURITY_OPERATOR: "/gate",
  BIOMETRIC_OPERATOR: "/classroom",
  CENTRE_OPERATOR: "/command",
  CANDIDATE: "/candidate",
};

export default function Login() {
  const nav = useNavigate();
  const [tab, setTab] = useState("staff");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Pilot@123");
  const [mobile, setMobile] = useState("9810000001");
  const [otp, setOtp] = useState("123456");
  const [err, setErr] = useState("");

  async function staffLogin(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await api("/api/auth/login", { method: "POST", body: { username, password } });
      setSession(data.token, data.user);
      nav(HOME[data.user.role] || "/command");
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function candLogin(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await api("/api/auth/candidate-otp", { method: "POST", body: { mobile, otp } });
      setSession(data.token, data.user);
      nav("/candidate");
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="kicker">SRS v1.0 · Pilot</div>
          <h1>Examination Identity, Access & Live Centre Management</h1>
          <p>Register identity once. Examination boarding pass is a time-bound transaction. Centre entry is not classroom presence.</p>
          <p className="hint" style={{ color: "#cbb" }}>
            Demo staff password for all seeded users: <b className="mono">Pilot@123</b>
            <br />admin · officer · centrehead · gate · classroom · operator
            <br />Candidate OTP: <b className="mono">123456</b> · 9810000001
          </p>
        </div>
        <div className="login-form">
          <div className="tabs">
            <button className={tab === "staff" ? "on" : ""} type="button" onClick={() => setTab("staff")}>Centre / Department</button>
            <button className={tab === "cand" ? "on" : ""} type="button" onClick={() => setTab("cand")}>Candidate</button>
          </div>
          {tab === "staff" ? (
            <form onSubmit={staffLogin}>
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {err && <p className="err">{err}</p>}
              <button className="btn" style={{ marginTop: 16 }} type="submit">Enter command</button>
              <p className="hint" style={{ marginTop: 16 }}><a href="/staff-register">Staff registration (pending approval)</a></p>
            </form>
          ) : (
            <form onSubmit={candLogin}>
              <label>Registered mobile</label>
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} />
              <label>OTP</label>
              <input value={otp} onChange={(e) => setOtp(e.target.value)} />
              {err && <p className="err">{err}</p>}
              <button className="btn" style={{ marginTop: 16 }} type="submit">Open OTR wallet</button>
              <p className="hint" style={{ marginTop: 16 }}><a href="/otr">New One-Time Registration</a></p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
