import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { downloadCsv, rowsFromSpreadsheet } from "../parseSheet";

function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

export default function AdminData() {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/admin/exams").then((rows) => {
      setExams(rows);
      setExamId(rows[0]?.id || "");
    });
  }, []);

  async function exportExamStudents() {
    if (!examId) return;
    const data = await api(`/api/admin/export/candidates?examId=${encodeURIComponent(examId)}`);
    const exam = exams.find((e) => e.id === examId);
    downloadCsv(`students-${exam?.slug || examId}.csv`, data.rows || []);
    setMsg(`Downloaded students for ${exam?.slug || examId} only.`);
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !examId) return;
    setBusy(true);
    setMsg("");
    try {
      const rows = await rowsFromSpreadsheet(file);
      const out = await api("/api/admin/import/candidates", { method: "POST", body: { examId, rows } });
      setMsg(`Imported into this exam. New OTR: ${out.created}. Linked: ${out.linked}. Skipped: ${out.skipped}.`);
    } catch (err) {
      setMsg(err.message);
    }
    setBusy(false);
  }

  async function exportPack() {
    downloadJson("digi-exam-full-export.json", await api("/api/admin/export/pack"));
    setMsg("Full pack downloaded (all exams together — prefer per-exam CSV for operations).");
  }
  async function exportStaff() {
    downloadJson("digi-exam-staff.json", await api("/api/admin/export/staff"));
    setMsg("Staff downloaded.");
  }

  return (
    <div>
      <div className="kicker">Data</div>
      <h2>Import / export</h2>
      {msg && <p className="hint">{msg}</p>}

      <div className="panel">
        <h3>Exam-wise students (Excel)</h3>
        <p className="hint">Pick the paper first. Upload does not set a centre. Issue admit cards on the exam desk after import.</p>
        <label>Exam</label>
        <select value={examId} onChange={(e) => setExamId(e.target.value)}>
          {exams.map((x) => (
            <option key={x.id} value={x.id}>{x.code} — {x.name}</option>
          ))}
        </select>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" type="button" onClick={exportExamStudents} disabled={!examId}>Download this exam CSV</button>
          <label className="btn ghost">
            {busy ? "Uploading…" : "Upload Excel / CSV into this exam"}
            <input type="file" accept=".xlsx,.xls,.csv,.txt,.json" hidden disabled={busy || !examId} onChange={onUpload} />
          </label>
          {examId && <Link className="btn ghost" to={`/admin/exams/${examId}`}>Open exam desk</Link>}
        </div>
      </div>

      <div className="panel">
        <h3>Full backup</h3>
        <div className="row">
          <button className="btn ghost" type="button" onClick={exportPack}>Export everything (JSON)</button>
          <button className="btn ghost" type="button" onClick={exportStaff}>Staff &amp; incharge JSON</button>
        </div>
      </div>
    </div>
  );
}
