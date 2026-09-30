import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setSession } from "../api";

const PORTALS = [
  {
    id: "supervisor",
    code: "01",
    title: "Centre Incharge",
    text: "Approve duty staff and monitor this venue only.",
    user: "supervisor",
    dest: "/centre",
    roles: ["CENTRE_HEAD"],
  },
  {
    id: "client",
    code: "02",
    title: "Client control room",
    text: "Read-only view of all centres, classrooms and exceptions.",
    user: "client",
    dest: "/control-room",
    roles: ["CLIENT", "DEPARTMENT_OFFICER"],
  },
  {
    id: "admin",
    code: "03",
    title: "Main Admin",
    text: "Exams, DIGITAL-EXAM pages, users, import and export.",
    user: "admin",
    dest: "/admin",
    roles: ["SUPER_ADMIN"],
  },
];

export default function OperationsHub() {
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
        setErr(`This account is ${data.user.role}. Use the matching desk.`);
        return;
      }
      setSession(data.token, data.user);
      nav(spec.dest);
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="gov-shell">
      <div className="gov-tricolor" />
      <header className="gov-masthead">
        <div className="gov-emblem"><b>EIALM</b></div>
        <div>
          <p className="gov-dept">Operations access</p>
          <p className="gov-sub">Restricted · Incharge · Client · Main Admin</p>
        </div>
      </header>
      <main className="gov-main">
        <p><Link to="/">← Public registration desk</Link></p>
        <h1>Select your authorised desk</h1>
        <div className="ops-rows">
          {PORTALS.map((p) => (
            <button key={p.id} type="button" className={`ops-row ${portal === p.id ? "on" : ""}`} onClick={() => pick(p)}>
              <span className="ops-code">{p.code}</span>
              <span>
                <strong>{p.title}</strong>
                <em>{p.text}</em>
              </span>
              <span className="mono">{p.user}</span>
            </button>
          ))}
        </div>
        <div className="panel">
          <form onSubmit={submit}>
            <h3>{spec.title} login</h3>
            <div className="form-grid">
              <div>
                <label>Username</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div>
                <label>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            {err && <p className="err">{err}</p>}
            <button className="btn" type="submit" style={{ marginTop: 14 }}>Sign in</button>
          </form>
        </div>
        <p className="hint" style={{ marginTop: 16 }}>
          Field devices: <Link to="/login/gate">Gate</Link> · <Link to="/login/classroom">Classroom</Link>
        </p>
      </main>
    </div>
  );
}
