import { Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar";
import Dashboard from "./pages/Dashboard";
import SettingsLayout from "./components/layout/SettingsLayout";
import Connections from "./pages/settings/Connections";
import Sources from "./pages/settings/Sources";
import ReferenceLayout from "./components/layout/ReferenceLayout";
import PullRequests from "./pages/reference/PullRequests";
import Tickets from "./pages/reference/Tickets";
import Documents from "./pages/reference/Documents";

export default function App() {
  return (
    <>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="connections" replace />} />
            <Route path="connections" element={<Connections />} />
            <Route path="sources" element={<Sources />} />
          </Route>
          <Route path="/reference" element={<ReferenceLayout />}>
            <Route index element={<Navigate to="pull-requests" replace />} />
            <Route path="pull-requests" element={<PullRequests />} />
            <Route path="tickets" element={<Tickets />} />
            <Route path="documents" element={<Documents />} />
          </Route>
        </Routes>
      </div>
    </>
  );
}
