import { useEffect, useState } from "react";
import { api } from "../api";

const ROLES = ["SUPER_ADMIN", "CLIENT", "DEPARTMENT_OFFICER", "CENTRE_HEAD", "SECURITY_OPERATOR", "BIOMETRIC_OPERATOR", "CENTRE_OPERATOR"];

export default function AdminUsers() {
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [exams, setExams] = useState([]);
  const [centres, setCentres] = useState([]);
  const [form, setForm] = useState({ username: "", password: "Pilot@123", displayName: "", role: "CLIENT", centreId: "", examIds: [] });
  const [importText, setImportText] = useState('[{"mobile":"9810000099","fullName":"Imported Student"}]');
  const [msg, setMsg] = useState("");

  async function load() {
    setRows(await api("/api/admin/users"));
    setStaff(await api("/api/staff"));
    setExams(await api("/api/admin/exams"));
    setCentres(await api("/api/centres"));
  }
  useEffect(() => { load(); }, []);

  async function addUser(e) {
    e.preventDefault();
    setMsg("");
    try {
      await api("/api/admin/users", { method: "POST", body: form });
      setForm({ ...form, username: "", displayName: "" });
      load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this login?")) return;
    await api(`/api/admin/users/${id}`, { method: "DELETE" });
    load();
  }

  async function decideIncharge(id, decision) {
    const comments = window.prompt("Comments") || "";
    const out = await api(`/api/staff/${id}/approve`, { method: "POST", body: { decision, comments } });
    if (out.login) setMsg(`Incharge login: ${out.login.username} / ${out.login.password || "(existing)"}`);
    load();
  }

  async function exportData() {
    const data = await api("/api/admin/export/candidates");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "eialm-candidates-export.json";
    a.click();
  }

  async function importData(e) {
    e.preventDefault();
    const rowsIn = JSON.parse(importText);
    const out = await api("/api/admin/import/candidates", { method: "POST", body: { rows: rowsIn } });
    setMsg(`Imported ${out.created} OTR records`);
    load();
  }

  const incharges = staff.filter((s) => s.kind === "INCHARGE" || s.role_applied === "CENTRE_INCHARGE");

  return (
    <div>
      <div className="kicker">Main Admin</div>
      <h2>Users, clients, incharge approval, import / export</h2>
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
        <h3>Logins</h3>
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Centre</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="mono">{u.username}</td>
                <td>{u.display_name}</td>
                <td>{u.role}</td>
                <td>{u.centre_id || "—"}</td>
                <td><button className="btn ghost" type="button" onClick={() => remove(u.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addUser} style={{ marginTop: 12 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            <input placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <input placeholder="Display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
            <select value={form.centreId} onChange={(e) => setForm({ ...form, centreId: e.target.value })}>
              <option value="">No centre bind</option>
              {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn" type="submit">Add user / client login</button>
          </div>
          {form.role === "CLIENT" && (
            <p className="hint">Client sees exams linked after creation; default is all exams until you attach exam_clients.</p>
          )}
        </form>
      </div>

      <div className="panel">
        <h3>Data import / export</h3>
        <button className="btn" type="button" onClick={exportData}>Export candidates + applications (JSON)</button>
        <form onSubmit={importData} style={{ marginTop: 12 }}>
          <label>Import OTR JSON array</label>
          <textarea rows={5} style={{ width: "100%" }} value={importText} onChange={(e) => setImportText(e.target.value)} />
          <button className="btn" type="submit" style={{ marginTop: 8 }}>Import</button>
        </form>
      </div>
    </div>
  );
}
