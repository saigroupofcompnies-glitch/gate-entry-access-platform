import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setSession } from "../api";
import PublicChrome from "../PublicChrome.jsx";

export default function DeviceLogin({ kind }) {
  const nav = useNavigate();
  const isCand = kind === "candidate";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
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

  const title = isCand ? "Candidate login" : kind === "gate" ? "Gate device" : "Classroom gate";
  const banner = isCand ? "/exam/student-otr-register.jpg" : "/exam/hero-exam-centre.jpg";

  return (
    <PublicChrome banner={banner} title={title} subtitle="DigiSecureExam field and student access.">
      <form className="panel dsx-panel" style={{ maxWidth: 440, margin: "0 auto" }} onSubmit={submit}>
        {isCand ? (
          <>
            <label>Mobile</label>
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} />
            <label>OTP</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} />
          </>
        ) : (
          <>
            <label>User ID</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        )}
        {err && <p className="err">{err}</p>}
        <button className="btn" type="submit" style={{ marginTop: 12 }}>Continue</button>
      </form>
    </PublicChrome>
  );
}
