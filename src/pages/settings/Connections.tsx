import { useState, useEffect, useCallback } from "react";
import { Github, Cloud, Eye, EyeOff, RefreshCw, CheckCircle2, XCircle, ListTree } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { invoke } from "@/lib/api";

interface ConnectionRecord {
  id: string;
  token?: string;
  email?: string;
  org?: string;
  connected: boolean;
  updatedAt: string;
}

type IntegrationSettings = {
  code: "github";
  work: "jira" | "linear";
  docs: "confluence";
};

const WORK_OPTIONS: { value: IntegrationSettings["work"]; label: string }[] = [
  { value: "jira", label: "Jira (Atlassian)" },
  { value: "linear", label: "Linear" },
];

export default function ConnectionsPage() {
  const [integration, setIntegration] = useState<IntegrationSettings | null>(null);
  const [github, setGithub] = useState<ConnectionRecord | null>(null);
  const [atlassian, setAtlassian] = useState<ConnectionRecord | null>(null);
  const [linear, setLinear] = useState<ConnectionRecord | null>(null);
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

  const [linToken, setLinToken] = useState("");
  const [linWorkspace, setLinWorkspace] = useState("");
  const [linSaving, setLinSaving] = useState(false);
  const [linMsg, setLinMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [intMsg, setIntMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [conns, integ] = await Promise.all([
        invoke<ConnectionRecord[]>("connections:list"),
        invoke<IntegrationSettings>("integrations:get"),
      ]);
      setIntegration(integ);
      setGithub(conns.find((c) => c.id === "github") ?? null);
      setAtlassian(conns.find((c) => c.id === "atlassian") ?? null);
      setLinear(conns.find((c) => c.id === "linear") ?? null);

      const gh = conns.find((c) => c.id === "github");
      if (gh) {
        setGhOrg(gh.org ?? "");
        setGhToken(gh.token ?? "");
      }
      const at = conns.find((c) => c.id === "atlassian");
      if (at) {
        setAtEmail(at.email ?? "");
        setAtToken(at.token ?? "");
        setAtSite(at.org ?? "");
      }
      const ln = conns.find((c) => c.id === "linear");
      if (ln) {
        setLinToken(ln.token ?? "");
        setLinWorkspace(ln.org ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setWorkProvider(next: IntegrationSettings["work"]) {
    setIntMsg(null);
    try {
      const updated = await invoke<IntegrationSettings>("integrations:set-provider", {
        category: "work",
        providerId: next,
      });
      setIntegration(updated);
      setIntMsg({ ok: true, text: "Work tracking provider updated." });
    } catch (err) {
      setIntMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to update" });
    }
  }

  async function saveGithub() {
    setGhSaving(true);
    setGhMsg(null);
    try {
      const updated = await invoke<ConnectionRecord>("connections:upsert", {
        id: "github",
        token: ghToken,
        org: ghOrg,
        connected: !!ghToken,
      });
      setGithub(updated);
      setGhMsg({ ok: true, text: "GitHub connection saved." });
    } catch (err) {
      setGhMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setGhSaving(false);
    }
  }

  async function disconnectGithub() {
    try {
      await invoke("connections:delete", { id: "github" });
    } catch {
      /* ignore */
    }
    setGithub(null);
    setGhToken("");
    setGhOrg("");
  }

  async function saveAtlassian() {
    setAtSaving(true);
    setAtMsg(null);
    try {
      const updated = await invoke<ConnectionRecord>("connections:upsert", {
        id: "atlassian",
        token: atToken,
        email: atEmail,
        org: atSite,
        connected: !!(atToken && atEmail && atSite),
      });
      setAtlassian(updated);
      setAtMsg({ ok: true, text: "Atlassian connection saved." });
    } catch (err) {
      setAtMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setAtSaving(false);
    }
  }

  async function disconnectAtlassian() {
    try {
      await invoke("connections:delete", { id: "atlassian" });
    } catch {
      /* ignore */
    }
    setAtlassian(null);
    setAtEmail("");
    setAtToken("");
    setAtSite("");
  }

  async function saveLinear() {
    setLinSaving(true);
    setLinMsg(null);
    try {
      const updated = await invoke<ConnectionRecord>("connections:upsert", {
        id: "linear",
        token: linToken,
        org: linWorkspace,
        connected: !!linToken,
      });
      setLinear(updated);
      setLinMsg({ ok: true, text: "Linear connection saved." });
    } catch (err) {
      setLinMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setLinSaving(false);
    }
  }

  async function disconnectLinear() {
    try {
      await invoke("connections:delete", { id: "linear" });
    } catch {
      /* ignore */
    }
    setLinear(null);
    setLinToken("");
    setLinWorkspace("");
  }

  const needsAtlassian =
    integration && (integration.work === "jira" || integration.docs === "confluence");
  const showLinear = integration?.work === "linear";

  return (
    <div className="p-6">
      {loading ? (
        <div className="text-sm text-[var(--on-surface-variant)]">Loading...</div>
      ) : (
        <div className="max-w-2xl flex flex-col gap-5">
          {/* Category overview */}
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <ListTree size={18} className="text-[var(--on-surface)]" />
              <h3 className="text-base font-semibold text-[var(--on-surface)]">Integrations by area</h3>
            </div>
            <p className="text-xs font-label text-[var(--on-surface-variant)] mb-4">
              Choose which product backs code, work tracking, and documentation. Credentials for each system are below.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-md bg-[var(--surface-container-high)] px-3 py-2">
                <div className="font-label uppercase tracking-wider text-[var(--on-surface-variant)] mb-1">Code</div>
                <div className="text-[var(--on-surface)] font-semibold">GitHub</div>
              </div>
              <div className="rounded-md bg-[var(--surface-container-high)] px-3 py-2">
                <div className="font-label uppercase tracking-wider text-[var(--on-surface-variant)] mb-1">Work</div>
                <select
                  className="mt-1 w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  value={integration?.work ?? "jira"}
                  onChange={(e) => setWorkProvider(e.target.value as IntegrationSettings["work"])}
                >
                  {WORK_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-md bg-[var(--surface-container-high)] px-3 py-2">
                <div className="font-label uppercase tracking-wider text-[var(--on-surface-variant)] mb-1">Documentation</div>
                <div className="text-[var(--on-surface)] font-semibold">Confluence</div>
              </div>
            </div>
            {intMsg && (
              <p
                className={`text-xs mt-3 px-3 py-2 rounded-md ${
                  intMsg.ok ? "text-emerald-400 bg-emerald-400/10" : "text-[var(--error)] bg-[var(--error)]/10"
                }`}
              >
                {intMsg.text}
              </p>
            )}
          </Card>

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
            <p className="text-xs font-label text-[var(--on-surface-variant)] mb-5">Code · repositories &amp; pull requests</p>

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
                    type="button"
                    onClick={() => setShowGhToken((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
                  >
                    {showGhToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-xs font-label text-[var(--on-surface-variant)] mt-2">
                  Scopes:{" "}
                  <code className="text-[var(--primary)] bg-[var(--surface-container-highest)] px-1 py-0.5 rounded text-[11px]">repo</code>
                  ,{" "}
                  <code className="text-[var(--primary)] bg-[var(--surface-container-highest)] px-1 py-0.5 rounded text-[11px]">read:user</code>
                  . Token is encrypted locally.
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
              <p
                className={`text-xs mb-3 px-3 py-2 rounded-md ${
                  ghMsg.ok ? "text-emerald-400 bg-emerald-400/10" : "text-[var(--error)] bg-[var(--error)]/10"
                }`}
              >
                {ghMsg.text}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveGithub}
                disabled={ghSaving}
                className="px-4 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {ghSaving ? "Saving..." : "Save Connection"}
              </button>
              {github?.connected && (
                <button
                  type="button"
                  onClick={disconnectGithub}
                  className="px-4 py-2 bg-[var(--surface-container-high)] text-[var(--error)] text-sm font-semibold rounded-md hover:bg-[var(--surface-container-highest)] transition-colors"
                >
                  Disconnect
                </button>
              )}
            </div>
          </Card>

          {/* Linear */}
          {showLinear && (
            <Card>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <ListTree size={18} className="text-[var(--on-surface)]" />
                  <h3 className="text-base font-semibold text-[var(--on-surface)]">Linear</h3>
                </div>
                {linear?.connected ? <Badge variant="success">Connected</Badge> : <Badge variant="neutral">Not Connected</Badge>}
              </div>
              <p className="text-xs font-label text-[var(--on-surface-variant)] mb-5">Work tracking · API key</p>

              <div className="flex flex-col gap-3 mb-4">
                <div>
                  <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
                    Workspace slug
                  </label>
                  <input
                    type="text"
                    value={linWorkspace}
                    onChange={(e) => setLinWorkspace(e.target.value)}
                    placeholder="acme-corp"
                    className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]"
                  />
                  <p className="text-xs font-label text-[var(--on-surface-variant)] mt-1">
                    Used for issue links (<span className="font-mono">linear.app/&lt;slug&gt;/issue/…</span>).
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
                    API key
                  </label>
                  <input
                    type="password"
                    value={linToken}
                    onChange={(e) => setLinToken(e.target.value)}
                    placeholder="lin_api_…"
                    className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)] font-mono"
                  />
                </div>
              </div>

              {linear?.updatedAt && (
                <div className="flex items-center gap-2 text-xs font-label text-[var(--on-surface-variant)] mb-4">
                  <RefreshCw size={12} className="text-emerald-400" />
                  Last updated: {new Date(linear.updatedAt).toLocaleString()}
                </div>
              )}

              {linMsg && (
                <p
                  className={`text-xs mb-3 px-3 py-2 rounded-md ${
                    linMsg.ok ? "text-emerald-400 bg-emerald-400/10" : "text-[var(--error)] bg-[var(--error)]/10"
                  }`}
                >
                  {linMsg.text}
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={saveLinear}
                  disabled={linSaving}
                  className="px-4 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {linSaving ? "Saving..." : "Save Linear"}
                </button>
                {linear?.connected && (
                  <button
                    type="button"
                    onClick={disconnectLinear}
                    className="px-4 py-2 bg-[var(--surface-container-high)] text-[var(--error)] text-sm font-semibold rounded-md hover:bg-[var(--surface-container-highest)] transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </Card>
          )}

          {/* Atlassian */}
          {needsAtlassian && (
            <Card>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Cloud size={18} className="text-[var(--on-surface)]" />
                  <h3 className="text-base font-semibold text-[var(--on-surface)]">Atlassian Cloud</h3>
                </div>
                {atlassian?.connected ? <Badge variant="success">Connected</Badge> : <Badge variant="neutral">Not Connected</Badge>}
              </div>
              <p className="text-xs font-label text-[var(--on-surface-variant)] mb-5">
                {integration?.work === "jira" && integration?.docs === "confluence"
                  ? "Jira & Confluence"
                  : integration?.work === "jira"
                    ? "Jira"
                    : "Confluence"}
              </p>

              <div className="flex flex-col gap-3 mb-4">
                <div>
                  <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
                    Site name
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
                    placeholder="you@company.com"
                    className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
                    API token
                  </label>
                  <input
                    type="password"
                    value={atToken}
                    onChange={(e) => setAtToken(e.target.value)}
                    placeholder="Atlassian API token"
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
                <p
                  className={`text-xs mb-3 px-3 py-2 rounded-md ${
                    atMsg.ok ? "text-emerald-400 bg-emerald-400/10" : "text-[var(--error)] bg-[var(--error)]/10"
                  }`}
                >
                  {atMsg.text}
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={saveAtlassian}
                  disabled={atSaving}
                  className="px-4 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {atSaving ? "Saving..." : "Save Atlassian"}
                </button>
                {atlassian?.connected && (
                  <button
                    type="button"
                    onClick={disconnectAtlassian}
                    className="px-4 py-2 bg-[var(--surface-container-high)] text-[var(--error)] text-sm font-semibold rounded-md hover:bg-[var(--surface-container-highest)] transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
