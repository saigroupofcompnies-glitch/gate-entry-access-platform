import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CameraCapture from "../CameraCapture.jsx";
import FileSlot from "../FileSlot.jsx";
import PublicChrome from "../PublicChrome.jsx";
import { api } from "../api";

const empty = {
  kind: "STAFF",
  fullName: "",
  fatherName: "",
  motherName: "",
  mobile: "",
  email: "",
  dob: "",
  gender: "M",
  bloodGroup: "",
  aadhaar: "",
  pan: "",
  designation: "",
  roleApplied: "INVIGILATOR",
  employeeCode: "",
  department: "",
  qualification: "",
  experienceYears: "",
  centreId: "",
  addressLine1: "",
  city: "",
  state: "",
  pincode: "",
  emergencyName: "",
  emergencyMobile: "",
};

export default function StaffPortal() {
  const [centres, setCentres] = useState([]);
  const [form, setForm] = useState(empty);
  const [photo, setPhoto] = useState("");
  const [idProof, setIdProof] = useState(null);
  const [signature, setSignature] = useState(null);
  const [out, setOut] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/api/centres/public").then((rows) => {
      setCentres(rows);
      if (rows[0]) setForm((f) => ({ ...f, centreId: rows[0].id }));
    }).catch(() => {});
  }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await api("/api/staff/register", {
        method: "POST",
        body: {
          ...form,
          photoData: photo,
          idProofData: idProof?.fileData,
          idProofName: idProof?.fileName,
          signatureData: signature?.fileData,
          signatureName: signature?.fileName,
        },
      });
      setOut(data);
    } catch (e2) {
      setErr(e2.message === "STAFF_DETAILS_INCOMPLETE"
        ? "Fill father name, date of birth, Aadhaar and address."
        : e2.message);
    }
  }

  if (out) {
    return (
      <PublicChrome banner="/exam/staff-centre-desk.jpg" title="Centre staff" subtitle="Application received">
        <div className="panel otr-wide dsx-panel">
          <p><Link to="/">← Home</Link></p>
          <h2>Application received</h2>
          <p>{out.message}</p>
          <p>Reference <b className="mono">{out.staffId}</b></p>
          <p className="hint">After approval, sign in on Login → Staff with the issued User ID. You can download your identity card and staff gate pass from that portal.</p>
        </div>
      </PublicChrome>
    );
  }

  return (
    <PublicChrome
      banner="/exam/staff-centre-desk.jpg"
      title="Centre staff"
      subtitle="Staff and centre incharge registration for exam-day duty."
    >
      <div className="panel otr-wide dsx-panel">
          <h2>{form.kind === "INCHARGE" ? "Centre Incharge application" : "Centre staff application"}</h2>
          <p className="hint">
            {form.kind === "INCHARGE"
              ? "Main Admin must approve an Incharge before a login is issued."
              : "Centre Incharge must approve duty staff for this venue."}
          </p>
          <form onSubmit={submit}>
            <h3>Application type</h3>
            <div className="form-grid">
              <div>
                <label>Registering as</label>
                <select value={form.kind} onChange={(e) => set("kind", e.target.value)}>
                  <option value="STAFF">Centre staff (invigilator / operator)</option>
                  <option value="INCHARGE">Centre Incharge</option>
                </select>
              </div>
              <div>
                <label>Posted centre</label>
                <select value={form.centreId} onChange={(e) => set("centreId", e.target.value)}>
                  {centres.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.city})</option>)}
                </select>
              </div>
            </div>

            <h3>Personal particulars</h3>
            <div className="form-grid">
              <div>
                <label>Full name</label>
                <input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} required />
              </div>
              <div>
                <label>Father name</label>
                <input value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} required />
              </div>
              <div>
                <label>Mother name</label>
                <input value={form.motherName} onChange={(e) => set("motherName", e.target.value)} />
              </div>
              <div>
                <label>Date of birth</label>
                <input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} required />
              </div>
              <div>
                <label>Gender</label>
                <select value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="T">Third gender</option>
                </select>
              </div>
              <div>
                <label>Blood group</label>
                <select value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>
                  <option value="">Select</option>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label>Mobile (10 digits)</label>
                <input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} required />
              </div>
              <div>
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
            </div>

            <h3>Identity</h3>
            <div className="form-grid">
              <div>
                <label>Aadhaar</label>
                <input value={form.aadhaar} onChange={(e) => set("aadhaar", e.target.value)} required />
              </div>
              <div>
                <label>PAN</label>
                <input value={form.pan} onChange={(e) => set("pan", e.target.value)} />
              </div>
            </div>

            <h3>Service / duty</h3>
            <div className="form-grid">
              {form.kind === "STAFF" && (
                <div>
                  <label>Duty role</label>
                  <select value={form.roleApplied} onChange={(e) => set("roleApplied", e.target.value)}>
                    <option>INVIGILATOR</option>
                    <option>SECURITY_OPERATOR</option>
                    <option>CENTRE_OPERATOR</option>
                    <option>IT_OPERATOR</option>
                    <option>BIOMETRIC_OPERATOR</option>
                  </select>
                </div>
              )}
              <div>
                <label>Designation</label>
                <input value={form.designation} onChange={(e) => set("designation", e.target.value)} required />
              </div>
              <div>
                <label>Employee / staff code</label>
                <input value={form.employeeCode} onChange={(e) => set("employeeCode", e.target.value)} />
              </div>
              <div>
                <label>Department / organisation</label>
                <input value={form.department} onChange={(e) => set("department", e.target.value)} />
              </div>
              <div>
                <label>Highest qualification</label>
                <input value={form.qualification} onChange={(e) => set("qualification", e.target.value)} required />
              </div>
              <div>
                <label>Years of experience</label>
                <input value={form.experienceYears} onChange={(e) => set("experienceYears", e.target.value)} />
              </div>
            </div>

            <h3>Address</h3>
            <div className="form-grid">
              <div className="span-2">
                <label>Address line</label>
                <input value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} required />
              </div>
              <div>
                <label>City</label>
                <input value={form.city} onChange={(e) => set("city", e.target.value)} required />
              </div>
              <div>
                <label>State</label>
                <input value={form.state} onChange={(e) => set("state", e.target.value)} required />
              </div>
              <div>
                <label>PIN code</label>
                <input value={form.pincode} onChange={(e) => set("pincode", e.target.value)} required />
              </div>
            </div>

            <h3>Emergency contact</h3>
            <div className="form-grid">
              <div>
                <label>Contact name</label>
                <input value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />
              </div>
              <div>
                <label>Contact mobile</label>
                <input value={form.emergencyMobile} onChange={(e) => set("emergencyMobile", e.target.value)} />
              </div>
            </div>

            <h3>Photograph, signature and ID proof</h3>
            <label>Live / passport photograph</label>
            <CameraCapture onCapture={setPhoto} />
            <div className="form-grid">
              <FileSlot label="Signature scan" captured={signature} onFile={setSignature} />
              <FileSlot label="Photo ID proof (Aadhaar / PAN / DL)" captured={idProof} onFile={setIdProof} />
            </div>
            {err && <p className="err">{err}</p>}
            <button className="btn" type="submit" style={{ marginTop: 16 }}>Submit duty enrolment</button>
          </form>
        </div>
    </PublicChrome>
  );
}
