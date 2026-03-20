"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Database, Terminal } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/settings/connections", icon: Terminal, label: "Connections" },
  { href: "/settings/sources", icon: Database, label: "Data Sources" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-16 shrink-0 bg-[var(--surface-container-low)] h-full py-4 items-center gap-1">
      <div className="mb-4 flex items-center justify-center w-9 h-9 rounded-md bg-gradient-to-br from-[var(--primary)] to-[var(--primary-container)]">
        <span className="text-[var(--on-primary)] font-bold text-xs font-label tracking-tighter">
          DD
        </span>
      </div>

      <nav className="flex flex-col gap-1 flex-1 w-full px-2">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={clsx(
                "flex items-center justify-center w-full h-10 rounded-md transition-colors",
                isActive
                  ? "bg-[var(--surface-container-highest)] text-[var(--primary)]"
                  : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)] hover:text-[var(--on-surface)]"
              )}
            >
              <Icon size={18} />
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
