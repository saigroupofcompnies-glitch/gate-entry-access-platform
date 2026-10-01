import { useEffect, useState } from "react";
import { api } from "../api";

export default function CentreHome() {
  const [ov, setOv] = useState(null);
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [downloadKey, setDownloadKey] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/api/live/overview").then(setOv).catch(() => {});
    api("/api/dashboard/exams").then((rows) => {
      setExams(rows);
      if (rows[0]) setExamId(rows[0].id);
    }).catch(() => setExams([]));
  }, []);

  async function downloadPack(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      const pack = await api("/api/centre/download-pack", {
        method: "POST",
        body: { centreId: ov.centreId, downloadKey, examId },
      });
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `centre-pack-${pack.centre?.id}-${pack.exam?.slug || examId}.json`;
      a.click();
      setMsg(`Saved on this centre main login only: ${pack.candidateCount} candidates for ${pack.exam?.name}. Do not copy this file onto gate/classroom devices.`);
    } catch (e2) {
      setErr(e2.message === "INVALID_CENTRE_KEY" ? "Centre download key is incorrect." : e2.message);
    }
  }

  if (!ov) return <p>Loading…</p>;
  return (
    <div>
      <div className="topbar">
        <div>
          <h2 style={{ margin: 0 }}>{ov.centreName} · {ov.examName}</h2>
        </div>
      </div>
      <p className="hint">Approve staff and monitor this venue. Exam creation belongs to Main Admin. Full multi-centre view belongs to Control room.</p>
      <div className="cards">
        <div className="metric"><span>Staff pending your approval</span><b>{ov.staffPending}</b></div>
        <div className="metric"><span>Active staff</span><b>{ov.staffActive}</b></div>
        <div className="metric"><span>Centre entered</span><b>{ov.centreEntered}</b></div>
        <div className="metric"><span>In labs</span><b>{ov.classroomPresent}</b></div>
      </div>

      <div className="panel">
        <h3>Centre main server — exam data download</h3>
        <p className="hint">
          Use the unique centre key issued by Main Admin. This pack is for the <b>centre main server / incharge PC only</b>.
          Gate scanners and classroom devices stay thin: they scan live and do not download the candidate list.
        </p>
        <form onSubmit={downloadPack} className="form-grid">
          <div>
            <label>Examination</label>
            <select value={examId} onChange={(e) => setExamId(e.target.value)}>
              {exams.map((x) => <option key={x.id} value={x.id}>{x.slug} — {x.name}</option>)}
            </select>
          </div>
          <div>
            <label>Centre download key</label>
            <input value={downloadKey} onChange={(e) => setDownloadKey(e.target.value)} placeholder="DSX-… key from Main Admin" required />
          </div>
          <div>
            <label>&nbsp;</label>
            <button className="btn" type="submit">Download this centre pack</button>
          </div>
        </form>
        {msg && <p className="hint">{msg}</p>}
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  );
}
