export function BoardingPass({
  passenger,
  otrId,
  flight,
  examName,
  date,
  reporting,
  centre,
  city,
  seat,
  lab,
  qrDataUrl,
  serial,
  examMode,
}) {
  const cbt = String(examMode || "").toUpperCase() === "CBT";
  return (
    <article className="gpass gpass-candidate">
      <div className="gpass-main">
        <header className="gpass-head">
          <span className="gpass-mark">DSX</span>
          <div>
            <strong>DigiSecureExam</strong>
            <em>Candidate gate pass</em>
          </div>
          <b className="gpass-kind">CANDIDATE</b>
        </header>
        <p className="gpass-passenger">{passenger}</p>
        <div className="gpass-route">
          <div>
            <i>From</i>
            <b>Identity vault</b>
          </div>
          <span className="gpass-arrow" aria-hidden="true">→</span>
          <div>
            <i>To / centre</i>
            <b>{centre || "Allotted centre"}</b>
          </div>
        </div>
        <div className="gpass-grid">
          <div><i>Paper</i><b>{flight}</b></div>
          <div><i>Date</i><b>{date}</b></div>
          <div><i>Reporting</i><b>{reporting || "08:30"}</b></div>
          <div><i>Roll</i><b className="mono">{seat || "—"}</b></div>
          <div><i>City</i><b>{city || "—"}</b></div>
          <div><i>Lab</i><b>{lab || (cbt ? "At classroom gate" : "Classroom")}</b></div>
        </div>
        <p className="gpass-note">
          {examName} · {cbt ? "CBT seat is assigned at classroom gate after face scan" : "Offline paper · no computer seat"}
          · Scan at Sentinel Gate, then classroom gate
        </p>
        <p className="gpass-serial mono">{otrId} {serial ? `· ${serial}` : ""}</p>
      </div>
      <aside className="gpass-stub">
        <div className="gpass-notch gpass-notch-t" />
        <div className="gpass-notch gpass-notch-b" />
        {qrDataUrl ? <img src={qrDataUrl} alt="Gate QR" /> : <div className="bp-qr-miss">QR after issue</div>}
        <strong>GATE</strong>
        <em>{flight || "PASS"}</em>
        <span>Scan boarding QR</span>
      </aside>
    </article>
  );
}

export function boardingPrintHtml(p) {
  const cbt = String(p.examMode || "").toUpperCase() === "CBT";
  return `<!doctype html><html><head><title>Digisecurexam Gate Pass ${p.seat || ""}</title>
  <style>
    @page{size:A4 landscape;margin:12mm}
    body{margin:0;background:#d9e0ea;font-family:"Segoe UI",Arial,sans-serif;padding:24px}
    .gpass{display:grid;grid-template-columns:1fr 190px;max-width:920px;margin:0 auto;background:linear-gradient(135deg,#071525,#163152 55%,#1a3a4a);color:#f4efe4;border-radius:18px;overflow:hidden}
    .gpass-main{padding:22px}
    .gpass-head{display:flex;gap:10px;align-items:center}
    .gpass-mark{background:#c9a227;color:#102040;padding:4px 8px;font-weight:800;border-radius:4px}
    .gpass-kind{margin-left:auto;letter-spacing:.2em;color:#c9a227}
    .gpass-passenger{font-size:28px;font-weight:800;margin:12px 0}
    .gpass-route{display:flex;gap:16px;align-items:center;margin-bottom:14px}
    .gpass-arrow{color:#c9a227;font-size:22px}
    .gpass-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    i{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#9bb0c7;font-style:normal}
    .gpass-note{font-size:12px;color:#c9d6e4}
    .gpass-stub{position:relative;background:#08101c;border-left:2px dashed #c9a227;padding:18px 12px;text-align:center}
    .gpass-stub img{width:132px;background:#fff;padding:6px;border-radius:8px}
    .gpass-stub strong{display:block;margin-top:8px;letter-spacing:.18em;font-size:22px;color:#c9a227}
    .gpass-notch{width:18px;height:18px;background:#d9e0ea;border-radius:50%;position:absolute;left:-10px}
    .gpass-notch-t{top:-9px}.gpass-notch-b{bottom:-9px}
  </style></head><body>
  <article class="gpass">
    <div class="gpass-main">
      <header class="gpass-head"><span class="gpass-mark">DSX</span><div><strong>DigiSecureExam</strong><em> Candidate gate pass</em></div><b class="gpass-kind">CANDIDATE</b></header>
      <p class="gpass-passenger">${p.passenger || ""}</p>
      <div class="gpass-route"><div><i>From</i><b>Identity vault</b></div><span class="gpass-arrow">→</span><div><i>To / centre</i><b>${p.centre || ""}</b></div></div>
      <div class="gpass-grid">
        <div><i>Paper</i><b>${p.flight || ""}</b></div>
        <div><i>Date</i><b>${p.date || ""}</b></div>
        <div><i>Reporting</i><b>${p.reporting || ""}</b></div>
        <div><i>Roll</i><b>${p.seat || "—"}</b></div>
        <div><i>City</i><b>${p.city || ""}</b></div>
        <div><i>Lab</i><b>${p.lab || (cbt ? "Classroom gate" : "Classroom")}</b></div>
      </div>
      <p class="gpass-note">${p.examName || ""} · ${cbt ? "CBT seat at classroom gate" : "Offline · no computer seat"} · ${p.otrId || ""}</p>
    </div>
    <aside class="gpass-stub">
      <div class="gpass-notch gpass-notch-t"></div><div class="gpass-notch gpass-notch-b"></div>
      ${p.qrDataUrl ? `<img src="${p.qrDataUrl}" alt="QR"/>` : ""}
      <strong>GATE</strong>
    </aside>
  </article>
  <script>setTimeout(function(){window.print()},400)</script>
  </body></html>`;
}
