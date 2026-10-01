import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Logo } from "../PublicChrome.jsx";

export default function PublicIndex() {
  const [papers, setPapers] = useState([]);
  useEffect(() => { api("/api/exams").then(setPapers).catch(() => setPapers([])); }, []);

  return (
    <div className="dsx-landing">
      <header className="dsx-nav">
        <div className="dsx-nav-inner">
          <Logo />
          <nav>
            <a href="#home">Home</a>
            <a href="#about">About</a>
            <a href="#guidelines">Guidelines</a>
            <a href="#helpdesk">Helpdesk</a>
            <a href="#contact">Contact</a>
          </nav>
          <Link className="dsx-admin" to="/login">Login</Link>
        </div>
      </header>

      <section className="dsx-hero" id="home">
        <div className="dsx-hero-copy">
          <h1>Secure. Simple. <span>Seamless.</span></h1>
          <p>A unified platform for examination registration, verification and centre management.</p>
          <div className="dsx-pills">
            <span>Secure Registration</span>
            <span>Verified Candidates</span>
            <span>Transparent Process</span>
            <span>Trusted by Institutions</span>
          </div>
        </div>
        <div className="dsx-hero-photo">
          <img src="/exam/hero-airport-boarding.jpg" alt="Students at exam security with boarding passes" />
          <div className="dsx-shield" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="88" height="88">
              <path fill="#7ec8ff" opacity=".35" d="M32 6l22 8v16c0 14-10 26-22 30C20 56 10 44 10 30V14l22-8z" />
              <path fill="none" stroke="#fff" strokeWidth="3" d="M32 8l20 7.4v15c0 13-9 24-20 28-11-4-20-15-20-28v-15L32 8z" />
              <rect x="26" y="26" width="12" height="14" rx="2" fill="none" stroke="#fff" strokeWidth="2.5" />
              <path fill="none" stroke="#fff" strokeWidth="2.5" d="M29 26v-3a3 3 0 016 0v3" />
            </svg>
          </div>
        </div>
      </section>

      <section className="dsx-desks">
        <article className="dsx-card student">
          <img src="/exam/student-otr-register.jpg" alt="Student completing exam registration on a laptop" />
          <div>
            <h2>Student OTR</h2>
            <p>Register once. Use it for every exam.</p>
            <ul>
              <li>One Time Registration (OTR)</li>
              <li>Create &amp; manage profile</li>
              <li>Use for all exams</li>
              <li>Secure &amp; verified identity</li>
            </ul>
            <Link className="dsx-cta blue" to="/otr">Register →</Link>
          </div>
        </article>
        <article className="dsx-card staff">
          <div>
            <h2>Centre Staff</h2>
            <p>Staff and centre incharge registration.</p>
            <ul>
              <li>Staff registration</li>
              <li>Centre incharge access</li>
              <li>Manage exam day activities</li>
              <li>Secure login &amp; role based access</li>
            </ul>
            <Link className="dsx-cta orange" to="/staff-register">Register →</Link>
          </div>
          <img src="/exam/staff-centre-desk.jpg" alt="Centre staff working at the examination desk" />
        </article>
      </section>

      <section className="dsx-strip">
        <div><b>Single registration</b> for all exams</div>
        <div><b>Secure &amp; verified</b> process</div>
        <div><b>Real-time</b> monitoring</div>
        <div><b>Centre</b> management</div>
        <div><b>Dedicated</b> helpdesk</div>
      </section>

      {papers.length > 0 && (
        <section className="dsx-open">
          <h3>Open examinations</h3>
          <ul>
            {papers.map((p) => (
              <li key={p.id}>
                <Link to={`/digi-exam/${p.slug}`}>{p.name}</Link>
                <span>{p.exam_date}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="dsx-info" id="about">
        <h3>About</h3>
        <p>DigiSecureExam is a digital examination identity and centre-access platform. Students complete OTR once. Centres verify face and fingerprint on exam day.</p>
      </section>
      <section className="dsx-info" id="guidelines">
        <h3>Guidelines</h3>
        <p>Complete OTR with photograph, documents and 10 fingerprints. Apply during the registration window. Collect the boarding pass when issued. Carry it to the centre gate.</p>
      </section>
      <section className="dsx-info" id="helpdesk">
        <h3>Helpdesk</h3>
        <p>For OTR or boarding-pass help, use the registered mobile on the student desk. Centre staff issues are handled by the centre incharge.</p>
      </section>
      <section className="dsx-info" id="contact">
        <h3>Contact</h3>
        <p>Students, staff, centre incharge and admin all use <a href="/login">Login</a>.</p>
      </section>

      <footer className="dsx-foot">
        <Logo light />
        <p>
          <a href="#about">Privacy Policy</a>
          <a href="#guidelines">Terms &amp; Conditions</a>
          <a href="#helpdesk">Helpdesk</a>
          <a href="#contact">Contact Us</a>
        </p>
        <small>A digital examination management platform for a secure and transparent process.</small>
      </footer>
    </div>
  );
}
