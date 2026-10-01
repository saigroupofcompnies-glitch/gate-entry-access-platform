import { useEffect, useState } from "react";
import { api } from "../api";

export default function HeadPortal() {
  const [staff, setStaff] = useState([]);
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const [s, e] = await Promise.all([api("/api/staff"), api("/api/live/exams")]);
    setStaff(s);
    setExams(e);
    if (e[0]) setExamId((cur) => cur || e[0].id);
  }
  useEffect(() => { load(); }, []);

  async function decide(id, decision) {
    const comments = window.prompt("Comments") || "";
    const out = await api(`/api/staff/${id}/approve`, { method: "POST", body: { decision, comments } });
    if (decision === "APPROVE") {
      await api(`/api/staff/${id}/assign`, { method: "POST", body: { examId, role: "INVIGILATOR", labId: "LAB-01" } });
      if (out.login) {
        setMsg(`Approved. Staff login: ${out.login.username}${out.login.password ? ` / ${out.login.password}` : ""}. They sign in to download ID card and gate pass.`);
      } else {
        setMsg("Approved and assigned. Staff can sign in to download ID card and gate pass.");
      }
    }
    load();
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="kicker">Staff approval</div>
          <h2 style={{ margin: 0 }}>Approve duty staff for this centre</h2>
        </div>
        <div>
          <label className="hint">Assign to exam</label>
          <select value={examId} onChange={(e) => setExamId(e.target.value)}>
            {exams.map((ex) => <option key={ex.id} value={ex.id}>{ex.slug || ex.code}</option>)}
          </select>
        </div>
      </div>
      {msg && <p className="hint">{msg}</p>}
      <div className="panel">
        <table>
          <thead>
            <tr><th>Staff</th><th>Kind</th><th>Role</th><th>Mobile</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{s.full_name}<div className="mono">{s.id}</div></td>
                <td>{s.kind || "STAFF"}</td>
                <td>{s.role_applied}</td>
                <td>{s.mobile}</td>
                <td><span className={`pill ${s.status === "ACTIVE" ? "ok" : s.status === "PENDING" ? "warnp" : "bad"}`}>{s.status}</span></td>
                <td>
                  {s.status === "PENDING" && (
                    <div className="row">
                      <button className="btn" onClick={() => decide(s.id, "APPROVE")}>Approve</button>
                      <button className="btn ghost" onClick={() => decide(s.id, "CORRECTION")}>Correction</button>
                      <button className="btn danger" onClick={() => decide(s.id, "REJECT")}>Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
