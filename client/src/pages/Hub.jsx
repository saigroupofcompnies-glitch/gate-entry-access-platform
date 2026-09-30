import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setSession } from "../api";

const PORTALS = [
  {
    id: "admin",
    title: "Main Admin",
    text: "Create exams, centres, users and security policy. Not a live exam war room.",
    user: "admin",
    dest: "/admin",
    roles: ["SUPER_ADMIN"],
  },
  {
    id: "supervisor",
    title: "Centre Supervisor",
    text: "Approve staff, assign labs and watch this venue only.",
    user: "supervisor",
    dest: "/centre",
    roles: ["CENTRE_HEAD"],
  },
  {
    id: "client",
    title: "Client Control Room",
    text: "Read-only live presence, labs and exceptions. No setup or staff approval.",
    user: "client",
    dest: "/control-room",
    roles: ["CLIENT", "DEPARTMENT_OFFICER"],
  },
];

export default function Hub() {
  const nav = useNavigate();
  const [portal, setPortal] = useState("admin");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Pilot@123");
  const [err, setErr] = useState("");
  const spec = PORTALS.find((p) => p.id === portal);

  function pick(p) {
    setPortal(p.id);
    setUsername(p.user);
    setErr("");
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await api("/api/auth/login", { method: "POST", body: { username, password } });
      if (!spec.roles.includes(data.user.role)) {
        setErr(`This account belongs to ${data.user.role}. Open the matching portal.`);
        return;
      }
      setSession(data.token, data.user);
      nav(spec.dest);
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="login-wrap">
      <div style={{ width: "min(1080px, 100%)" }}>
        <div className="kicker">EIALM · three separate portals</div>
        <h1 style={{ marginTop: 6 }}>Choose where you work</h1>
        <p className="hint" style={{ color: "#cbb", maxWidth: 640 }}>
          Admin configures the platform. Centre Supervisor runs the venue. Client Control Room only watches live exam state.
        </p>
        <div className="hub-grid">
          {PORTALS.map((p) => (
            <button key={p.id} type="button" className={`hub-card ${portal === p.id ? "on" : ""}`} onClick={() => pick(p)}>
              <div className="kicker">{p.id}</div>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
              <div className="mono">{p.user} / Pilot@123</div>
            </button>
          ))}
        </div>
        <div className="panel" style={{ marginTop: 18 }}>
          <form onSubmit={submit}>
            <h3>Sign in to {spec.title}</h3>
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {err && <p className="err">{err}</p>}
            <button className="btn" type="submit" style={{ marginTop: 14 }}>Enter {spec.title}</button>
          </form>
        </div>
        <p className="hint" style={{ color: "#cbb", marginTop: 18 }}>
          Field devices: <Link to="/login/gate">Gate</Link> · <Link to="/login/classroom">Classroom</Link>
          {" "}· <Link to="/login/candidate">Candidate</Link> · <Link to="/otr">New OTR</Link> · <Link to="/staff-register">Staff register</Link>
        </p>
      </div>
    </div>
  );
}
