import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AppStatusProvider } from "./context/AppStatusContext";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import Dashboard from "./pages/Dashboard";
import SettingsLayout from "./components/layout/SettingsLayout";
import Connections from "./pages/settings/Connections";
import Sources from "./pages/settings/Sources";
import ReferenceLayout from "./components/layout/ReferenceLayout";
import PullRequests from "./pages/reference/PullRequests";
import Tickets from "./pages/reference/Tickets";
import Documents from "./pages/reference/Documents";
import Reviews from "./pages/Reviews";

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    window.electron.onMenuNavigate((path) => navigate(path));
  }, [navigate]);

  return (
    <AppStatusProvider>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden pb-12">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/reviews" element={<Reviews />} />
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
        <StatusBar />
      </div>
    </AppStatusProvider>
  );
}
