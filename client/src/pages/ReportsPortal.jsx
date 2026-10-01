import { useEffect, useState } from "react";
import { api } from "../api";
import { useAdminFilters } from "../AdminFilters.jsx";

export default function ReportsPortal() {
  const { query, filters } = useAdminFilters();
  const [audit, setAudit] = useState([]);
  const [access, setAccess] = useState([]);

  useEffect(() => {
    Promise.all([api(`/api/audit/events${query}`), api(`/api/reports/access${query}`)])
      .then(([a, b]) => { setAudit(a); setAccess(b); })
      .catch(() => { setAudit([]); setAccess([]); });
  }, [query]);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="kicker">Audit</div>
          <h2 style={{ margin: 0 }}>System audit</h2>
        </div>
      </div>
      <p className="hint">Filtered by OTR / exam / centre in the bar above{filters.examId ? " · this exam" : " · all exams"}.</p>
      <div className="panel">
        <h3>Access events</h3>
        <table>
          <thead><tr><th>Time</th><th>Kind</th><th>Subject</th><th>Result</th><th>Lab/Gate</th><th>Score</th></tr></thead>
          <tbody>
            {access.map((e) => (
              <tr key={e.id}>
                <td className="mono">{e.created_at}</td>
                <td>{e.event_kind}</td>
                <td className="mono">{e.subject_id}</td>
                <td>{e.result}</td>
                <td>{e.lab_id || e.gate_id}</td>
                <td>{e.face_class} {e.face_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h3>Audit trail</h3>
        <table>
          <thead><tr><th>Time</th><th>Type</th><th>Entity</th><th>Actor</th><th>Result</th></tr></thead>
          <tbody>
            {audit.map((e) => (
              <tr key={e.id}>
                <td className="mono">{e.created_at}</td>
                <td>{e.event_type}</td>
                <td className="mono">{e.entity_id}</td>
                <td>{e.actor_role}</td>
                <td>{e.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
