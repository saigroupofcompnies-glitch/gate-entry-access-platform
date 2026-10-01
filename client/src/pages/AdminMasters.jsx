import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useAdminFilters } from "../AdminFilters.jsx";

export default function AdminMasters() {
  const { filters } = useAdminFilters();
  const [exams, setExams] = useState([]);
  const [centres, setCentres] = useState([]);
  const [labs, setLabs] = useState([]);
  const [exam, setExam] = useState({
    name: "",
    examDate: "",
    registrationStart: "",
    registrationClose: "",
    mode: "OFFLINE",
    authority: "",
    examType: "Offline",
  });
  const [centre, setCentre] = useState({ name: "", address: "", city: "", state: "", capacity: 200 });
  const [err, setErr] = useState("");

  async function load() {
    const [ex, ce, la] = await Promise.all([api("/api/admin/exams"), api("/api/centres"), api("/api/admin/labs")]);
    setExams(ex);
    setCentres(ce);
    setLabs(la);
  }
  useEffect(() => { load(); }, []);

  async function addExam(e) {
    e.preventDefault();
    setErr("");
    try {
      await api("/api/exams", { method: "POST", body: exam });
      setExam({ name: "", examDate: "", registrationStart: "", registrationClose: "", mode: "OFFLINE", authority: "", examType: "Offline" });
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  }
  async function addCentre(e) {
    e.preventDefault();
    await api("/api/centres", { method: "POST", body: centre });
    setCentre({ name: "", address: "", city: "", state: "", capacity: 200 });
    load();
  }

  return (
    <div>
      <div className="kicker">Examination Management</div>
      <h2>Examination Management</h2>
      <p className="hint">
        Exam master is separate from OTR. After create: link centres → run allocation → generate gate pass. CBT may assign a seat at the classroom device; offline does not.
      </p>
      {err && <p className="err">{err}</p>}
      <div className="panel">
        <h3>New examination</h3>
        <form onSubmit={addExam} className="form-grid">
          <div className="span-2">
            <label>Exam name</label>
            <input value={exam.name} onChange={(e) => setExam({ ...exam, name: e.target.value })} required placeholder="e.g. BPSC Combined Competitive Examination" />
          </div>
          <div>
            <label>Exam date</label>
            <input type="date" value={exam.examDate} onChange={(e) => setExam({ ...exam, examDate: e.target.value })} required />
          </div>
          <div>
            <label>Registration starts</label>
            <input type="datetime-local" value={exam.registrationStart} onChange={(e) => setExam({ ...exam, registrationStart: e.target.value })} required />
          </div>
          <div>
            <label>Registration closes</label>
            <input type="datetime-local" value={exam.registrationClose} onChange={(e) => setExam({ ...exam, registrationClose: e.target.value })} required />
          </div>
          <div>
            <label>Authority</label>
            <input value={exam.authority} onChange={(e) => setExam({ ...exam, authority: e.target.value })} placeholder="Conducting body" />
          </div>
          <div>
            <label>Exam type</label>
            <select value={exam.examType} onChange={(e) => setExam({ ...exam, examType: e.target.value })}>
              <option>Offline</option>
              <option>Online</option>
              <option>Hybrid</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label>Mode</label>
            <select value={exam.mode} onChange={(e) => setExam({ ...exam, mode: e.target.value })}>
              <option value="OFFLINE">Offline paper — no seat</option>
              <option value="CBT">CBT — seat at classroom gate</option>
            </select>
          </div>
          <div className="span-2">
            <button className="btn" type="submit">Create exam</button>
          </div>
        </form>
        <table style={{ marginTop: 18 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Mode</th>
              <th>Exam date</th>
              <th>Registration</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {exams.filter((x) => !filters.examId || x.id === filters.examId).map((x) => (
              <tr key={x.id}>
                <td>{x.name}<div className="mono">/digi-exam/{x.slug}</div></td>
                <td>{x.mode || "OFFLINE"}</td>
                <td>{x.exam_date}</td>
                <td className="hint">{x.registration_start || "—"} → {x.registration_close || "—"}</td>
                <td><Link className="btn" to={`/admin/exams/${x.id}`}>Desk</Link> <Link className="btn ghost" to="/admin/allocation">Allocate</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h3>Centre master (used at admit-card allotment)</h3>
        <p className="hint">Students never select a centre. Link centres on the exam desk, then start admit cards.</p>
        <table>
          <thead><tr><th>Name</th><th>City</th><th>Capacity</th></tr></thead>
          <tbody>
            {centres.map((c) => (
              <tr key={c.id}><td>{c.name}</td><td>{c.city}</td><td>{c.capacity}</td></tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addCentre} className="form-grid" style={{ marginTop: 12 }}>
          <div>
            <label>Centre name</label>
            <input value={centre.name} onChange={(e) => setCentre({ ...centre, name: e.target.value })} required />
          </div>
          <div>
            <label>Address</label>
            <input value={centre.address} onChange={(e) => setCentre({ ...centre, address: e.target.value })} required />
          </div>
          <div>
            <label>City</label>
            <input value={centre.city} onChange={(e) => setCentre({ ...centre, city: e.target.value })} required />
          </div>
          <div>
            <label>State</label>
            <input value={centre.state} onChange={(e) => setCentre({ ...centre, state: e.target.value })} required />
          </div>
          <div>
            <label>Capacity</label>
            <input type="number" min="1" value={centre.capacity} onChange={(e) => setCentre({ ...centre, capacity: e.target.value })} required />
          </div>
          <div>
            <button className="btn" type="submit" style={{ marginTop: 22 }}>Add centre</button>
          </div>
        </form>
        <p className="hint" style={{ marginTop: 12 }}>{labs.length} lab(s) exist. Missing labs are auto-created from centre capacity when admit cards or face scan run.</p>
      </div>
    </div>
  );
}
