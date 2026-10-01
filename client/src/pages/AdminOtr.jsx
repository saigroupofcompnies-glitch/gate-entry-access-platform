import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAdminFilters } from "../AdminFilters.jsx";

export default function AdminOtr() {
  const { query } = useAdminFilters();
  const [rows, setRows] = useState([]);
  useEffect(() => { api("/api/admin/otr" + query).then((d) => setRows(d.rows || [])); }, [query]);
  return (
    <div>
      <div className="topbar">
        <div>
          <div className="kicker">Identity Vault</div>
          <h2 style={{ margin: 0 }}>All student identities</h2>
          <p className="hint">Filter by OTR/name/mobile, exam or centre. Filters stay as you move across admin pages.</p>
        </div>
        <Link className="btn" to="/admin">Dashboard</Link>
      </div>
      <p className="hint">{rows.length} record(s)</p>
      <div className="panel">
        <table>
          <thead>
            <tr><th>OTR</th><th>Name</th><th>Mobile</th><th>Status</th><th>Exams applied</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.otr_id}>
                <td className="mono">{r.otr_id}</td>
                <td>{r.full_name}</td>
                <td className="mono">{r.mobile}</td>
                <td>{r.identity_status}</td>
                <td>{r.exams || "— not on any exam yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="hint">No OTR matches these filters.</p>}
      </div>
    </div>
  );
}
