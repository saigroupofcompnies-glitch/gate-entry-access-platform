function averageHashFromDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image")) {
    return null;
  }
  const buf = Buffer.from(dataUrl.split(",")[1] || "", "base64");
  if (buf.length < 400) return null;
  const sample = Buffer.alloc(64);
  const step = Math.max(1, Math.floor(buf.length / 64));
  for (let i = 0; i < 64; i++) sample[i] = buf[i * step] || 0;
  let avg = 0;
  for (const b of sample) avg += b;
  avg = avg / 64;
  let bits = "";
  for (const b of sample) bits += b >= avg ? "1" : "0";
  return bits;
}

function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

function scoreFromDistance(distance) {
  return Math.max(0, Math.round((1 - distance / 64) * 100));
}

function classify(score, thresholds) {
  const pass = thresholds.pass ?? 70;
  const borderline = thresholds.borderline ?? 50;
  if (score >= pass) return "VERIFIED";
  if (score >= borderline) return "BORDERLINE";
  return "MISMATCH";
}

module.exports = { averageHashFromDataUrl, hamming, scoreFromDistance, classify };
