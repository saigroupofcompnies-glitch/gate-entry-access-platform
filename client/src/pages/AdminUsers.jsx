import { useEffect, useState } from "react";
import { api } from "../api";
import { matchAdminFilters, useAdminFilters } from "../AdminFilters.jsx";

const ROLES = ["CLIENT", "DEPARTMENT_OFFICER", "CENTRE_HEAD", "SECURITY_OPERATOR", "BIOMETRIC_OPERATOR", "CENTRE_OPERATOR"];

export default function AdminUsers() {
  const { filters } = useAdminFilters();
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [centres, setCentres] = useState([]);
  const [exams, setExams] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", role: "CLIENT", centreId: "", examIds: [] });
  const [edit, setEdit] = useState({});
  const [msg, setMsg] = useState("");

  async function load() {
    setRows(await api("/api/admin/users"));
    setStaff(await api("/api/staff"));
    setCentres(await api("/api/centres"));
    setExams(await api("/api/admin/exams"));
  }
  useEffect(() => { load(); }, []);

  function toggleFormExam(id) {
    setForm((f) => ({
      ...f,
      examIds: f.examIds.includes(id) ? f.examIds.filter((x) => x !== id) : [...f.examIds, id],
    }));
  }

  async function addUser(e) {
    e.preventDefault();
    setMsg("");
    if ((form.role === "CLIENT" || form.role === "DEPARTMENT_OFFICER") && !form.examIds.length) {
      setMsg("Select at least one examination to bind this login.");
      return;
    }
    try {
      await api("/api/admin/users", { method: "POST", body: form });
      setForm({ username: "", password: "", displayName: "", role: form.role, centreId: "", examIds: [] });
      load();
    } catch (err) {
      setMsg(err.message === "EXAM_REQUIRED" ? "Select the examination this login may see." : err.message);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this login?")) return;
    await api(`/api/admin/users/${id}`, { method: "DELETE" });
    load();
  }

  async function saveBind(id) {
    setMsg("");
    try {
      await api(`/api/admin/users/${id}/exams`, { method: "PUT", body: { examIds: edit[id] || [] } });
      load();
    } catch (err) {
      setMsg(err.message === "EXAM_REQUIRED" ? "Client logins must keep at least one exam." : err.message);
    }
  }

  async function decideIncharge(id, decision) {
    const comments = window.prompt("Comments") || "";
    const out = await api(`/api/staff/${id}/approve`, { method: "POST", body: { decision, comments } });
    if (out.login) setMsg(`Incharge login: ${out.login.username} / ${out.login.password || "(existing)"}`);
    load();
  }

  const incharges = staff.filter((s) => (s.kind === "INCHARGE" || s.role_applied === "CENTRE_INCHARGE") && matchAdminFilters(s, filters));
  const logins = rows.filter((u) => matchAdminFilters(u, filters));
  const needsExam = form.role === "CLIENT" || form.role === "DEPARTMENT_OFFICER";

  return (
    <div>
      <div className="kicker">Access Registry</div>
      <h2>Users, clients and exam binding</h2>
      <p className="hint">Each login sees only the examinations you bind. Client dashboards never mix other papers.</p>
      {msg && <p className="hint">{msg}</p>}

      <div className="panel">
        <h3>Centre Incharge waiting for admin</h3>
        <table>
          <thead><tr><th>Name</th><th>Mobile</th><th>Centre</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {incharges.map((s) => (
              <tr key={s.id}>
                <td>{s.full_name}</td>
                <td>{s.mobile}</td>
                <td className="mono">{s.centre_id}</td>
                <td>{s.status}</td>
                <td>
                  {s.status === "PENDING" && (
                    <div className="row">
                      <button className="btn" type="button" onClick={() => decideIncharge(s.id, "APPROVE")}>Approve &amp; issue login</button>
                      <button className="btn danger" type="button" onClick={() => decideIncharge(s.id, "REJECT")}>Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {incharges.length === 0 && <p className="hint">No incharge registrations.</p>}
      </div>

      <div className="panel">
        <h3>Create login and bind examination</h3>
        <form onSubmit={addUser}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            <input placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <input placeholder="Display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, examIds: [] })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
            <select value={form.centreId} onChange={(e) => setForm({ ...form, centreId: e.target.value })}>
              <option value="">No centre bind</option>
              {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            {needsExam ? "Required — this client will open only the selected exam dashboard." : "Bind examinations this login may access. Centre staff also stay limited to their centre."}
          </p>
          <div className="dsx-exam-bind">
            {exams.map((x) => (
              <label key={x.id} className="dsx-exam-bind-item">
                <input
                  type="checkbox"
                  checked={form.examIds.includes(x.id)}
                  onChange={() => toggleFormExam(x.id)}
                />
                <span><b>{x.slug || x.code}</b> {x.name}<em> {x.exam_date}</em></span>
              </label>
            ))}
            {!exams.length && <p className="hint">Create an examination first.</p>}
          </div>
          <button className="btn" type="submit" style={{ marginTop: 12 }}>Add login</button>
        </form>
      </div>

      <div className="panel">
        <h3>Logins and bound exams</h3>
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Centre</th><th>Bound exams</th><th></th></tr></thead>
          <tbody>
            {logins.map((u) => {
              const ids = edit[u.id] || u.examIds || [];
              return (
                <tr key={u.id}>
                  <td className="mono">{u.username}</td>
                  <td>{u.display_name}</td>
                  <td>{u.role}</td>
                  <td>{u.centre_id || "—"}</td>
                  <td>
                    <div className="dsx-exam-bind compact">
                      {exams.map((x) => (
                        <label key={x.id}>
                          <input
                            type="checkbox"
                            checked={ids.includes(x.id)}
                            onChange={() => {
                              const next = ids.includes(x.id) ? ids.filter((i) => i !== x.id) : [...ids, x.id];
                              setEdit((e) => ({ ...e, [u.id]: next }));
                            }}
                          />
                          {x.slug || x.code}
                        </label>
                      ))}
                    </div>
                    <button className="btn ghost" type="button" onClick={() => saveBind(u.id)}>Save bind</button>
                  </td>
                  <td><button className="btn ghost" type="button" onClick={() => remove(u.id)}>Delete</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
