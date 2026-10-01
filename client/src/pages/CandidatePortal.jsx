import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import CameraCapture from "../CameraCapture.jsx";
import FileSlot from "../FileSlot.jsx";
import PublicChrome from "../PublicChrome.jsx";
import { api } from "../api";

const FINGERS = [
  ["LEFT", "THUMB", "Left thumb"],
  ["LEFT", "INDEX", "Left index"],
  ["LEFT", "MIDDLE", "Left middle"],
  ["LEFT", "RING", "Left ring"],
  ["LEFT", "LITTLE", "Left little"],
  ["RIGHT", "THUMB", "Right thumb"],
  ["RIGHT", "INDEX", "Right index"],
  ["RIGHT", "MIDDLE", "Right middle"],
  ["RIGHT", "RING", "Right ring"],
  ["RIGHT", "LITTLE", "Right little"],
];

const DOC_TYPES = [
  ["PHOTO", "Passport photograph"],
  ["SIGNATURE", "Signature"],
  ["AADHAAR", "Aadhaar card"],
  ["ID_PROOF", "Photo ID (PAN / Voter / Passport / DL)"],
  ["CLASS10", "Class 10 marksheet / certificate"],
  ["CLASS12", "Class 12 marksheet / certificate"],
  ["CATEGORY", "Category certificate (if applicable)"],
  ["PWD", "PwBD certificate (if applicable)"],
  ["DOMICILE", "Domicile / residence proof"],
];

const emptyProfile = {
  fatherName: "",
  motherName: "",
  guardianName: "",
  nationality: "Indian",
  category: "GENERAL",
  religion: "",
  maritalStatus: "UNMARRIED",
  bloodGroup: "",
  idMark: "",
  disability: "NONE",
  aadhaar: "",
  pan: "",
  voterId: "",
  passportNo: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  district: "",
  state: "",
  pincode: "",
  permAddress: "",
};

function OtrDone({ otrId, mobile, otp, setOtp }) {
  const [exams, setExams] = useState([]);
  const [apps, setApps] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/api/exams").then(setExams).catch(() => {});
  }, []);

  async function apply(exam) {
    setErr("");
    setMsg("");
    try {
      const out = await api(`/api/exams/${exam.id}/apply-public`, { method: "POST", body: { mobile, otp } });
      setMsg(out.message || `Applied to ${exam.slug}. Centre comes on the admit card.`);
      setApps((a) => [...a, { slug: exam.slug, status: out.status }]);
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div>
      <p>OTR <b className="mono">{otrId}</b> is complete. You do not choose a centre.</p>
      <h3>Open exam applications</h3>
      {!exams.length && <p className="hint">No paper is in the registration window right now.</p>}
      {exams.map((ex) => (
        <div key={ex.id} className="row" style={{ marginBottom: 8 }}>
          <span>{ex.name} · {ex.exam_date}</span>
          <Link className="btn ghost" to={`/digi-exam/${ex.slug}`}>Open form</Link>
          <button className="btn" type="button" onClick={() => apply(ex)}>Apply now</button>
        </div>
      ))}
      <div className="form-grid" style={{ marginTop: 12 }}>
        <div>
          <label>OTP (needed to apply)</label>
          <input value={otp} onChange={(e) => setOtp(e.target.value)} />
        </div>
      </div>
      {msg && <p className="hint">{msg}</p>}
      {err && <p className="err">{err}</p>}
      {apps.map((a, i) => <p key={i} className="hint">{a.slug}: {a.status}</p>)}
      <p><Link className="btn ghost" to="/">Public index</Link></p>
    </div>
  );
}

