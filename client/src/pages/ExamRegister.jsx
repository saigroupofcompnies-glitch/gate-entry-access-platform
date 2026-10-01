import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { BoardingPass } from "../BoardingPass.jsx";
import PublicChrome from "../PublicChrome.jsx";

export default function ExamRegister() {
  const { slug } = useParams();
  const [exam, setExam] = useState(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [admit, setAdmit] = useState(null);

  useEffect(() => {
    api(`/api/exams/public/${slug}`).then(setExam).catch(() => setErr("EXAM_NOT_FOUND"));
  }, [slug]);

  async function apply(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      const out = await api(`/api/exams/${exam.id}/apply-public`, { method: "POST", body: { mobile, otp } });
      setMsg(out.message || `Registered for ${exam.slug}. Centre will appear on the admit card. Status: ${out.status}.`);
    } catch (e2) {
      const map = {
        COMPLETE_OTR_FIRST: "Complete Student OTR first.",
        OTR_NOT_COMPLETE: "Finish the full OTR form before applying.",
        REGISTRATION_CLOSED: "Registration is not open for this paper.",
        INVALID_OTP: "OTP is incorrect.",
      };
      setErr(map[e2.message] || e2.message);
    }
  }

  async function lookupAdmit(e) {
    e.preventDefault();
    setErr("");
    try {
      setAdmit(await api("/api/admit-card/lookup", { method: "POST", body: { mobile, otp, slug } }));
    } catch (e2) {
      const map = {
        ADMIT_NOT_ISSUED: "Gate pass is not issued yet.",
        NO_APPLICATION: "No application found for this mobile on this exam.",
      };
      setErr(map[e2.message] || e2.message);
    }
  }

  if (!exam && !err) {
    return (
      <PublicChrome banner="/exam/students-exam-pass.jpg" title="Examination" subtitle="Loading…">
        <p>Loading…</p>
      </PublicChrome>
    );
  }
  if (err === "EXAM_NOT_FOUND" && !exam) {
    return (
      <PublicChrome banner="/exam/students-exam-pass.jpg" title="Examination" subtitle="Not found">
        <div className="panel dsx-panel"><p><Link to="/">← Home</Link></p><h2>Exam not found</h2></div>
      </PublicChrome>
    );
  }

  return (
    <PublicChrome
      banner="/exam/students-exam-pass.jpg"
      title={exam.name}
      subtitle={`Exam date ${exam.exam_date}. Registration ${exam.registration_start || "—"} to ${exam.registration_close || "—"}.`}
    >
      <div className="panel dsx-panel" style={{ width: "min(760px, 100%)", margin: "0 auto" }}>
        <p>You do not choose a centre here. Centre and roll number come on the gate pass after it is issued.</p>

        {!exam.registrationOpen && (
          <p><b>Registration is {exam.registrationStatus === "NOT_STARTED" ? "not started yet" : "closed"}.</b> Finish OTR meanwhile.</p>
        )}

        {exam.registrationOpen && (
          <form onSubmit={apply}>
            <h3>Apply with OTR mobile</h3>
            <div className="form-grid">
              <div>
                <label>Mobile</label>
                <input value={mobile} onChange={(e) => setMobile(e.target.value)} required />
              </div>
              <div>
                <label>OTP</label>
                <input value={otp} onChange={(e) => setOtp(e.target.value)} required />
              </div>
            </div>
            <button className="btn" type="submit" style={{ marginTop: 12 }}>Apply</button>
          </form>
        )}

        <form onSubmit={lookupAdmit} style={{ marginTop: 24 }}>
          <h3>Retrieve gate pass</h3>
          <div className="form-grid">
            <div>
              <label>Mobile</label>
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} required />
            </div>
            <div>
              <label>OTP</label>
              <input value={otp} onChange={(e) => setOtp(e.target.value)} required />
            </div>
          </div>
          <button className="btn ghost" type="submit" style={{ marginTop: 12 }}>Show gate pass</button>
        </form>

        {msg && <p className="hint">{msg}</p>}
        {err && err !== "EXAM_NOT_FOUND" && <p className="err">{err}</p>}
        <p><Link className="btn ghost" to="/otr">Student OTR</Link></p>

        {admit && (
          <div style={{ marginTop: 20 }}>
            <BoardingPass
              passenger={admit.candidate.fullName}
              otrId={admit.candidate.otrId}
              flight={admit.exam.slug}
              examName={admit.exam.name}
              date={admit.exam.exam_date}
              reporting={admit.exam.reporting_time}
              centre={admit.centre?.name}
              city={admit.centre?.city}
              seat={admit.rollNo}
              lab={admit.lab?.name}
              qrDataUrl={admit.qrDataUrl}
              serial={admit.token?.slice(-8)}
              examMode={admit.examMode || admit.exam?.mode}
            />
          </div>
        )}
      </div>
    </PublicChrome>
  );
}
