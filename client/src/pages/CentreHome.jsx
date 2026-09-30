import { useEffect, useState } from "react";
import { api } from "../api";

export default function CentreHome() {
  const [ov, setOv] = useState(null);
  useEffect(() => { api("/api/live/overview").then(setOv); }, []);
  if (!ov) return <p>Loading…</p>;
  return (
    <div>
      <div className="topbar">
        <div>
          <div className="kicker">Centre Incharge</div>
          <h2 style={{ margin: 0 }}>{ov.centreName} · {ov.examName}</h2>
        </div>
      </div>
      <p className="hint" style={{ color: "#cbb" }}>Approve staff and monitor this venue. Exam creation and client logins belong to Main Admin. Full multi-centre view belongs to Client login.</p>
      <div className="cards">
        <div className="metric"><span>Staff pending your approval</span><b>{ov.staffPending}</b></div>
        <div className="metric"><span>Active staff</span><b>{ov.staffActive}</b></div>
        <div className="metric"><span>Centre entered</span><b>{ov.centreEntered}</b></div>
        <div className="metric"><span>In labs</span><b>{ov.classroomPresent}</b></div>
      </div>
    </div>
  );
}
