import { useEffect, useState } from "react";
import { api } from "../api";
import { StaffGatePass, StaffIdCard, downloadHtml, printHtml, staffDocsPrintHtml } from "../StaffCredentials.jsx";

export default function StaffDutyPortal() {
  const [pack, setPack] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/api/staff/me/pack")
      .then(setPack)
      .catch((e) => setErr(e.message === "STAFF_PROFILE_MISSING"
        ? "This login has no staff duty profile. Register as centre staff, get approved, then sign in with the issued User ID."
        : e.message));
  }, []);

  if (err) return <p className="err">{err}</p>;
  if (!pack) return <p>Loading identity card and gate pass…</p>;

  const { staff, items } = pack;

  return (
    <div>
      <div className="kicker">Staff portal</div>
      <h2 style={{ marginTop: 0 }}>Identity card and gate pass</h2>
      <p className="hint">
        Same login. Download or print both documents after you are approved and assigned to an examination.
        Carry the identity card on duty and scan the gate pass at Sentinel Gate.
      </p>
      <div className="cards">
        <div className="metric"><span>Staff</span><b>{staff.fullName}</b></div>
        <div className="metric"><span>Status</span><b>{staff.status}</b></div>
        <div className="metric"><span>Centre</span><b>{staff.centreName || staff.centreId}</b></div>
        <div className="metric"><span>Duties</span><b>{items.length}</b></div>
      </div>
      {!items.length && (
        <div className="panel">
          <p>No exam assignment yet. After the centre incharge assigns you, this page will show the ID card and gate pass for download.</p>
        </div>
      )}
      {items.map((item) => {
        const idHtml = staffDocsPrintHtml({ staff, item, kind: "id" });
        const gpHtml = staffDocsPrintHtml({ staff, item, kind: "gate" });
        const slug = item.exam?.slug || "exam";
        return (
          <div key={item.assignmentId} className="panel">
            <h3>{item.exam?.name} · {item.exam?.exam_date}</h3>
            <p className="hint">{item.role} · {item.centre?.name} {item.labId ? `· ${item.labId}` : ""}</p>
            <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
              <button className="btn" type="button" onClick={() => printHtml(idHtml)}>Print identity card</button>
              <button className="btn ghost" type="button" onClick={() => downloadHtml(`staff-id-${slug}.html`, idHtml)}>Download ID card</button>
              <button className="btn" type="button" onClick={() => printHtml(gpHtml)}>Print gate pass</button>
              <button className="btn ghost" type="button" onClick={() => downloadHtml(`staff-gate-pass-${slug}.html`, gpHtml)}>Download gate pass</button>
            </div>
            <h4>Identity card</h4>
            <StaffIdCard staff={staff} exam={item.exam} centre={item.centre} role={item.role} qrDataUrl={item.idCard?.qrDataUrl} employeeCode={staff.employeeCode} />
            <h4>Gate pass</h4>
            <StaffGatePass staff={staff} exam={item.exam} centre={item.centre} role={item.role} labId={item.labId} qrDataUrl={item.gatePass?.qrDataUrl} />
          </div>
        );
      })}
    </div>
  );
}
