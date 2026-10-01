function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    if (row.some((c) => String(c).trim() !== "")) rows.push(row);
    row = [];
  };
  const src = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (q) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") pushCell();
    else if (ch === "\n") {
      pushCell();
      pushRow();
    } else if (ch !== "\r") cell += ch;
  }
  pushCell();
  pushRow();
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || "").trim());
  return rows.slice(1).map((vals) => {
    const obj = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = vals[i] == null ? "" : String(vals[i]).trim();
    });
    return obj;
  });
}

export async function rowsFromSpreadsheet(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".json")) {
    const data = JSON.parse(await file.text());
    return Array.isArray(data) ? data : data.rows || [];
  }
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return parseCsv(await file.text());
  }
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

export function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export const STUDENT_TEMPLATE_HEADERS = ["fullName", "mobile", "email", "address"];
