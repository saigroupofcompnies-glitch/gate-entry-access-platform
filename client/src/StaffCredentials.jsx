export function StaffIdCard({ staff, exam, centre, role, qrDataUrl, employeeCode }) {
  return (
    <article className="pass-id">
      <div className="pass-id-flag" aria-hidden="true" />
      <header className="pass-id-head">
        <div className="pass-seal">DSX</div>
        <div>
          <strong>DigiSecureExam</strong>
          <em>Official examination duty identity card</em>
        </div>
        <span className="pass-chip">AUTHORIZED</span>
      </header>
      <div className="pass-id-body">
        <div className="pass-photo">
          {staff?.photoData ? <img src={staff.photoData} alt="" /> : <div className="pass-photo-miss">PHOTO</div>}
          <span>Exam-day ID</span>
        </div>
        <div className="pass-id-meta">
          <p className="pass-kicker">{role || staff?.designation || "Duty staff"}</p>
          <h3>{staff?.fullName || "—"}</h3>
          <dl>
            <div><dt>Staff ID</dt><dd className="mono">{staff?.id}</dd></div>
            <div><dt>Emp. code</dt><dd>{employeeCode || staff?.employeeCode || "—"}</dd></div>
            <div><dt>Mobile</dt><dd>{staff?.mobile || "—"}</dd></div>
            <div><dt>Centre</dt><dd>{centre?.name || staff?.centreName || "—"}</dd></div>
            <div className="span2"><dt>Examination</dt><dd>{exam?.name || "—"}</dd></div>
            <div><dt>Valid</dt><dd>{exam?.exam_date || "Exam day"}</dd></div>
            <div><dt>Blood</dt><dd>{staff?.bloodGroup || "—"}</dd></div>
          </dl>
        </div>
        <div className="pass-id-qr">
          {qrDataUrl ? <img src={qrDataUrl} alt="Identity QR" /> : <div className="bp-qr-miss">QR</div>}
          <b>SCAN ID</b>
          <small>Wear visibly on duty</small>
        </div>
      </div>
      <footer className="pass-id-foot">
        This card is valid only with the matching staff gate pass for the named examination. Property of DigiSecureExam.
      </footer>
    </article>
  );
}

