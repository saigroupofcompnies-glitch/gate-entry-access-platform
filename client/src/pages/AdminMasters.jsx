import { useEffect, useState } from "react";
import { api } from "../api";

export default function AdminMasters() {
  const [exams, setExams] = useState([]);
  const [centres, setCentres] = useState([]);
  const [labs, setLabs] = useState([]);
  const [exam, setExam] = useState({ code: "", name: "", examDate: "", reportingTime: "08:30", slug: "" });
  const [centre, setCentre] = useState({ name: "", city: "", state: "", capacity: 200 });

  async function load() {
    setExams(await api("/api/admin/exams"));
    setCentres(await api("/api/centres"));
    setLabs(await api("/api/admin/labs"));
  }
  useEffect(() => { load(); }, []);

  async function addExam(e) {
    e.preventDefault();
    await api("/api/exams", { method: "POST", body: exam });
    setExam({ code: "", name: "", examDate: "", reportingTime: "08:30", slug: "" });
    load();
  }
  async function addCentre(e) {
    e.preventDefault();
    await api("/api/centres", { method: "POST", body: centre });
    load();
  }
  async function setLife(id, lifecycle) {
    await api(`/api/exams/${id}/lifecycle`, { method: "PATCH", body: { lifecycle } });
    load();
  }

  return (
    <div>
      <div className="kicker">Main Admin</div>
      <h2>Exams, centres &amp; DIGITAL-EXAM pages</h2>
      <p className="hint" style={{ color: "#cbb" }}>
        New exams start as DRAFT. Open them to publish a registration URL such as DIGITAL-EXAM/BPSC. LIVE starts exam-day monitoring. CLOSED stops registration and operations.
      </p>
      <div className="panel">
        <h3>Exams</h3>
        <table>
          <thead>
            <tr>
              <th>Code / slug</th>
              <th>Name</th>
              <th>Date</th>
              <th>Lifecycle</th>
              <th>Registration URL</th>
              <th>Start / control</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((x) => (
              <tr key={x.id}>
                <td className="mono">{x.code}<div>{x.slug}</div></td>
                <td>{x.name}</td>
                <td>{x.exam_date}</td>
                <td><span className={`pill ${x.lifecycle === "LIVE" ? "ok" : x.lifecycle === "OPEN" ? "warnp" : "muted"}`}>{x.lifecycle || x.status}</span></td>
                <td className="mono">/DIGITAL-EXAM/{x.slug || x.code}</td>
                <td>
                  <div className="row">
                    <button className="btn ghost" type="button" onClick={() => setLife(x.id, "DRAFT")}>Draft</button>
                    <button className="btn" type="button" onClick={() => setLife(x.id, "OPEN")}>Open registration</button>
                    <button className="btn" type="button" onClick={() => setLife(x.id, "LIVE")}>Start live</button>
                    <button className="btn danger" type="button" onClick={() => setLife(x.id, "CLOSED")}>Close</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addExam} className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <input placeholder="Code e.g. BPSC" value={exam.code} onChange={(e) => setExam({ ...exam, code: e.target.value, slug: exam.slug || e.target.value })} required />
          <input placeholder="Slug e.g. BPSC" value={exam.slug} onChange={(e) => setExam({ ...exam, slug: e.target.value })} />
          <input placeholder="Name" value={exam.name} onChange={(e) => setExam({ ...exam, name: e.target.value })} required />
          <input type="date" value={exam.examDate} onChange={(e) => setExam({ ...exam, examDate: e.target.value })} required />
          <button className="btn" type="submit">Create exam (DRAFT)</button>
        </form>
      </div>
      <div className="panel">
        <h3>Centres</h3>
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>City</th><th>Capacity</th></tr></thead>
          <tbody>
            {centres.map((c) => (
              <tr key={c.id}><td className="mono">{c.id}</td><td>{c.name}</td><td>{c.city}</td><td>{c.capacity}</td></tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addCentre} className="row" style={{ marginTop: 12 }}>
          <input placeholder="Name" value={centre.name} onChange={(e) => setCentre({ ...centre, name: e.target.value })} required />
          <input placeholder="City" value={centre.city} onChange={(e) => setCentre({ ...centre, city: e.target.value })} />
          <input placeholder="Capacity" value={centre.capacity} onChange={(e) => setCentre({ ...centre, capacity: e.target.value })} />
          <button className="btn" type="submit">Add centre</button>
        </form>
      </div>
      <div className="panel">
        <h3>Labs / classrooms</h3>
        <table>
          <thead><tr><th>ID</th><th>Centre</th><th>Name</th><th>Capacity</th></tr></thead>
          <tbody>
            {labs.map((l) => (
              <tr key={l.id}><td className="mono">{l.id}</td><td>{l.centre_id}</td><td>{l.name}</td><td>{l.capacity}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
