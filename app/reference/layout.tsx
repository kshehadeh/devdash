"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitMerge, Ticket, BookOpen } from "lucide-react";
import { clsx } from "clsx";

const referenceNav = [
  { href: "/reference/pull-requests", icon: GitMerge, label: "Pull Requests", description: "Cached PR data" },
  { href: "/reference/tickets", icon: Ticket, label: "Tickets", description: "Completed issues" },
  { href: "/reference/documents", icon: BookOpen, label: "Documents", description: "Confluence pages" },
];

export default function ReferenceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="flex items-center px-6 h-14 bg-[var(--surface-container-low)] shrink-0">
        <h1 className="text-sm font-semibold text-[var(--on-surface-variant)] font-label tracking-widest uppercase">
          Reference
        </h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-56 shrink-0 bg-[var(--surface-container-low)] border-r border-[var(--outline-variant)]/20 py-3 flex flex-col gap-0.5 overflow-y-auto">
          {referenceNav.map(({ href, icon: Icon, label, description }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
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

        <div className="flex-1 overflow-y-auto bg-[var(--surface)] p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