export function StaffGatePass({ staff, exam, centre, role, labId, qrDataUrl }) {
  return (
    <article className="gpass gpass-staff">
      <div className="gpass-main">
        <header className="gpass-head">
          <span className="gpass-mark">DSX</span>
          <div>
            <strong>DigiSecureExam</strong>
            <em>Staff gate pass</em>
          </div>
          <b className="gpass-kind">STAFF</b>
        </header>
        <p className="gpass-passenger">{staff?.fullName}</p>
        <div className="gpass-route">
          <div>
            <i>From</i>
            <b>Staff desk</b>
          </div>
          <span className="gpass-arrow" aria-hidden="true">→</span>
          <div>
            <i>To / gate</i>
            <b>{centre?.name || "Examination centre"}</b>
          </div>
        </div>
        <div className="gpass-grid">
          <div><i>Duty</i><b>{role || "STAFF"}</b></div>
          <div><i>Date</i><b>{exam?.exam_date || "—"}</b></div>
          <div><i>Reporting</i><b>{exam?.reporting_time || "08:30"}</b></div>
          <div><i>Paper</i><b>{exam?.slug || "—"}</b></div>
          <div><i>Lab / post</i><b>{labId || "Centre"}</b></div>
          <div><i>Staff ID</i><b className="mono">{staff?.id}</b></div>
        </div>
        <p className="gpass-note">{exam?.name} · Present this pass at Sentinel Gate. Carry the identity card together.</p>
      </div>
      <aside className="gpass-stub">
        <div className="gpass-notch gpass-notch-t" />
        <div className="gpass-notch gpass-notch-b" />
        {qrDataUrl ? <img src={qrDataUrl} alt="Gate QR" /> : <div className="bp-qr-miss">QR</div>}
        <strong>GATE</strong>
        <em>Exam day only</em>
        <span>Scan at Sentinel Gate</span>
      </aside>
    </article>
  );
}

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const PRINT_CSS = `
  @page { size: A4 landscape; margin: 12mm; }
  body{margin:0;background:#d9e0ea;font-family:"Segoe UI",Arial,sans-serif;padding:24px;color:#10233d}
  .pass-id{max-width:860px;margin:0 auto;background:linear-gradient(180deg,#0c2244,#0a1b36);color:#f7f3ea;border-radius:18px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,.25)}
  .pass-id-flag{height:8px;background:linear-gradient(90deg,#ff9933 0 33%,#fff 33% 66%,#138808 66% 100%)}
  .pass-id-head{display:flex;gap:12px;align-items:center;padding:14px 18px 8px}
  .pass-seal{width:42px;height:42px;border-radius:50%;background:#c9a227;color:#102040;font-weight:800;display:grid;place-items:center;letter-spacing:.04em}
  .pass-id-head strong{display:block;font-size:15px;letter-spacing:.12em;text-transform:uppercase}
  .pass-id-head em{font-style:normal;color:#c9d6e4;font-size:12px}
  .pass-chip{margin-left:auto;border:1px solid #c9a227;color:#c9a227;padding:4px 8px;font-size:10px;letter-spacing:.14em}
  .pass-id-body{display:grid;grid-template-columns:130px 1fr 150px;gap:16px;padding:8px 18px 16px}
  .pass-photo img,.pass-photo-miss{width:118px;height:142px;object-fit:cover;background:#fff;border:3px solid #c9a227;border-radius:6px}
  .pass-photo-miss{display:grid;place-items:center;color:#16325c;font-size:11px}
  .pass-photo span{display:block;text-align:center;font-size:10px;color:#9bb0c7;margin-top:6px;letter-spacing:.1em}
  .pass-kicker{margin:0;color:#c9a227;letter-spacing:.16em;text-transform:uppercase;font-size:11px}
  .pass-id-meta h3{margin:4px 0 12px;font-size:26px}
  .pass-id-meta dl{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin:0}
  .pass-id-meta .span2{grid-column:1/-1}
  dt{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#9bb0c7}
  dd{margin:2px 0 0;font-weight:700}
  .pass-id-qr{text-align:center}
  .pass-id-qr img{width:128px;background:#fff;padding:6px;border-radius:8px}
  .pass-id-qr b{display:block;margin-top:6px;letter-spacing:.16em}
  .pass-id-qr small{color:#9bb0c7}
  .pass-id-foot{background:#081426;padding:8px 18px;font-size:11px;color:#9bb0c7}
  .gpass{display:grid;grid-template-columns:1fr 190px;max-width:920px;margin:0 auto;background:linear-gradient(135deg,#07263a,#0c3d4a 50%,#0a2a40);color:#f4efe4;border-radius:18px;overflow:hidden;position:relative}
  .gpass-head{display:flex;gap:10px;align-items:center}
  .gpass-mark{background:#1fb8a8;color:#06242a;padding:4px 8px;font-weight:800;border-radius:4px}
  .gpass-kind{margin-left:auto;letter-spacing:.2em;color:#7ee7d8}
  .gpass-main{padding:20px 22px}
  .gpass-passenger{font-size:28px;font-weight:800;margin:12px 0}
  .gpass-route{display:flex;gap:16px;align-items:center;margin-bottom:14px}
  .gpass-arrow{font-size:22px;color:#1fb8a8}
  .gpass-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .gpass-grid i,.gpass-route i{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#9bb8c4;font-style:normal}
  .gpass-note{font-size:12px;color:#c9d6e4;margin:14px 0 0}
  .gpass-stub{position:relative;background:#041820;border-left:2px dashed #1fb8a8;padding:18px 12px;text-align:center}
  .gpass-stub img{width:132px;background:#fff;padding:6px;border-radius:8px}
  .gpass-stub strong{display:block;font-size:22px;letter-spacing:.18em;margin-top:8px;color:#7ee7d8}
  .gpass-notch{width:18px;height:18px;background:#d9e0ea;border-radius:50%;position:absolute;left:-10px}
  .gpass-notch-t{top:-9px}.gpass-notch-b{bottom:-9px}
`;

