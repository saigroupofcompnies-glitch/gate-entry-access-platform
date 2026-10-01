import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { downloadCsv, rowsFromSpreadsheet, STUDENT_TEMPLATE_HEADERS } from "../parseSheet";
import { boardingPrintHtml } from "../BoardingPass.jsx";
import { useAdminFilters } from "../AdminFilters.jsx";

const TABS = [
  ["students", "Students"],
  ["admit", "Boarding Bay"],
  ["import", "Excel upload"],
  ["centres", "Centres for allotment"],
  ["staff", "Staff"],
];

async function printAdmit(s) {
  try {
    const p = await api(`/api/admin/applications/${s.application_id}/boarding`);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(boardingPrintHtml(p));
    w.document.close();
  } catch {
    window.alert("Issue boarding passes first.");
  }
}

export default function AdminExam() {
  const { examId } = useParams();
  const { filters } = useAdminFilters();
  const [desk, setDesk] = useState(null);
  const [tab, setTab] = useState("students");
  const [msg, setMsg] = useState("");
  const [centreId, setCentreId] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api(`/api/admin/exams/${examId}/desk`);
    setDesk(data);
    setCentreId((id) => id || data.allCentres?.[0]?.id || "");
  }
  useEffect(() => { load(); }, [examId]);

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      const rows = await rowsFromSpreadsheet(file);
      const out = await api("/api/admin/import/candidates", { method: "POST", body: { examId, rows } });
      setMsg(`Imported without centre. New OTR: ${out.created}. Linked: ${out.linked}. Issue admit cards next.`);
      await load(q);
      setTab("students");
    } catch (err) {
      setMsg(err.message);
    }
    setBusy(false);
  }

  async function addCentre(e) {
    e.preventDefault();
    await api(`/api/admin/exams/${examId}/centres`, { method: "POST", body: { centreId } });
    load(q);
  }

  async function issueAdmits() {
    setBusy(true);
    setMsg("");
    try {
      const out = await api(`/api/admin/exams/${examId}/admit-cards`, { method: "POST", body: {} });
      setMsg(`Boarding passes issued: ${out.issued}. Scan QR at Sentinel Gate to open the gate.`);
      await load(q);
    } catch (err) {
      setMsg(err.message === "LINK_CENTRES_FIRST" ? "Link at least one centre on this exam first." : err.message);
    }
    setBusy(false);
  }

  function template() {
    downloadCsv("digi-exam-students-template.csv", [{ fullName: "Anita Sharma", mobile: "9810000001", email: "anita@example.com", address: "Patna" }]);
  }

  if (!desk) return <p>Loading exam desk…</p>;
  const { exam, stats, centres, allCentres, staff, registerPath, registrationStatus } = desk;
  const qtext = String(filters.otr || "").trim().toLowerCase();
  const students = (desk.students || []).filter((s) => {
    if (filters.centreId && s.centre_id && s.centre_id !== filters.centreId) return false;
    if (qtext && ![s.otr_id, s.full_name, s.mobile, s.roll_no, s.email].join(" ").toLowerCase().includes(qtext)) return false;
    return true;
  });

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="kicker">Boarding Bay</div>
          <h2 style={{ margin: 0 }}>{exam.name}</h2>
          <p className="hint">
            Exam {exam.exam_date} · Registration {exam.registration_start || "—"} → {exam.registration_close || "—"} ({registrationStatus})
          </p>
        </div>
        <Link className="btn ghost" to="/admin/exams">All exams</Link>
        <Link className="btn ghost" to="/admin/allocation">Allocation</Link>
        <Link className="btn ghost" to="/admin/passes">Gate pass</Link>
      </div>

      <div className="cards">
        <div className="metric"><span>Applied</span><b>{stats.students}</b></div>
        <div className="metric"><span>Waiting boarding</span><b>{stats.pendingAdmit ?? "—"}</b></div>
        <div className="metric"><span>Boarding issued</span><b>{stats.admitIssued ?? "—"}</b></div>
        <div className="metric"><span>Centres linked</span><b>{stats.centres}</b></div>
      </div>

      <div className="panel">
        <p className="hint" style={{ marginTop: 0 }}>
          Students apply with Identity Vault only. Centre is allotted in <b>Boarding Bay</b>. Scan the QR at Sentinel Gate to open the gate; lab is assigned then.
        </p>
        <span className="mono">{registerPath}</span>
      </div>

      <div className="desk-tabs">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {msg && <p className="hint">{msg}</p>}

      {tab === "students" && (
        <div className="panel">
          <h3>Students of this paper ({students.length})</h3>
          <p className="hint">Uses the OTR / exam / centre filter bar. Exam is this desk.</p>
          <div className="row">
            <button className="btn ghost" type="button" onClick={() => downloadCsv(`students-${exam.slug}.csv`, students)}>Download CSV</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>OTR</th>
                <th>Name</th>
                <th>Roll</th>
                <th>Seat</th>
                <th>Centre</th>
                <th>Lab</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.application_id}>
                  <td className="mono">{s.otr_id}</td>
                  <td>{s.full_name}<div className="hint">{s.mobile}</div></td>
                  <td className="mono">{s.roll_no || "—"}</td>
                  <td className="mono">{desk.exam?.mode === "CBT" ? (s.seat_no || "At classroom gate") : "—"}</td>
                  <td>{s.centre_name || "After admit card"}</td>
                  <td>{s.lab_name || "At face scan"}</td>
                  <td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {students.length === 0 && <p className="hint">No applications yet. Students apply after OTR, or use Excel (no centre column).</p>}
        </div>
      )}

      {tab === "admit" && (
        <div className="panel">
          <h3>Boarding Bay</h3>
          <p className="hint">
            Airport-style boarding pass with QR. Link centres, then issue. Lab stays empty until Sentinel Gate. Seat is assigned only for CBT at the classroom-gate device.
          </p>
          <button className="btn" type="button" disabled={busy} onClick={issueAdmits}>Issue boarding passes</button>
          <table style={{ marginTop: 16 }}>
            <thead>
              <tr><th>Roll</th><th>Name</th><th>Centre</th><th>Lab</th><th></th></tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.application_id}>
                  <td className="mono">{s.roll_no || "—"}</td>
                  <td>{s.full_name}</td>
                  <td>{s.centre_name || "Not issued"}</td>
                  <td>{s.lab_name || "Face scan"}</td>
                  <td>
                    {s.centre_id && (
                      <button className="btn ghost" type="button" onClick={() => printAdmit(s)}>Print boarding pass</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "import" && (
        <div className="panel">
          <h3>Excel / CSV into this exam</h3>
          <p className="hint">Required: <b>fullName</b>, <b>mobile</b>. Do not put centre. Centre is allotted only in Admit cards.</p>
          <div className="row">
            <button className="btn ghost" type="button" onClick={template}>Download template</button>
            <label className="btn">
              {busy ? "Uploading…" : "Choose Excel / CSV"}
              <input type="file" accept=".xlsx,.xls,.csv,.txt,.json" hidden disabled={busy} onChange={onUpload} />
            </label>
          </div>
          <p className="hint">Headers: {STUDENT_TEMPLATE_HEADERS.join(", ")}</p>
        </div>
      )}

      {tab === "centres" && (
        <div className="panel">
          <h3>Centres used when admit cards are issued</h3>
          <p className="hint">This is the allotment pool. Students never pick from this list.</p>
          <table>
            <thead><tr><th>Name</th><th>City</th><th>Capacity</th></tr></thead>
            <tbody>
              {centres.map((c) => (
                <tr key={c.id}><td>{c.name}</td><td>{c.city}</td><td>{c.capacity}</td></tr>
              ))}
            </tbody>
          </table>
          <form onSubmit={addCentre} className="row" style={{ marginTop: 12 }}>
            <select value={centreId} onChange={(e) => setCentreId(e.target.value)}>
              {allCentres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn" type="submit">Link centre to this exam</button>
          </form>
        </div>
      )}

      {tab === "staff" && (
        <div className="panel">
          <h3>Staff on this exam</h3>
          <table>
            <thead><tr><th>Name</th><th>Mobile</th><th>Duty</th><th>Centre</th><th>Status</th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.full_name}</td>
                  <td className="mono">{s.mobile}</td>
                  <td>{s.role}</td>
                  <td className="mono">{s.centre_id}</td>
                  <td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
