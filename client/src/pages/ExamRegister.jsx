import { Link, useParams } from "react-router-dom";

export default function ExamRegister() {
  const { slug } = useParams();
  return (
    <div className="login-wrap">
      <div className="panel" style={{ width: "min(640px, 100%)" }}>
        <p><Link to="/">← Public index</Link></p>
        <div className="kicker">DIGITAL-EXAM/{slug?.toUpperCase()}</div>
        <h2>Exam application is not open yet</h2>
        <p>Finish Student OTR first (basic details, then full profile, documents and fingerprints). The exam form for this paper will be published later. Students will not select a centre.</p>
        <p><Link className="btn" to="/otr">Go to Student OTR</Link></p>
      </div>
    </div>
  );
}
