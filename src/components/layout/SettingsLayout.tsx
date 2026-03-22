import { Link, useLocation, Outlet } from "react-router-dom";
import { Terminal, Database, HardDrive } from "lucide-react";
import { clsx } from "clsx";

const settingsNav = [
  { href: "/settings/connections", icon: Terminal, label: "Connected Systems", description: "API credentials" },
  { href: "/settings/sources", icon: Database, label: "Data Sources", description: "Repos, projects & spaces" },
  { href: "/settings/cache", icon: HardDrive, label: "Local cache", description: "Size & reset sync data" },
];

export default function SettingsLayout() {
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="flex items-center px-6 h-14 bg-[var(--surface-container-low)] shrink-0">
        <h1 className="text-sm font-semibold text-[var(--on-surface-variant)] font-label tracking-widest uppercase">
          Settings
        </h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Settings sidebar */}
        <nav className="w-56 shrink-0 bg-[var(--surface-container-low)] border-r border-[var(--outline-variant)]/20 py-3 flex flex-col gap-0.5 overflow-y-auto">
          {settingsNav.map(({ href, icon: Icon, label, description }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                to={href}
                className={clsx(
                  "flex items-center gap-3 mx-2 px-3 py-2.5 rounded-md transition-colors",
                  isActive
                    ? "bg-[var(--surface-container-highest)] text-[var(--primary)]"
                    : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)] hover:text-[var(--on-surface)]"
                )}
              >
                <Icon size={15} className="shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold font-label truncate">{label}</div>
                  <div className={clsx("text-[10px] font-label truncate", isActive ? "text-[var(--primary)]/70" : "text-[var(--on-surface-variant)]/60")}>
                    {description}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-[var(--surface)]">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
