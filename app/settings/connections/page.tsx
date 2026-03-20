"use client";

import { useState, useEffect } from "react";
import { Github, Cloud, Eye, EyeOff, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";

interface ConnectionRecord {
  id: string;
  token?: string;
  email?: string;
  org?: string;
  connected: boolean;
  updatedAt: string;
}

export default function ConnectionsPage() {
  const [github, setGithub] = useState<ConnectionRecord | null>(null);
  const [atlassian, setAtlassian] = useState<ConnectionRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const [showGhToken, setShowGhToken] = useState(false);
  const [ghToken, setGhToken] = useState("");
  const [ghOrg, setGhOrg] = useState("");
  const [ghSaving, setGhSaving] = useState(false);
  const [ghMsg, setGhMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [atEmail, setAtEmail] = useState("");
  const [atToken, setAtToken] = useState("");
  const [atSite, setAtSite] = useState("");
  const [atSaving, setAtSaving] = useState(false);
  const [atMsg, setAtMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/connections");
        const data: ConnectionRecord[] = await res.json();
        const gh = data.find((c) => c.id === "github") ?? null;
        const at = data.find((c) => c.id === "atlassian") ?? null;
        setGithub(gh);
        setAtlassian(at);
        if (gh) {
          setGhOrg(gh.org ?? "");
          setGhToken(gh.token ?? "");
        }
        if (at) {
          setAtEmail(at.email ?? "");
          setAtToken(at.token ?? "");
          setAtSite(at.org ?? "");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function saveGithub() {
    setGhSaving(true);
    setGhMsg(null);
    try {
      const res = await fetch("/api/connections/github", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ghToken, org: ghOrg, connected: !!ghToken }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated: ConnectionRecord = await res.json();
      setGithub(updated);
      setGhMsg({ ok: true, text: "GitHub connection saved." });
    } catch (err) {
      setGhMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setGhSaving(false);
    }
  }

  async function disconnectGithub() {
    await fetch("/api/connections/github", { method: "DELETE" });
    setGithub(null);
    setGhToken("");
    setGhOrg("");
  }

  async function saveAtlassian() {
    setAtSaving(true);
    setAtMsg(null);
    try {
      const res = await fetch("/api/connections/atlassian", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: atToken, email: atEmail, org: atSite, connected: !!(atToken && atEmail && atSite) }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated: ConnectionRecord = await res.json();
      setAtlassian(updated);
      setAtMsg({ ok: true, text: "Atlassian connection saved." });
    } catch (err) {
      setAtMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setAtSaving(false);
    }
  }

  async function disconnectAtlassian() {
    await fetch("/api/connections/atlassian", { method: "DELETE" });
    setAtlassian(null);
    setAtEmail("");
    setAtToken("");
    setAtSite("");
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="flex items-center px-6 h-14 bg-[var(--surface-container-low)] shrink-0">
        <h1 className="text-sm font-semibold text-[var(--on-surface-variant)] font-label tracking-widest uppercase">
          Connected Systems
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto p-6 bg-[var(--surface)]">
        {loading ? (
          <div className="text-sm text-[var(--on-surface-variant)]">Loading...</div>
        ) : (
          <div className="max-w-2xl flex flex-col gap-5">
            {/* GitHub */}
            <Card>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Github size={18} className="text-[var(--on-surface)]" />
                  <h3 className="text-base font-semibold text-[var(--on-surface)]">GitHub</h3>
                </div>
                {github?.connected ? (
                  <div className="flex items-center gap-1.5 text-xs font-label text-emerald-400">
                    <CheckCircle2 size={14} />
                    Connected
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs font-label text-[var(--on-surface-variant)]">
                    <XCircle size={14} />
                    Not Connected
                  </div>
                )}
              </div>
              <p className="text-xs font-label text-[var(--on-surface-variant)] mb-5">
                Source Control & CI/CD
              </p>

              <div className="flex flex-col gap-3 mb-4">
                <div>
                  <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
                    Personal Access Token
                  </label>
                  <div className="relative">
                    <input
                      type={showGhToken ? "text" : "password"}
                      value={ghToken}
                      onChange={(e) => setGhToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2.5 pr-10 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)] font-mono"
                    />
                    <button
                      onClick={() => setShowGhToken((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
                    >
                      {showGhToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-xs font-label text-[var(--on-surface-variant)] mt-2">
                    Scopes required:{" "}
                    <code className="text-[var(--primary)] bg-[var(--surface-container-highest)] px-1 py-0.5 rounded text-[11px]">repo</code>
                    ,{" "}
                    <code className="text-[var(--primary)] bg-[var(--surface-container-highest)] px-1 py-0.5 rounded text-[11px]">read:user</code>
                    . Token is encrypted via AES-256-GCM.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
                    Organization
                  </label>
                  <input
                    type="text"
                    value={ghOrg}
                    onChange={(e) => setGhOrg(e.target.value)}
                    placeholder="atelier-labs"
                    className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]"
                  />
                </div>
              </div>

              {github?.updatedAt && (
                <div className="flex items-center gap-2 text-xs font-label text-[var(--on-surface-variant)] mb-4">
                  <RefreshCw size={12} className="text-emerald-400" />
                  Last updated: {new Date(github.updatedAt).toLocaleString()}
                </div>
              )}

              {ghMsg && (
                <p className={`text-xs mb-3 px-3 py-2 rounded-md ${ghMsg.ok ? "text-emerald-400 bg-emerald-400/10" : "text-[var(--error)] bg-[var(--error)]/10"}`}>
                  {ghMsg.text}
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={saveGithub}
                  disabled={ghSaving}
                  className="px-4 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {ghSaving ? "Saving..." : "Save Connection"}
                </button>
                {github?.connected && (
                  <button
                    onClick={disconnectGithub}
                    className="px-4 py-2 bg-[var(--surface-container-high)] text-[var(--error)] text-sm font-semibold rounded-md hover:bg-[var(--surface-container-highest)] transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </Card>

            {/* Atlassian */}
            <Card>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Cloud size={18} className="text-[var(--on-surface)]" />
                  <h3 className="text-base font-semibold text-[var(--on-surface)]">Atlassian Systems</h3>
                </div>
                {atlassian?.connected ? (
                  <Badge variant="success">Connected</Badge>
                ) : (
                  <Badge variant="neutral">Not Connected</Badge>
                )}
              </div>
              <p className="text-xs font-label text-[var(--on-surface-variant)] mb-5">
                Jira & Confluence Integration
              </p>

              <div className="flex flex-col gap-3 mb-4">
                <div>
                  <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
                    Site Name
                  </label>
                  <div className="flex items-center gap-0">
                    <input
                      type="text"
                      value={atSite}
                      onChange={(e) => setAtSite(e.target.value)}
                      placeholder="mycompany"
                      className="flex-1 bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-l-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]"
                    />
                    <span className="bg-[var(--surface-container-high)] text-[var(--on-surface-variant)] text-sm px-3 py-2.5 rounded-r-md border-l border-[var(--outline-variant)]/20">
                      .atlassian.net
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
                    Email / Username
                  </label>
                  <input
                    type="email"
                    value={atEmail}
                    onChange={(e) => setAtEmail(e.target.value)}
                    placeholder="you@underarmour.com"
                    className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
                    API Token
                  </label>
                  <input
                    type="password"
                    value={atToken}
                    onChange={(e) => setAtToken(e.target.value)}
                    placeholder="Your Atlassian API token"
                    className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)] font-mono"
                  />
                </div>
              </div>

              {atlassian?.updatedAt && (
                <div className="flex items-center gap-2 text-xs font-label text-[var(--on-surface-variant)] mb-4">
                  <RefreshCw size={12} className="text-emerald-400" />
                  Last updated: {new Date(atlassian.updatedAt).toLocaleString()}
                </div>
              )}

              {atMsg && (
                <p className={`text-xs mb-3 px-3 py-2 rounded-md ${atMsg.ok ? "text-emerald-400 bg-emerald-400/10" : "text-[var(--error)] bg-[var(--error)]/10"}`}>
                  {atMsg.text}
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={saveAtlassian}
                  disabled={atSaving}
                  className="px-4 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {atSaving ? "Saving..." : "Update API"}
                </button>
                {atlassian?.connected && (
                  <button
                    onClick={disconnectAtlassian}
                    className="px-4 py-2 bg-[var(--surface-container-high)] text-[var(--error)] text-sm font-semibold rounded-md hover:bg-[var(--surface-container-highest)] transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
