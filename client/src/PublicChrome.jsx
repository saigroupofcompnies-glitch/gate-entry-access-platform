import { Link } from "react-router-dom";

export function Logo({ light }) {
  return (
    <Link to="/" className={`dsx-logo ${light ? "light" : ""}`}>
      <span className="dsx-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="42" height="42">
          <path fill="currentColor" d="M24 4l16 6v10c0 11-7 20-16 24C15 40 8 31 8 20V10l16-6z" opacity=".2" />
          <path fill="none" stroke="currentColor" strokeWidth="2.4" d="M24 5.5l14 5.2v9.6c0 10-6.4 18.2-14 21.8-7.6-3.6-14-11.8-14-21.8V10.7L24 5.5z" />
          <path fill="currentColor" d="M16 22h16v2.2H16zm2.2-6.5h11.6L24 11z" />
          <path fill="none" stroke="currentColor" strokeWidth="2" d="M20 26.5h8v6.5c0 2-1.8 4-4 4s-4-2-4-4z" />
        </svg>
      </span>
      <span>
        <b>DigiSecureExam</b>
        <em>SAFE EXAMS · SECURE NATION</em>
      </span>
    </Link>
  );
}

const PUBLIC_LINKS = [
  ["/", "Home"],
  ["/#about", "About"],
  ["/#guidelines", "Guidelines"],
  ["/#helpdesk", "Helpdesk"],
  ["/#contact", "Contact"],
];

export default function PublicChrome({
  banner = "/exam/hero-airport-boarding.jpg",
  title,
  subtitle,
  children,
  page,
}) {
  const isLogin = page === "login";
  return (
    <div className={`dsx-landing${page ? ` dsx-page-${page}` : ""}`}>
      <header className="dsx-nav">
        <div className="dsx-nav-inner">
          <Logo />
          <nav>
            {PUBLIC_LINKS.map(([href, label]) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
          {isLogin
            ? <Link className="dsx-admin" to="/">Home</Link>
            : <Link className="dsx-admin" to="/login">Login</Link>}
        </div>
      </header>
      {(title || banner) && (
        <div className="dsx-page-hero">
          <img src={banner} alt="" />
          <div className="dsx-page-hero-copy">
            {title && <h1>{title}</h1>}
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
      )}
      <div className="dsx-page-body">{children}</div>
      <footer className="dsx-foot">
        <Logo light />
        <p>
          <a href="/#about">Privacy Policy</a>
          <a href="/#guidelines">Terms &amp; Conditions</a>
          <a href="/#helpdesk">Helpdesk</a>
          <a href="/#contact">Contact Us</a>
        </p>
        <small>A digital examination management platform for a secure and transparent process.</small>
      </footer>
    </div>
  );
}
