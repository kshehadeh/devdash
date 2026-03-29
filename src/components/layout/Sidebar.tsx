"use client";

import { Link, useLocation } from "react-router-dom";
import { Bell, ClipboardCheck, LayoutDashboard, AlarmClock, Sun, Users } from "lucide-react";
import { clsx } from "clsx";
import { useEffect, useState, useCallback } from "react";
import appIcon from "@/assets/icon-white.png";
import { invoke } from "@/lib/api";
import type { ReminderCountResponse } from "@/lib/types";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/my-day", icon: Sun, label: "My Day" },
  { href: "/team", icon: Users, label: "Team" },
  { href: "/reviews", icon: ClipboardCheck, label: "Reviews" },
  { href: "/notifications", icon: Bell, label: "Notifications" },
  { href: "/reminders", icon: AlarmClock, label: "Reminders", badge: true },
];

export function Sidebar() {
  const { pathname } = useLocation();
  const [triggeredCount, setTriggeredCount] = useState(0);
  const isMac = typeof window !== "undefined" && window.electron.platform === "darwin";

  const loadCount = useCallback(async () => {
    try {
      const res = await invoke<ReminderCountResponse>("reminders:triggered-count");
      setTriggeredCount(res.count);
    } catch {
      setTriggeredCount(0);
    }
  }, []);

  useEffect(() => {
    void loadCount();
  }, [loadCount]);

  useEffect(() => {
    const unsub = window.electron.onRemindersChanged(() => {
      void loadCount();
    });
    return unsub;
  }, [loadCount]);

  return (
    <aside
      className={clsx(
        "flex flex-col w-16 shrink-0 bg-[var(--surface-container-low)] h-full items-center gap-1",
        // Room for traffic lights above the logo (native controls sit in this top band)
        isMac ? "pt-[58px] pb-4" : "py-4",
      )}
    >
      <div className="mb-2 flex items-center justify-center w-9 h-9">
        <img src={appIcon} alt="DevDash" className="w-full h-full object-contain" />
      </div>

      <nav className="flex flex-col gap-1 flex-1 w-full px-2">
        {navItems.map(({ href, icon: Icon, label, badge }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
          const showBadge = badge && triggeredCount > 0;
          return (
            <Link
              key={href}
              to={href}
              title={label}
              className={clsx(
                "relative flex items-center justify-center w-full h-10 rounded-md transition-colors",
                isActive
                  ? "bg-[var(--surface-container-highest)] text-[var(--primary)]"
                  : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)] hover:text-[var(--on-surface)]",
              )}
            >
              <Icon size={18} />
              {showBadge && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-[var(--error)] text-white text-[9px] font-bold leading-4 text-center">
                  {triggeredCount > 9 ? "9+" : triggeredCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
