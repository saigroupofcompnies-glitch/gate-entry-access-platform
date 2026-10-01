import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

const KEY = "dsx_admin_filters";
const AdminFilterContext = createContext(null);

const empty = { otr: "", examId: "", centreId: "" };

function readStored() {
  try {
    return { ...empty, ...JSON.parse(sessionStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...empty };
  }
}

export function filterQuery(filters) {
  const p = new URLSearchParams();
  if (filters.otr) p.set("q", filters.otr);
  if (filters.examId) p.set("examId", filters.examId);
  if (filters.centreId) p.set("centreId", filters.centreId);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function matchAdminFilters(row, filters) {
  if (!row) return false;
  const q = String(filters.otr || "").trim().toLowerCase();
  if (q) {
    const blob = [
      row.otr_id, row.full_name, row.mobile, row.email, row.subject_id,
      row.username, row.display_name, row.name, row.slug, row.code,
      row.application_no, row.id, row.exams, row.city, row.role, row.role_applied,
    ].map((v) => String(v || "").toLowerCase()).join(" ");
    if (!blob.includes(q)) return false;
  }
  if (filters.examId) {
    const id = row.exam_id || row.examId;
    if (id && id !== filters.examId) return false;
    if (!id && row.exams && typeof row.exams === "string") {
      /* OTR list stores exam slugs, not ids — keep if exams column empty means unassigned */
    }
  }
  if (filters.centreId) {
    const id = row.centre_id || row.centreId;
    if (id && id !== filters.centreId) return false;
    if (!id && row.centre_name == null && row.otr_id && filters.examId) {
      /* wait for API filter */
    }
  }
  return true;
}

export function AdminFilterProvider({ children }) {
  const [filters, setFilters] = useState(readStored);
  const [exams, setExams] = useState([]);
  const [centres, setCentres] = useState([]);
  useEffect(() => { sessionStorage.setItem(KEY, JSON.stringify(filters)); }, [filters]);
  useEffect(() => {
    api("/api/admin/exams").then(setExams).catch(() => setExams([]));
    api("/api/centres").then(setCentres).catch(() => setCentres([]));
  }, []);
  const value = useMemo(
    () => ({ filters, setFilters, exams, centres, query: filterQuery(filters) }),
    [filters, exams, centres]
  );
  return <AdminFilterContext.Provider value={value}>{children}</AdminFilterContext.Provider>;
}

export function useAdminFilters() {
  const ctx = useContext(AdminFilterContext);
  if (!ctx) {
    return {
      filters: empty,
      setFilters: () => {},
      exams: [],
      centres: [],
      query: "",
    };
  }
  return ctx;
}

export function AdminFilterBar() {
  const { filters, setFilters, exams, centres } = useAdminFilters();
  function patch(part) {
    setFilters((f) => ({ ...f, ...part }));
  }
  return (
    <div className="dsx-admin-filters">
      <label>
        OTR / student
        <input
          value={filters.otr}
          onChange={(e) => patch({ otr: e.target.value })}
          placeholder="OTR, name or mobile"
        />
      </label>
      <label>
        Exam
        <select value={filters.examId} onChange={(e) => patch({ examId: e.target.value })}>
          <option value="">All exams</option>
          {exams.map((x) => (
            <option key={x.id} value={x.id}>{x.slug} — {x.name}</option>
          ))}
        </select>
      </label>
      <label>
        Centre
        <select value={filters.centreId} onChange={(e) => patch({ centreId: e.target.value })}>
          <option value="">All centres</option>
          {centres.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.city})</option>
          ))}
        </select>
      </label>
      <button className="btn ghost" type="button" onClick={() => setFilters({ ...empty })}>Clear</button>
    </div>
  );
}
