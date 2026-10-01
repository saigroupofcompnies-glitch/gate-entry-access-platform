import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "./api";
import { Logo } from "./PublicChrome.jsx";
import { ADMIN_NAV } from "./adminNav.js";
import { AdminFilterBar, AdminFilterProvider } from "./AdminFilters.jsx";

const PORTALS = {
  admin: {
    title: "Main Admin",
    home: "/admin",
    photo: "/exam/face-match-kiosk.jpg",
    links: [],
  },
  supervisor: {
    title: "Centre Incharge",
    home: "/centre",
    photo: "/exam/students-exam-pass.jpg",
    links: [
      ["/centre", "My centre"],
      ["/centre/staff", "Staff approval"],
      ["/staff/pass", "ID card & gate pass"],
      ["/centre/presence", "Exam dashboard"],
      ["/centre/alerts", "Alerts"],
    ],
  },
  client: {
    title: "Control room",
    home: "/control-room",
    photo: "/exam/control-room.jpg",
    links: [
      ["/control-room", "Exam dashboard"],
      ["/control-room/labs", "Labs / classrooms"],
      ["/control-room/students", "Candidates"],
      ["/control-room/alerts", "Alerts"],
    ],
  },
  staff: {
    title: "Staff duty",
    home: "/staff",
    photo: "/exam/staff-centre-desk.jpg",
    links: [
      ["/staff", "ID card & gate pass"],
      ["/staff/pass", "My documents"],
    ],
  },
  field: {
    title: "Exam day device",
    home: "/gate",
    photo: "/exam/gate-boarding-check.jpg",
    links: [],
  },
  candidate: {
    title: "Candidate",
    home: "/candidate",
    photo: "/exam/student-otr-register.jpg",
    links: [["/candidate", "My identity"]],
  },
};

function adminActive(to, pathname) {
  if (to === "/admin") return pathname === "/admin";
  if (to === "/admin/exams") return pathname.startsWith("/admin/exams") || pathname.startsWith("/admin/masters");
  return pathname === to || pathname.startsWith(to + "/");
}

export default function PortalShell({ portal, extraLinks = [], photo, children }) {
  const user = getUser();
  const nav = useNavigate();
  const loc = useLocation();
  const cfg = PORTALS[portal] || PORTALS.admin;
  const links = extraLinks.length ? extraLinks : cfg.links;
  const banner = photo || cfg.photo;
  const isAdmin = portal === "admin";
  const shell = (
    <div className={`dsx-landing dsx-app dsx-portal-${portal}${isAdmin ? " dsx-admin-layout" : ""}`}>
      <header className="dsx-nav">
        <div className="dsx-nav-inner">
          <Logo />
          {!isAdmin && (
            <nav>
              {links.map(([to, label]) => (
                <NavLink key={to} to={to} end={to.split("/").length <= 2}>
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
          <button className="dsx-admin" type="button" onClick={() => { clearSession(); nav("/login"); }}>
            Sign out
          </button>
        </div>
      </header>
      {isAdmin && (
        <aside className="dsx-admin-side">
          <p className="dsx-admin-side-title">Admin panel</p>
          {ADMIN_NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/admin"} className={() => adminActive(to, loc.pathname) ? "active" : ""}>
              {label}
            </NavLink>
          ))}
        </aside>
      )}
      <div className="dsx-admin-main">
        <div className="dsx-page-hero dsx-page-hero-slim">
          <img src={banner} alt="" />
          <div className="dsx-page-hero-copy">
            <h1>{cfg.title}</h1>
            <p>{user?.username ? `Signed in: ${user.username}` : user?.displayName || ""}</p>
          </div>
        </div>
        {isAdmin && <AdminFilterBar />}
        <main className="dsx-page-body">{children}</main>
      </div>
    </div>
  );
  return isAdmin ? <AdminFilterProvider>{shell}</AdminFilterProvider> : shell;
}
