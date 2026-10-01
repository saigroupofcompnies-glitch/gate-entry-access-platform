import { NavLink, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "./api";

const LINKS = {
  SUPER_ADMIN: [
    ["/command", "Command Centre"],
    ["/head", "Staff approval"],
    ["/gate", "Gate device"],
    ["/classroom", "Classroom device"],
    ["/reports", "Audit & access"],
  ],
  DEPARTMENT_OFFICER: [
    ["/command", "Command Centre"],
    ["/reports", "Audit & access"],
  ],
  CENTRE_HEAD: [
    ["/head", "Centre head"],
    ["/command", "Live centre"],
    ["/reports", "Audit"],
  ],
  SECURITY_OPERATOR: [["/gate", "Gate access"]],
  BIOMETRIC_OPERATOR: [["/classroom", "Classroom entry"]],
  CENTRE_OPERATOR: [
    ["/command", "Centre live"],
    ["/gate", "Gate"],
  ],
  CANDIDATE: [["/candidate", "My identity"]],
};

export default function Shell({ children }) {
  const user = getUser();
  const nav = useNavigate();
  const links = LINKS[user?.role] || [["/command", "Home"]];
  return (
    <div className="shell">
      <aside className="nav">
        <div className="kicker">Digisecurexam</div>
        <p style={{ margin: "8px 0 18px", fontWeight: 700 }}>Digisecurexam</p>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>
            {label}
          </NavLink>
        ))}
        <div style={{ marginTop: 28, fontSize: 12, color: "#9aa" }}>
          <div>{user?.displayName}</div>
          <div className="mono">{user?.role}</div>
          <button className="btn ghost" style={{ marginTop: 10, color: "#eee", borderColor: "#445" }} onClick={() => { clearSession(); nav("/"); }}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
