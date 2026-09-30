import { NavLink, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "./api";

const PORTALS = {
  admin: {
    title: "Main Admin",
    kicker: "Platform administration",
    home: "/admin",
    theme: "nav-admin",
    links: [
      ["/admin", "Overview"],
      ["/admin/masters", "Exams & centres"],
      ["/admin/users", "Users & roles"],
      ["/admin/policy", "Security policy"],
      ["/admin/audit", "System audit"],
    ],
  },
  supervisor: {
    title: "Centre Incharge",
    kicker: "Staff approval & venue monitoring",
    home: "/centre",
    theme: "nav-supervisor",
    links: [
      ["/centre", "My centre"],
      ["/centre/staff", "Staff approval"],
      ["/centre/presence", "Centre presence"],
      ["/centre/alerts", "Centre alerts"],
    ],
  },
  client: {
    title: "Client Control Room",
    kicker: "Live monitoring · read only",
    home: "/control-room",
    theme: "nav-client",
    links: [
      ["/control-room", "Control room"],
      ["/control-room/labs", "Labs"],
      ["/control-room/students", "Students"],
      ["/control-room/alerts", "Exceptions"],
    ],
  },
  field: {
    title: "Field device",
    kicker: "Gate / classroom",
    home: "/gate",
    theme: "nav-field",
    links: [],
  },
  candidate: {
    title: "Candidate",
    kicker: "OTR & boarding pass",
    home: "/candidate",
    theme: "nav-admin",
    links: [["/candidate", "My identity"]],
  },
};

export default function PortalShell({ portal, extraLinks = [], children }) {
  const user = getUser();
  const nav = useNavigate();
  const cfg = PORTALS[portal] || PORTALS.admin;
  const links = extraLinks.length ? extraLinks : cfg.links;
  return (
    <div className={`shell ${cfg.theme}`}>
      <aside className="nav">
        <div className="kicker">{cfg.kicker}</div>
        <p style={{ margin: "8px 0 4px", fontWeight: 700 }}>{cfg.title}</p>
        <p className="hint" style={{ color: "#8a93a3", marginTop: 0 }}>{user?.displayName}</p>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to.split("/").length <= 2} className={({ isActive }) => (isActive ? "active" : "")}>
            {label}
          </NavLink>
        ))}
        <div style={{ marginTop: 28 }}>
          <div className="mono" style={{ fontSize: 11, color: "#8a93a3" }}>{user?.role}</div>
          <button className="btn ghost" style={{ marginTop: 10, color: "#eee", borderColor: "#445" }} onClick={() => { clearSession(); nav(portal === "candidate" ? "/" : "/operations"); }}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
