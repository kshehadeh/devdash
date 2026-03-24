import { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, Outlet } from "react-router-dom";
import { AppStatusProvider } from "./context/AppStatusContext";
import { UpdateProvider } from "./context/UpdateContext";
import { SelectedDeveloperProvider } from "./context/SelectedDeveloperContext";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import Dashboard from "./pages/Dashboard";
import SettingsLayout from "./components/layout/SettingsLayout";
import Connections from "./pages/settings/Connections";
import Sources from "./pages/settings/Sources";
import Cache from "./pages/settings/Cache";
import General from "./pages/settings/General";
import NotificationsSettings from "./pages/settings/Notifications";
import ReferenceLayout from "./components/layout/ReferenceLayout";
import PullRequests from "./pages/reference/PullRequests";
import Tickets from "./pages/reference/Tickets";
import Documents from "./pages/reference/Documents";
import Reviews from "./pages/Reviews";
import NotificationsPage from "./pages/notifications/NotificationsPage";
import Onboarding from "./pages/Onboarding";
import { invoke } from "./lib/api";

function MainLayout() {
  return (
    <SelectedDeveloperProvider>
      <div className="flex h-full w-full min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-12">
          <Outlet />
          <StatusBar />
        </div>
      </div>
    </SelectedDeveloperProvider>
  );
}

function RoutedApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    window.electron.onMenuNavigate((path) => navigate(path));
  }, [navigate]);

  useEffect(() => {
    invoke<string | null>("app-config:get", { key: "onboarding_completed" })
      .then((v) => setOnboardingDone(v === "1"))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = location.pathname;
    if (prev === "/onboarding" && location.pathname !== "/onboarding") {
      invoke<string | null>("app-config:get", { key: "onboarding_completed" }).then((v) =>
        setOnboardingDone(v === "1"),
      );
    }
  }, [location.pathname]);

  if (!ready) {
    return (
      <div className="flex h-full w-full flex-1 items-center justify-center bg-[var(--surface)]">
        <span className="text-sm text-[var(--on-surface-variant)]">Loading...</span>
      </div>
    );
  }

  if (!onboardingDone && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  if (onboardingDone && location.pathname === "/onboarding") {
    return <Navigate to="/" replace />;
  }

  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route element={<MainLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="connections" replace />} />
          <Route path="connections" element={<Connections />} />
          <Route path="notifications" element={<NotificationsSettings />} />
          <Route path="sources" element={<Sources />} />
          <Route path="cache" element={<Cache />} />
          <Route path="general" element={<General />} />
        </Route>
        <Route path="/reference" element={<ReferenceLayout />}>
          <Route index element={<Navigate to="pull-requests" replace />} />
          <Route path="pull-requests" element={<PullRequests />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="documents" element={<Documents />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AppStatusProvider>
      <UpdateProvider>
        {/* flex-col so route output (e.g. onboarding) stretches full width; row was shrinking to content width */}
        <div className="flex h-full min-h-0 w-full flex-1 flex-col">
          <RoutedApp />
        </div>
      </UpdateProvider>
    </AppStatusProvider>
  );
}
