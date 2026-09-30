import { Link } from "react-router-dom";

export default function PublicIndex() {
  return (
    <div className="gov-shell">
      <div className="gov-tricolor" aria-hidden="true" />
      <header className="gov-masthead">
        <div className="gov-emblem">
          <span>भारत</span>
          <b>EIALM</b>
        </div>
        <div>
          <p className="gov-dept">National Examination Identity &amp; Access Platform</p>
          <p className="gov-sub">One-Time Registration · Centre Duty Enrolment · Live Centre Control</p>
        </div>
      </header>

      <main className="gov-main">
        <p className="gov-kicker">Public registration desk</p>
        <h1>Choose the correct desk. These are two different processes.</h1>
        <p className="gov-lead">
          Students complete reusable OTR identity. Centre personnel enrol for duty. Exam application and centre allotment are not done here.
        </p>

        <div className="gov-split">
          <article className="lane-student">
            <header>
              <span className="lane-code">Desk A · Candidate</span>
              <h2>Student OTR</h2>
              <p>Identity enrolment as in a government examination form. Not an exam application.</p>
            </header>
            <ol>
              <li>Basic particulars and live photograph</li>
              <li>Family, blood group, address, identity numbers</li>
              <li>Legal documents and ten fingerprints</li>
            </ol>
            <Link className="lane-cta" to="/otr">Open student OTR form</Link>
          </article>

          <article className="lane-staff">
            <header>
              <span className="lane-code">Desk B · Venue</span>
              <h2>Centre staff &amp; incharge</h2>
              <p>Duty enrolment for invigilators, operators and Centre Incharge. Separate from student OTR.</p>
            </header>
            <ul>
              <li>Personal, identity and service particulars</li>
              <li>Staff wait for Centre Incharge approval</li>
              <li>Incharge waits for Main Admin approval</li>
            </ul>
            <Link className="lane-cta inverse" to="/staff-register">Open duty enrolment form</Link>
          </article>
        </div>
      </main>

      <footer className="gov-foot">
        <span>Authorised operations (Incharge / Client / Admin)</span>
        <Link to="/operations">Enter operations login</Link>
      </footer>
    </div>
  );
}
