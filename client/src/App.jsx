import { Navigate, Route, Routes } from "react-router-dom";
import { getToken, getUser } from "./api";
import PortalShell from "./PortalShell.jsx";
import PublicIndex from "./pages/PublicIndex.jsx";
import OperationsHub from "./pages/OperationsHub.jsx";
import DeviceLogin from "./pages/DeviceLogin.jsx";
import CandidatePortal from "./pages/CandidatePortal.jsx";
import StaffPortal from "./pages/StaffPortal.jsx";
import HeadPortal from "./pages/HeadPortal.jsx";
import GatePortal from "./pages/GatePortal.jsx";
import ClassroomPortal from "./pages/ClassroomPortal.jsx";
import ReportsPortal from "./pages/ReportsPortal.jsx";
import AdminHome from "./pages/AdminHome.jsx";
import AdminMasters from "./pages/AdminMasters.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";
import AdminPolicy from "./pages/AdminPolicy.jsx";
import CentreHome from "./pages/CentreHome.jsx";
import LiveBoard from "./pages/LiveBoard.jsx";
import ExamRegister from "./pages/ExamRegister.jsx";

function Guard({ portal, roles, extraLinks, children }) {
  const token = getToken();
  const user = getUser();
  if (!token || !user) return <Navigate to="/operations" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/operations" replace />;
  return <PortalShell portal={portal} extraLinks={extraLinks}>{children}</PortalShell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicIndex />} />
      <Route path="/operations" element={<OperationsHub />} />
      <Route path="/DIGITAL-EXAM/:slug" element={<ExamRegister />} />
      <Route path="/login/gate" element={<DeviceLogin kind="gate" />} />
      <Route path="/login/classroom" element={<DeviceLogin kind="classroom" />} />
      <Route path="/login/candidate" element={<DeviceLogin kind="candidate" />} />
      <Route path="/otr" element={<CandidatePortal />} />
      <Route path="/staff-register" element={<StaffPortal />} />

      <Route path="/admin" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminHome /></Guard>} />
      <Route path="/admin/masters" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminMasters /></Guard>} />
      <Route path="/admin/users" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminUsers /></Guard>} />
      <Route path="/admin/policy" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><AdminPolicy /></Guard>} />
      <Route path="/admin/audit" element={<Guard portal="admin" roles={["SUPER_ADMIN"]}><ReportsPortal /></Guard>} />

      <Route path="/centre" element={<Guard portal="supervisor" roles={["CENTRE_HEAD"]}><CentreHome /></Guard>} />
      <Route path="/centre/staff" element={<Guard portal="supervisor" roles={["CENTRE_HEAD"]}><HeadPortal /></Guard>} />
      <Route path="/centre/presence" element={<Guard portal="supervisor" roles={["CENTRE_HEAD"]}><LiveBoard mode="centre" /></Guard>} />
      <Route path="/centre/alerts" element={<Guard portal="supervisor" roles={["CENTRE_HEAD"]}><LiveBoard mode="alerts" /></Guard>} />

      <Route path="/control-room" element={<Guard portal="client" roles={["CLIENT", "DEPARTMENT_OFFICER"]}><LiveBoard mode="client" /></Guard>} />
      <Route path="/control-room/labs" element={<Guard portal="client" roles={["CLIENT", "DEPARTMENT_OFFICER"]}><LiveBoard mode="client" /></Guard>} />
      <Route path="/control-room/students" element={<Guard portal="client" roles={["CLIENT", "DEPARTMENT_OFFICER"]}><LiveBoard mode="students" /></Guard>} />
      <Route path="/control-room/alerts" element={<Guard portal="client" roles={["CLIENT", "DEPARTMENT_OFFICER"]}><LiveBoard mode="alerts" /></Guard>} />

      <Route path="/candidate" element={<Guard portal="candidate" roles={["CANDIDATE"]}><CandidatePortal /></Guard>} />
      <Route path="/gate" element={<Guard portal="field" roles={["SECURITY_OPERATOR", "CENTRE_OPERATOR"]} extraLinks={[["/gate", "Scan & decide"]]}><GatePortal /></Guard>} />
      <Route path="/classroom" element={<Guard portal="field" roles={["BIOMETRIC_OPERATOR"]} extraLinks={[["/classroom", "Lab presence"]]}><ClassroomPortal /></Guard>} />
    </Routes>
  );
}
