import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setSession } from "../api";

export default function DeviceLogin({ kind }) {
  const nav = useNavigate();
  const isCand = kind === "candidate";
  const [username, setUsername] = useState(kind === "gate" ? "gate" : kind === "classroom" ? "classroom" : "");
  const [password, setPassword] = useState("Pilot@123");
  const [mobile, setMobile] = useState("9810000001");
  const [otp, setOtp] = useState("123456");
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      if (isCand) {
        const data = await api("/api/auth/candidate-otp", { method: "POST", body: { mobile, otp } });
        setSession(data.token, data.user);
        nav("/candidate");
        return;
      }
      const data = await api("/api/auth/login", { method: "POST", body: { username, password } });
      const dest = kind === "gate" ? "/gate" : "/classroom";
      const need = kind === "gate" ? ["SECURITY_OPERATOR", "CENTRE_OPERATOR"] : ["BIOMETRIC_OPERATOR"];
      if (!need.includes(data.user.role) && data.user.role !== "SUPER_ADMIN") {
        setErr("Use a field-device account for this screen.");
        return;
      }
      setSession(data.token, data.user);
      nav(dest);
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="login-wrap">
      <div className="panel" style={{ width: "min(420px, 100%)" }}>
        <p><Link to="/operations">← Operations index</Link></p>
        <h2>{kind === "gate" ? "Gate device" : kind === "classroom" ? "Classroom device" : "Candidate"}</h2>
        <form onSubmit={submit}>
          {isCand ? (
            <>
              <label>Mobile</label>
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} />
              <label>OTP</label>
              <input value={otp} onChange={(e) => setOtp(e.target.value)} />
            </>
          ) : (
            <>
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </>
          )}
          {err && <p className="err">{err}</p>}
          <button className="btn" type="submit" style={{ marginTop: 12 }}>Continue</button>
        </form>
      </div>
    </div>
  );
}