export default function CandidatePortal() {
  const loc = useLocation();
  const [step, setStep] = useState("basic");
  const [basic, setBasic] = useState({
    fullName: "", mobile: "", email: "", dob: "", gender: "M", consent: true,
  });
  const [photo, setPhoto] = useState("");
  const [otrId, setOtrId] = useState("");
  const [otp, setOtp] = useState("");
  const [profile, setProfile] = useState(emptyProfile);
  const [docs, setDocs] = useState({});
  const [fingers, setFingers] = useState({});
  const [activeFinger, setActiveFinger] = useState("LEFT_THUMB");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const capturedCount = useMemo(() => Object.keys(fingers).filter((k) => fingers[k]).length, [fingers]);

  function setP(key, value) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  function setDoc(type, file) {
    setDocs((d) => ({ ...d, [type]: file }));
  }

  async function activate(e) {
    e.preventDefault();
    setErr("");
    if (!photo) {
      setErr("Capture live photograph.");
      return;
    }
    try {
      const data = await api("/api/candidates/register", {
        method: "POST",
        body: { ...basic, photoData: photo },
      });
      setOtrId(data.otrId);
      setStep("profile");
    } catch (e2) {
      if (e2.message === "DUPLICATE_MOBILE" && e2.payload?.next === "PROFILE") {
        setOtrId(e2.payload.otrId);
        setStep("profile");
        setMsg("This mobile already has a basic OTR. Complete the full form below.");
        return;
      }
      if (e2.message === "DUPLICATE_MOBILE" && e2.payload?.next === "DONE") {
        setOtrId(e2.payload.otrId);
        setStep("done");
        return;
      }
      setErr(e2.message);
    }
  }

  async function resume(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await api("/api/candidates/otr-login", {
        method: "POST",
        body: { mobile: basic.mobile, otp },
      });
      setOtrId(data.otr_id);
      setBasic((b) => ({ ...b, fullName: data.full_name, email: data.email || b.email }));
      if (data.identity_status === "OTR_COMPLETE") setStep("done");
      else setStep("profile");
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function complete(e) {
    e.preventDefault();
    setErr("");
    const documents = Object.entries(docs).map(([docType, f]) => ({
      docType, fileData: f.fileData, fileName: f.fileName,
    }));
    const fingerprints = FINGERS.filter(([h, f]) => fingers[`${h}_${f}`]).map(([hand, finger]) => ({
      hand, finger, imageData: fingers[`${hand}_${finger}`],
    }));
    try {
      await api(`/api/candidates/${otrId}/complete`, {
        method: "POST",
        body: { mobile: basic.mobile, otp, profile, documents, fingerprints },
      });
      setStep("done");
    } catch (e2) {
      const map = {
        PROFILE_INCOMPLETE: "Fill all required personal and address fields.",
        DOCUMENT_REQUIRED: "Upload photograph, signature, Aadhaar and photo ID.",
        FINGERPRINT_REQUIRED: "Capture all 10 fingerprints (left and right hand).",
        INVALID_OTP: "OTP is incorrect. Demo OTP is 123456.",
      };
      setErr(map[e2.message] || e2.message);
    }
  }

  const inner = (
      <div className="panel otr-wide dsx-panel">
        <div className="kicker">Identity Vault</div>
        <h2>One-Time Registration</h2>
        <p className="hint">OTR is identity only. Exam application will open later. Centre is never chosen by the student.</p>
        <div className="otr-steps">
          <span className={step === "basic" ? "on" : ""}>1. Basic</span>
          <span className={step === "profile" ? "on" : ""}>2. Full profile</span>
          <span className={step === "done" ? "on" : ""}>3. OTR complete</span>
        </div>

        {step === "basic" && (
          <>
            <form onSubmit={activate}>
              <div className="form-grid">
                <div>
                  <label>Full name (as per Class 10)</label>
                  <input value={basic.fullName} onChange={(e) => setBasic({ ...basic, fullName: e.target.value })} required />
                </div>
                <div>
                  <label>Mobile (10 digits)</label>
                  <input value={basic.mobile} onChange={(e) => setBasic({ ...basic, mobile: e.target.value })} required />
                </div>
                <div>
                  <label>Email</label>
                  <input type="email" value={basic.email} onChange={(e) => setBasic({ ...basic, email: e.target.value })} required />
                </div>
                <div>
                  <label>Date of birth</label>
                  <input type="date" value={basic.dob} onChange={(e) => setBasic({ ...basic, dob: e.target.value })} required />
                </div>
                <div>
                  <label>Gender</label>
                  <select value={basic.gender} onChange={(e) => setBasic({ ...basic, gender: e.target.value })}>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="T">Third gender</option>
                  </select>
                </div>
              </div>
              <label>Live photograph</label>
              <CameraCapture onCapture={setPhoto} />
              <label className="row" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={basic.consent} onChange={(e) => setBasic({ ...basic, consent: e.target.checked })} />
                I consent to identity, document and biometric processing for examination security.
              </label>
              {err && <p className="err">{err}</p>}
              <button className="btn" type="submit" style={{ marginTop: 12 }}>Activate OTR and continue</button>
            </form>
            <hr />
            <form onSubmit={resume}>
              <h3>Already started OTR?</h3>
              <div className="form-grid">
                <div>
                  <label>Registered mobile</label>
                  <input value={basic.mobile} onChange={(e) => setBasic({ ...basic, mobile: e.target.value })} />
                </div>
                <div>
                  <label>OTP</label>
                  <input value={otp} onChange={(e) => setOtp(e.target.value)} />
                </div>
              </div>
              <button className="btn ghost" type="submit" style={{ marginTop: 12 }}>Resume</button>
            </form>
          </>
        )}

        {step === "profile" && (
          <form onSubmit={complete}>
            <p>OTR ID <b className="mono">{otrId}</b>. Fill every section like a government exam form.</p>
            {msg && <p className="hint">{msg}</p>}
            <h3>Family &amp; personal</h3>
            <div className="form-grid">
              <div>
                <label>Father name</label>
                <input value={profile.fatherName} onChange={(e) => setP("fatherName", e.target.value)} required />
              </div>
              <div>
                <label>Mother name</label>
                <input value={profile.motherName} onChange={(e) => setP("motherName", e.target.value)} required />
              </div>
              <div>
                <label>Guardian name (if any)</label>
                <input value={profile.guardianName} onChange={(e) => setP("guardianName", e.target.value)} />
              </div>
              <div>
                <label>Blood group</label>
                <select value={profile.bloodGroup} onChange={(e) => setP("bloodGroup", e.target.value)} required>
                  <option value="">Select</option>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label>Nationality</label>
                <input value={profile.nationality} onChange={(e) => setP("nationality", e.target.value)} required />
              </div>
              <div>
                <label>Category</label>
                <select value={profile.category} onChange={(e) => setP("category", e.target.value)}>
                  <option>GENERAL</option>
                  <option>OBC</option>
                  <option>SC</option>
                  <option>ST</option>
                  <option>EWS</option>
                </select>
              </div>
              <div>
                <label>Religion</label>
                <input value={profile.religion} onChange={(e) => setP("religion", e.target.value)} />
              </div>
              <div>
                <label>Marital status</label>
                <select value={profile.maritalStatus} onChange={(e) => setP("maritalStatus", e.target.value)}>
                  <option>UNMARRIED</option>
                  <option>MARRIED</option>
                  <option>OTHER</option>
                </select>
              </div>
              <div>
                <label>Identification mark</label>
                <input value={profile.idMark} onChange={(e) => setP("idMark", e.target.value)} />
              </div>
              <div>
                <label>PwBD / disability</label>
                <select value={profile.disability} onChange={(e) => setP("disability", e.target.value)}>
                  <option>NONE</option>
                  <option>VH</option>
                  <option>HH</option>
                  <option>OH</option>
                  <option>OTHER</option>
                </select>
              </div>
            </div>

            <h3>Identity numbers</h3>
            <div className="form-grid">
              <div>
                <label>Aadhaar</label>
                <input value={profile.aadhaar} onChange={(e) => setP("aadhaar", e.target.value)} required />
              </div>
              <div>
                <label>PAN</label>
                <input value={profile.pan} onChange={(e) => setP("pan", e.target.value)} />
              </div>
              <div>
                <label>Voter ID</label>
                <input value={profile.voterId} onChange={(e) => setP("voterId", e.target.value)} />
              </div>
              <div>
                <label>Passport no.</label>
                <input value={profile.passportNo} onChange={(e) => setP("passportNo", e.target.value)} />
              </div>
            </div>

            <h3>Present address</h3>
            <div className="form-grid">
              <div className="span-2">
                <label>Address line 1</label>
                <input value={profile.addressLine1} onChange={(e) => setP("addressLine1", e.target.value)} required />
              </div>
              <div className="span-2">
                <label>Address line 2</label>
                <input value={profile.addressLine2} onChange={(e) => setP("addressLine2", e.target.value)} />
              </div>
              <div>
                <label>City</label>
                <input value={profile.city} onChange={(e) => setP("city", e.target.value)} required />
              </div>
              <div>
                <label>District</label>
                <input value={profile.district} onChange={(e) => setP("district", e.target.value)} required />
              </div>
              <div>
                <label>State</label>
                <input value={profile.state} onChange={(e) => setP("state", e.target.value)} required />
              </div>
              <div>
                <label>PIN code</label>
                <input value={profile.pincode} onChange={(e) => setP("pincode", e.target.value)} required />
              </div>
              <div className="span-2">
                <label>Permanent address (if different)</label>
                <input value={profile.permAddress} onChange={(e) => setP("permAddress", e.target.value)} />
              </div>
            </div>

            <h3>Legal documents</h3>
            <div className="form-grid">
              {DOC_TYPES.map(([type, label]) => (
                <FileSlot
                  key={type}
                  label={label}
                  captured={docs[type]}
                  onFile={(f) => setDoc(type, f)}
                />
              ))}
            </div>

            <h3>Fingerprints — left and right hand</h3>
            <p className="hint">Capture {capturedCount}/10. Select a finger, then scan or upload.</p>
            <div className="finger-grid">
              {FINGERS.map(([hand, finger, label]) => {
                const key = `${hand}_${finger}`;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`finger-chip ${activeFinger === key ? "on" : ""} ${fingers[key] ? "ok" : ""}`}
                    onClick={() => setActiveFinger(key)}
                  >
                    {label}{fingers[key] ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
            <CameraCapture
              key={activeFinger}
              label={`Capture ${activeFinger.replace("_", " ").toLowerCase()}`}
              onCapture={(data) => setFingers((f) => ({ ...f, [activeFinger]: data }))}
            />

            <label>Confirm OTP to lock OTR</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} required />
            {err && <p className="err">{err}</p>}
            <button className="btn" type="submit" style={{ marginTop: 14 }}>Submit full OTR</button>
          </form>
        )}

        {step === "done" && (
          <OtrDone otrId={otrId} mobile={basic.mobile} otp={otp} setOtp={setOtp} />
        )}
      </div>
  );
  if (loc.pathname.startsWith("/candidate")) return inner;
  return (
    <PublicChrome
      banner="/exam/student-otr-register.jpg"
      title="Student OTR"
      subtitle="Register once. Use the same identity for every exam."
    >
      {inner}
    </PublicChrome>
  );
}
