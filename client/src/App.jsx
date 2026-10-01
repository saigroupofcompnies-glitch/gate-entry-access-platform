import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { getToken, getUser } from "./api";
import PortalShell from "./PortalShell.jsx";
import PublicIndex from "./pages/PublicIndex.jsx";
import OperationsHub from "./pages/OperationsHub.jsx";
import CandidatePortal from "./pages/CandidatePortal.jsx";
import StaffPortal from "./pages/StaffPortal.jsx";
import HeadPortal from "./pages/HeadPortal.jsx";
import GatePortal from "./pages/GatePortal.jsx";
import ClassroomPortal from "./pages/ClassroomPortal.jsx";
import ReportsPortal from "./pages/ReportsPortal.jsx";
import AdminMasters from "./pages/AdminMasters.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";
import AdminPolicy from "./pages/AdminPolicy.jsx";
import AdminExam from "./pages/AdminExam.jsx";
import AdminOtr from "./pages/AdminOtr.jsx";
import {
  AdminRegistrations,
  AdminCentres,
  AdminLabs,
  AdminAllocation,
  AdminExceptions,
  AdminPasses,
  AdminGateEvents,
  AdminAttendance,
  AdminNotify,
  AdminHelpdesk,
  AdminReports,
  AdminHealth,
  AdminStaff,
} from "./pages/adminModules.jsx";
import CentreHome from "./pages/CentreHome.jsx";
import ExamDashboard from "./pages/ExamDashboard.jsx";
import StaffDutyPortal from "./pages/StaffDutyPortal.jsx";

function Guard({ portal, roles, extraLinks, photo, children }) {
  const token = getToken();
  const user = getUser();
  if (!token || !user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;
  return <PortalShell portal={portal} extraLinks={extraLinks} photo={photo}>{children}</PortalShell>;
}

function LegacyExamPath() {
  const { slug } = useParams();
  return <Navigate to={`/digi-exam/${slug}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicIndex />} />
      <Route path="/login" element={<OperationsHub />} />
      <Route path="/operations" element={<Navigate to="/login" replace />} />
      <Route path="/digi-exam/:slug" element={<ExamRegister />} />
      <Route path="/DIGITAL-EXAM/:slug" element={<LegacyExamPath />} />
      <Route path="/login/gate" element={<Navigate to="/login" replace />} />
      <Route path="/login/classroom" element={<Navigate to="/login" replace />} />
      <Route path="/login/candidate" element={<Navigate to="/login" replace />} />
      <Route path="/otr" element={<CandidatePortal />} />
      <Route path="/staff-register" element={<StaffPortal />} />

      <Route path="/admin" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><ExamDashboard variant="admin" /></Guard>} />
      <Route path="/admin/exams/:examId" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminExam /></Guard>} />
      <Route path="/admin/exams" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminMasters /></Guard>} />
      <Route path="/admin/masters" element={<Navigate to="/admin/exams" replace />} />
      <Route path="/admin/otr" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminOtr /></Guard>} />
      <Route path="/admin/registrations" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminRegistrations /></Guard>} />
      <Route path="/admin/centres" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminCentres /></Guard>} />
      <Route path="/admin/labs" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminLabs /></Guard>} />
      <Route path="/admin/allocation" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminAllocation /></Guard>} />
      <Route path="/admin/exceptions" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminExceptions /></Guard>} />
      <Route path="/admin/passes" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminPasses /></Guard>} />
      <Route path="/admin/gate" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminGateEvents /></Guard>} />
      <Route path="/admin/verify" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminGateEvents biometric /></Guard>} />
      <Route path="/admin/attendance" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminAttendance /></Guard>} />
      <Route path="/admin/live" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><ExamDashboard variant="admin" /></Guard>} />
      <Route path="/admin/staff" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminStaff /></Guard>} />
      <Route path="/admin/reports" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminReports /></Guard>} />
      <Route path="/admin/data" element={<Navigate to="/admin/reports" replace />} />
      <Route path="/admin/notify" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminNotify /></Guard>} />
      <Route path="/admin/helpdesk" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminHelpdesk /></Guard>} />
      <Route path="/admin/audit" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><ReportsPortal /></Guard>} />
      <Route path="/admin/config" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminPolicy /></Guard>} />
      <Route path="/admin/policy" element={<Navigate to="/admin/config" replace />} />
      <Route path="/admin/users" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminUsers /></Guard>} />
      <Route path="/admin/health" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminHealth /></Guard>} />

      <Route path="/centre" element={<Guard portal="supervisor" roles={["CENTRE_HEAD"]}><CentreHome /></Guard>} />
      <Route path="/centre/staff" element={<Guard portal="supervisor" roles={["CENTRE_HEAD"]}><HeadPortal /></Guard>} />
      <Route path="/centre/presence" element={<Guard portal="supervisor" roles={["CENTRE_HEAD"]}><ExamDashboard variant="client" /></Guard>} />
      <Route path="/centre/alerts" element={<Guard portal="supervisor" roles={["CENTRE_HEAD"]}><ExamDashboard key="alerts" variant="client" initialTab="alerts" /></Guard>} />

      <Route path="/control-room" element={<Guard portal="client" roles={["CLIENT", "DEPARTMENT_OFFICER"]}><ExamDashboard variant="client" /></Guard>} />
      <Route path="/control-room/labs" element={<Guard portal="client" roles={["CLIENT", "DEPARTMENT_OFFICER"]}><ExamDashboard key="labs" variant="client" initialTab="labs" /></Guard>} />
      <Route path="/control-room/students" element={<Guard portal="client" roles={["CLIENT", "DEPARTMENT_OFFICER"]}><ExamDashboard key="cands" variant="client" initialTab="candidates" /></Guard>} />
      <Route path="/control-room/alerts" element={<Guard portal="client" roles={["CLIENT", "DEPARTMENT_OFFICER"]}><ExamDashboard key="alerts" variant="client" initialTab="alerts" /></Guard>} />

      <Route path="/candidate" element={<Guard portal="candidate" roles={["CANDIDATE"]}><CandidatePortal /></Guard>} />
      <Route path="/staff" element={<Guard portal="staff" roles={["STAFF"]}><StaffDutyPortal /></Guard>} />
      <Route path="/staff/pass" element={<Guard portal="staff" roles={["STAFF", "CENTRE_HEAD", "SECURITY_OPERATOR", "BIOMETRIC_OPERATOR", "CENTRE_OPERATOR"]}><StaffDutyPortal /></Guard>} />
      <Route path="/gate" element={<Guard portal="field" roles={["SECURITY_OPERATOR", "CENTRE_OPERATOR"]} extraLinks={[["/gate", "Scan & decide"], ["/staff/pass", "ID card & gate pass"]]}><GatePortal /></Guard>} />
      <Route path="/classroom" element={<Guard portal="field" roles={["BIOMETRIC_OPERATOR"]} extraLinks={[["/classroom", "Classroom gate"], ["/staff/pass", "ID card & gate pass"]]} photo="/exam/classroom-cbt.jpg"><ClassroomPortal /></Guard>} />
    </Routes>
  );
}
