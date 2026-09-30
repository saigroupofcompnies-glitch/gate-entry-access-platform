import { useEffect, useState } from "react";
import { api } from "../api";

export default function AdminHome() {
  const [ov, setOv] = useState(null);
  useEffect(() => { api("/api/admin/overview").then(setOv); }, []);
  if (!ov) return <p>Loading…</p>;
  return (
    <div>
      <div className="topbar">
        <div>
          <div className="kicker">Main Admin</div>
          <h2 style={{ margin: 0 }}>Multi-exam platform</h2>
        </div>
      </div>
      <p className="hint" style={{ color: "#cbb" }}>
        Create exams, open DIGITAL-EXAM/BPSC (or SSC) registration, add/delete client and other logins, import/export data.
        Centre Incharge approves staff. Client watches all centres and classrooms live.
      </p>
      <div className="cards">
        <div className="metric"><span>Exams</span><b>{ov.exams}</b></div>
        <div className="metric"><span>Centres</span><b>{ov.centres}</b></div>
        <div className="metric"><span>Users</span><b>{ov.users}</b></div>
        <div className="metric"><span>OTR identities</span><b>{ov.candidates}</b></div>
        <div className="metric"><span>Exam applications</span><b>{ov.applications}</b></div>
        <div className="metric"><span>Staff awaiting centre</span><b>{ov.staffPending}</b></div>
      </div>
    </div>
  );
}