export function staffDocsPrintHtml({ staff, item, kind }) {
  const title = kind === "id" ? "Staff identity card" : "Staff gate pass";
  const photo = staff.photoData ? `<img src="${staff.photoData}" alt=""/>` : `<div class="pass-photo-miss">PHOTO</div>`;
  if (kind === "id") {
    return `<!doctype html><html><head><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>
    <article class="pass-id">
      <div class="pass-id-flag"></div>
      <header class="pass-id-head"><div class="pass-seal">DSX</div><div><strong>DigiSecureExam</strong><em>Official examination duty identity card</em></div><span class="pass-chip">AUTHORIZED</span></header>
      <div class="pass-id-body">
        <div class="pass-photo">${photo}<span>Exam-day ID</span></div>
        <div class="pass-id-meta">
          <p class="pass-kicker">${esc(item.role)}</p>
          <h3>${esc(staff.fullName)}</h3>
          <dl>
            <div><dt>Staff ID</dt><dd>${esc(staff.id)}</dd></div>
            <div><dt>Centre</dt><dd>${esc(item.centre?.name)}</dd></div>
            <div class="span2"><dt>Examination</dt><dd>${esc(item.exam?.name)}</dd></div>
            <div><dt>Valid</dt><dd>${esc(item.exam?.exam_date)}</dd></div>
            <div><dt>Mobile</dt><dd>${esc(staff.mobile)}</dd></div>
          </dl>
        </div>
        <div class="pass-id-qr">${item.idCard?.qrDataUrl ? `<img src="${item.idCard.qrDataUrl}" alt="QR"/>` : ""}<b>SCAN ID</b></div>
      </div>
      <footer class="pass-id-foot">Valid only with the matching staff gate pass for this examination.</footer>
    </article>
    <script>setTimeout(function(){window.print()},400)</script></body></html>`;
  }
  return `<!doctype html><html><head><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>
  <article class="gpass">
    <div class="gpass-main">
      <header class="gpass-head"><span class="gpass-mark">DSX</span><div><strong>DigiSecureExam</strong><em>Staff gate pass</em></div><b class="gpass-kind">STAFF</b></header>
      <p class="gpass-passenger">${esc(staff.fullName)}</p>
      <div class="gpass-route"><div><i>From</i><b>Staff desk</b></div><span class="gpass-arrow">→</span><div><i>To / gate</i><b>${esc(item.centre?.name)}</b></div></div>
      <div class="gpass-grid">
        <div><i>Duty</i><b>${esc(item.role)}</b></div>
        <div><i>Date</i><b>${esc(item.exam?.exam_date)}</b></div>
        <div><i>Reporting</i><b>${esc(item.exam?.reporting_time || "08:30")}</b></div>
        <div><i>Paper</i><b>${esc(item.exam?.slug)}</b></div>
        <div><i>Lab / post</i><b>${esc(item.labId || "Centre")}</b></div>
        <div><i>Staff ID</i><b>${esc(staff.id)}</b></div>
      </div>
      <p class="gpass-note">${esc(item.exam?.name)} · Scan at Sentinel Gate. Carry identity card.</p>
    </div>
    <aside class="gpass-stub">
      <div class="gpass-notch gpass-notch-t"></div><div class="gpass-notch gpass-notch-b"></div>
      ${item.gatePass?.qrDataUrl ? `<img src="${item.gatePass.qrDataUrl}" alt="QR"/>` : ""}
      <strong>GATE</strong><em>Exam day only</em>
    </aside>
  </article>
  <script>setTimeout(function(){window.print()},400)</script></body></html>`;
}

export function downloadHtml(filename, html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export function printHtml(html) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
