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
import Development from "./pages/settings/Development";
import NotificationsSettings from "./pages/settings/Notifications";
import Reviews from "./pages/Reviews";
import NotificationsPage from "./pages/notifications/NotificationsPage";
import RemindersPage from "./pages/reminders/RemindersPage";
import MyDayPage from "./pages/MyDay";
import TeamPage from "./pages/Team";
import Onboarding from "./pages/Onboarding";
import { invoke, type ContextMenuAction } from "./lib/api";
import { formatReminderTitle } from "./lib/reminder-context";
import { useSelectedDeveloper } from "./context/SelectedDeveloperContext";
import { CommandPalette } from "./components/CommandPalette";

function MainLayoutInner() {
  const { selectedDevId } = useSelectedDeveloper();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const cleanup = window.electron.onOpenCommandPalette(() => {
      setPaletteOpen((o) => !o);
    });
    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = window.electron.onContextMenuAction((payload: ContextMenuAction) => {
      if (payload.action === "remind-me" && payload.remindAt) {
        invoke("reminders:create", {
          notificationId: payload.context.notificationId ?? null,
          title: formatReminderTitle(payload.context.itemType, payload.context.title),
          comment: "",
          sourceUrl: payload.context.url || null,
          remindAt: payload.remindAt,
        }).catch((err) => {
          console.error("Failed to create reminder:", err);
        });
      }
    });
    return cleanup;
  }, []);

  return (
    <div className="flex h-full w-full min-h-0 flex-1">
      <Sidebar onOpenCommandPalette={() => setPaletteOpen(true)} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-12">
        <Outlet />
        <StatusBar />
      </div>
      <CommandPalette
        developerId={selectedDevId || null}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
    </div>
  );
}

function MainLayout() {
  return (
    <SelectedDeveloperProvider>
      <MainLayoutInner />
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
        <Route path="/my-day" element={<MyDayPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/reminders" element={<RemindersPage />} />
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="connections" replace />} />
          <Route path="connections" element={<Connections />} />
          <Route path="notifications" element={<NotificationsSettings />} />
          <Route path="sources" element={<Sources />} />
          <Route path="cache" element={<Cache />} />
          <Route path="general" element={<General />} />
          <Route path="development" element={<Development />} />
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
