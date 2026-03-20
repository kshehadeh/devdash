import Link from "next/link";
import { Terminal, Database } from "lucide-react";
import { Card } from "../components/ui/Card";

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="flex items-center px-6 h-14 bg-[var(--surface-container-low)] shrink-0">
        <h1 className="text-sm font-semibold text-[var(--on-surface-variant)] font-label tracking-widest uppercase">
          Settings
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto p-6 bg-[var(--surface)]">
        <div className="max-w-2xl flex flex-col gap-3">
          <Link href="/settings/connections">
            <Card className="flex items-center gap-4 hover:bg-[var(--surface-container-high)] transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-md bg-[var(--surface-container-highest)] flex items-center justify-center">
                <Terminal size={18} className="text-[var(--primary)]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[var(--on-surface)]">
                  Connected Systems
                </div>
                <div className="text-xs font-label text-[var(--on-surface-variant)]">
                  Manage GitHub and Atlassian API credentials
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/settings/sources">
            <Card className="flex items-center gap-4 hover:bg-[var(--surface-container-high)] transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-md bg-[var(--surface-container-highest)] flex items-center justify-center">
                <Database size={18} className="text-[var(--primary)]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[var(--on-surface)]">Data Sources</div>
                <div className="text-xs font-label text-[var(--on-surface-variant)]">
                  Configure repositories, Jira boards, and Confluence spaces
                </div>
              </div>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  );
}
