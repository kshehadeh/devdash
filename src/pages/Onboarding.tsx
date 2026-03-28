import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Github,
  Cloud,
  Eye,
  EyeOff,
  ListTree,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ExternalLink,
  Kanban,
  BookOpen,
  Plus,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SourceFormDialog, type SourceFormMode } from "@/components/settings/SourceFormDialog";
import { invoke } from "@/lib/api";
import type { DataSource, DataSourceType, Developer, JiraBoardRef } from "@/lib/types";

type IntegrationSettings = {
  code: "github";
  work: "jira" | "linear";
  docs: "confluence";
};

interface ConnectionRecord {
  id: string;
  token?: string;
  email?: string;
  org?: string;
  connected: boolean;
  updatedAt: string;
}

const WORK_OPTIONS: { value: IntegrationSettings["work"]; label: string }[] = [
  { value: "jira", label: "Jira (Atlassian)" },
  { value: "linear", label: "Linear" },
];

const TYPE_META: Record<DataSourceType, { icon: typeof Github; label: string; color: string }> = {
  github_repo: { icon: Github, label: "GitHub Repositories", color: "var(--primary)" },
  jira_project: { icon: Kanban, label: "Jira Projects", color: "var(--secondary)" },
  confluence_space: { icon: BookOpen, label: "Confluence Spaces", color: "var(--tertiary)" },
  linear_team: { icon: ListTree, label: "Linear Teams", color: "var(--secondary)" },
};

function activeSourceTypes(integration: IntegrationSettings | null): DataSourceType[] {
  if (!integration) return ["github_repo", "jira_project", "confluence_space"];
  const t: DataSourceType[] = [];
  if (integration.code === "github") t.push("github_repo");
  if (integration.work === "jira") t.push("jira_project");
  if (integration.work === "linear") t.push("linear_team");
  if (integration.docs === "confluence") t.push("confluence_space");
  return t;
}

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-label text-[var(--primary)] hover:underline"
      onClick={() => window.open(href, "_blank")}
    >
      <ExternalLink size={12} />
      {children}
    </button>
  );
}

const STEPS = ["Areas", "Credentials", "Data sources", "Profile"] as const;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [integration, setIntegration] = useState<IntegrationSettings | null>(null);
  const [github, setGithub] = useState<ConnectionRecord | null>(null);
  const [atlassian, setAtlassian] = useState<ConnectionRecord | null>(null);
  const [linear, setLinear] = useState<ConnectionRecord | null>(null);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [formMode, setFormMode] = useState<SourceFormMode | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [showGhToken, setShowGhToken] = useState(false);
  const [ghToken, setGhToken] = useState("");
  const [ghSaving, setGhSaving] = useState(false);

  const [atEmail, setAtEmail] = useState("");
  const [atToken, setAtToken] = useState("");
  const [atSite, setAtSite] = useState("");
  const [atSaving, setAtSaving] = useState(false);

  const [linToken, setLinToken] = useState("");
  const [linWorkspace, setLinWorkspace] = useState("");
  const [linSaving, setLinSaving] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [conns, integ, srcList] = await Promise.all([
        invoke<ConnectionRecord[]>("connections:list"),
        invoke<IntegrationSettings>("integrations:get"),
        invoke<DataSource[]>("sources:list"),
      ]);
      setIntegration(integ);
      setGithub(conns.find((c) => c.id === "github") ?? null);
      setAtlassian(conns.find((c) => c.id === "atlassian") ?? null);
      setLinear(conns.find((c) => c.id === "linear") ?? null);
      if (Array.isArray(srcList)) setSources(srcList);

      const gh = conns.find((c) => c.id === "github");
      if (gh) {
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
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function markCompleteAndGoHome() {
    await invoke("app-config:set", { key: "onboarding_completed", value: "1" });
    navigate("/", { replace: true });
  }

  async function setWorkProvider(next: IntegrationSettings["work"]) {
    const updated = await invoke<IntegrationSettings>("integrations:set-provider", {
      category: "work",
      providerId: next,
    });
    setIntegration(updated);
  }

  async function saveGithub() {
    setGhSaving(true);
    try {
      const updated = await invoke<ConnectionRecord>("connections:upsert", {
        id: "github",
        token: ghToken,
        org: "",
        connected: !!ghToken,
      });
      setGithub(updated);
    } finally {
      setGhSaving(false);
    }
  }

  async function saveAtlassian() {
    setAtSaving(true);
    try {
      const updated = await invoke<ConnectionRecord>("connections:upsert", {
        id: "atlassian",
        token: atToken,
        email: atEmail,
        org: atSite,
        connected: !!(atToken && atEmail && atSite),
      });
      setAtlassian(updated);
    } finally {
      setAtSaving(false);
    }
  }

  async function saveLinear() {
    setLinSaving(true);
    try {
      const updated = await invoke<ConnectionRecord>("connections:upsert", {
        id: "linear",
        token: linToken,
        org: linWorkspace,
        connected: !!linToken,
      });
      setLinear(updated);
    } finally {
      setLinSaving(false);
    }
  }

  const needsAtlassian =
    integration && (integration.work === "jira" || integration.docs === "confluence");
  const showLinear = integration?.work === "linear";

  const step2Ready =
    !!github?.connected &&
    (!needsAtlassian || !!atlassian?.connected) &&
    (!showLinear || !!linear?.connected);

  const types = activeSourceTypes(integration);
  const grouped: Partial<Record<DataSourceType, DataSource[]>> = {};
  for (const type of types) {
    grouped[type] = sources.filter((s) => s.type === type);
  }

  async function handleDeleteSource(id: string) {
    try {
      await invoke("sources:delete", { id });
      const data = await invoke<DataSource[]>("sources:list");
      if (Array.isArray(data)) setSources(data);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-[var(--surface)]">
      <header className="shrink-0 border-b border-[var(--outline-variant)]/20 px-6 pt-4 pb-3">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-[var(--on-surface)]">Welcome to DevDash</h1>
            <p className="text-xs font-label text-[var(--on-surface-variant)] mt-0.5">
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void markCompleteAndGoHome()}
            className="shrink-0 text-xs font-label text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
          >
            Skip for now
          </button>
        </div>
        <div className="mx-auto mt-3 flex w-full max-w-2xl gap-2">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-[var(--primary)]" : "bg-[var(--surface-container-high)]"}`}
              title={label}
            />
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center overflow-hidden px-6 py-8">
        <div className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-6 overflow-y-auto">

        {loadError && (
          <p className="text-xs text-[var(--error)]">Could not load settings. Check the app data path and try again.</p>
        )}

        {step === 0 && (
          <Card>
            <h2 className="text-base font-semibold text-[var(--on-surface)] mb-2">Code, work, and docs</h2>
            <p className="text-sm text-[var(--on-surface-variant)] mb-5">
              DevDash groups integrations into three areas. Each area uses one product today: GitHub for code, your choice for
              work tracking, and Confluence for documentation. Credentials are stored encrypted on this device.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded-md bg-[var(--surface-container-high)] px-3 py-3">
                <div className="font-label uppercase tracking-wider text-[var(--on-surface-variant)] mb-1">Code</div>
                <div className="text-[var(--on-surface)] font-semibold">GitHub</div>
                <p className="text-[var(--on-surface-variant)] mt-2 leading-relaxed">Repos, pull requests, and contribution metrics.</p>
              </div>
              <div className="rounded-md bg-[var(--surface-container-high)] px-3 py-3">
                <div className="font-label uppercase tracking-wider text-[var(--on-surface-variant)] mb-1">Work</div>
                <select
                  className="mt-1 w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  value={integration?.work ?? "jira"}
                  onChange={(e) => void setWorkProvider(e.target.value as IntegrationSettings["work"])}
                >
                  {WORK_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="text-[var(--on-surface-variant)] mt-2 leading-relaxed">Issues assigned to you (Jira or Linear).</p>
              </div>
              <div className="rounded-md bg-[var(--surface-container-high)] px-3 py-3">
                <div className="font-label uppercase tracking-wider text-[var(--on-surface-variant)] mb-1">Documentation</div>
                <div className="text-[var(--on-surface)] font-semibold">Confluence</div>
                <p className="text-[var(--on-surface-variant)] mt-2 leading-relaxed">Pages and doc activity.</p>
              </div>
            </div>
          </Card>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-[var(--on-surface-variant)]">
              Connect each system you use. Open the vendor settings in your browser to create a token, then paste it here.
            </p>

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
                    Not connected
                  </div>
                )}
              </div>
              <p className="text-xs font-label text-[var(--on-surface-variant)] mb-3">
                Create a personal access token with <code className="text-[var(--primary)]">repo</code> and{" "}
                <code className="text-[var(--primary)]">read:user</code> scopes.
              </p>
              <div className="flex flex-wrap gap-3 mb-4">
                <DocLink href="https://github.com/settings/personal-access-tokens/new">Fine-grained token</DocLink>
                <DocLink href="https://github.com/settings/tokens">Classic token</DocLink>
              </div>
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
                    >
                      {showGhToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <p className="text-xs font-label text-[var(--on-surface-variant)]">
                  Repositories are added in the next step; each one includes its GitHub owner or organization.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveGithub()}
                disabled={ghSaving}
                className="px-4 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {ghSaving ? "Saving…" : "Save GitHub"}
              </button>
            </Card>

            {showLinear && (
              <Card>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <ListTree size={18} />
                    <h3 className="text-base font-semibold text-[var(--on-surface)]">Linear</h3>
                  </div>
                  {linear?.connected ? <Badge variant="success">Connected</Badge> : <Badge variant="neutral">Not connected</Badge>}
                </div>
                <p className="text-xs font-label text-[var(--on-surface-variant)] mb-3">API key from your Linear workspace.</p>
                <div className="mb-3">
                  <DocLink href="https://linear.app/settings/api">Open Linear API settings</DocLink>
                </div>
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
                      className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    />
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
                      className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)] font-mono"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void saveLinear()}
                  disabled={linSaving}
                  className="px-4 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {linSaving ? "Saving…" : "Save Linear"}
                </button>
              </Card>
            )}

            {needsAtlassian && (
              <Card>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Cloud size={18} />
                    <h3 className="text-base font-semibold text-[var(--on-surface)]">Atlassian Cloud</h3>
                  </div>
                  {atlassian?.connected ? <Badge variant="success">Connected</Badge> : <Badge variant="neutral">Not connected</Badge>}
                </div>
                <p className="text-xs font-label text-[var(--on-surface-variant)] mb-3">
                  Use the same API token for Jira and/or Confluence. Create it under your Atlassian account (often labeled for Jira).
                </p>
                <div className="mb-3">
                  <DocLink href="https://id.atlassian.com/manage-profile/security/api-tokens">Create Atlassian API token</DocLink>
                </div>
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
                        className="flex-1 bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-l-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)]"
                      />
                      <span className="bg-[var(--surface-container-high)] text-[var(--on-surface-variant)] text-sm px-3 py-2.5 rounded-r-md border-l border-[var(--outline-variant)]/20">
                        .atlassian.net
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={atEmail}
                      onChange={(e) => setAtEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)]"
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
                      className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)] font-mono"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void saveAtlassian()}
                  disabled={atSaving}
                  className="px-4 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {atSaving ? "Saving…" : "Save Atlassian"}
                </button>
              </Card>
            )}

            {!step2Ready && (
              <p className="text-xs text-amber-400/90 bg-amber-400/10 rounded-md px-3 py-2">
                Save each required connection above before continuing. You can still skip the whole wizard from the header.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-[var(--on-surface-variant)]">
              Add repos, projects, spaces, or teams to scope what DevDash syncs. You can add more later in Settings → Sources.
            </p>
            {sourcesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-[var(--primary)]" size={24} />
              </div>
            ) : (
              types.map((type) => {
                const items = grouped[type] ?? [];
                const meta = TYPE_META[type];
                const Icon = meta.icon;
                return (
                  <Card key={type}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Icon size={16} style={{ color: meta.color }} />
                        <h3 className="text-sm font-semibold text-[var(--on-surface)]">{meta.label}</h3>
                      </div>
                      <Badge variant="neutral">{items.length}</Badge>
                    </div>
                    {items.length === 0 ? (
                      <p className="text-xs text-[var(--on-surface-variant)] mb-4">None yet.</p>
                    ) : (
                      <div className="flex flex-col gap-1 mb-4">
                        {items.map((source) => (
                          <OnboardingSourceRow
                            key={source.id}
                            source={source}
                            onDelete={() => void handleDeleteSource(source.id)}
                          />
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setFormMode({ kind: "add", type })}
                      className="flex items-center gap-2 text-xs font-label font-semibold text-[var(--primary)] uppercase tracking-wider"
                    >
                      <Plus size={14} />
                      Add{" "}
                      {type === "github_repo"
                        ? "Repository"
                        : type === "jira_project"
                          ? "Project"
                          : type === "linear_team"
                            ? "Team"
                            : "Space"}
                    </button>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <Card className="mb-4">
              <h2 className="text-base font-semibold text-[var(--on-surface)] mb-1">Add yourself</h2>
              <p className="text-xs text-[var(--on-surface-variant)]">
                We match metrics using your GitHub username and Atlassian email when those integrations are connected.
              </p>
            </Card>
            <OnboardingDeveloperForm
              onSubmit={async (values) => {
                const dev = await invoke<Developer>("developers:create", values);
                return dev;
              }}
              onSuccess={() => markCompleteAndGoHome()}
              allSources={sources}
            />
          </div>
        )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-[var(--outline-variant)]/20 bg-[var(--surface-container-highest)] px-6 py-4">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => (step === 3 ? setStep(2) : setStep((s) => Math.max(0, s - 1)))}
            className="px-4 py-2 text-sm font-medium text-[var(--on-surface-variant)] rounded-md hover:bg-[var(--surface-container-high)] disabled:opacity-40"
          >
            Back
          </button>
          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 && !step2Ready}
              onClick={() => {
                void (async () => {
                  if (step === 2) await loadAll();
                  setStep((s) => Math.min(STEPS.length - 1, s + 1));
                })();
              }}
              className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 disabled:opacity-50"
            >
              Continue
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="submit"
              form="onboarding-dev-form"
              className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 disabled:opacity-50"
            >
              Finish setup
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </footer>

      {formMode && (
        <SourceFormDialog
          mode={formMode}
          onClose={() => setFormMode(null)}
          onSaved={() => {
            setFormMode(null);
            void loadAll();
          }}
        />
      )}
    </div>
  );
}

function OnboardingDeveloperForm({
  onSubmit,
  onSuccess,
  allSources,
}: {
  onSubmit: (values: { name: string; role: string; team: string; githubUsername: string; atlassianEmail: string }) => Promise<Developer | void>;
  onSuccess: () => void | Promise<void>;
  allSources: DataSource[];
}) {
  const [values, setValues] = useState({
    name: "",
    role: "",
    team: "",
    githubUsername: "",
    atlassianEmail: "",
  });
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof typeof values) {
    return (v: string) => setValues((prev) => ({ ...prev, [field]: v }));
  }

  function toggleSource(id: string) {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await onSubmit(values);
      if (result && typeof result === "object" && "id" in result && assignedIds.size > 0) {
        await invoke("developers:sources:set", {
          id: (result as Developer).id,
          sourceIds: [...assignedIds],
        });
      }
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const SOURCE_ICONS: Record<DataSourceType, typeof Github> = {
    github_repo: Github,
    jira_project: Kanban,
    confluence_space: BookOpen,
    linear_team: ListTree,
  };

  return (
    <form id="onboarding-dev-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
            Full Name<span className="text-[var(--error)] ml-0.5">*</span>
          </label>
          <input
            type="text"
            value={values.name}
            onChange={(e) => set("name")(e.target.value)}
            placeholder="Alex Chen"
            required
            className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]"
          />
        </div>
        <div>
          <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
            Role<span className="text-[var(--error)] ml-0.5">*</span>
          </label>
          <input
            type="text"
            value={values.role}
            onChange={(e) => set("role")(e.target.value)}
            placeholder="Senior Frontend Engineer"
            required
            className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]"
          />
        </div>
        <div>
          <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
            Team<span className="text-[var(--error)] ml-0.5">*</span>
          </label>
          <input
            type="text"
            value={values.team}
            onChange={(e) => set("team")(e.target.value)}
            placeholder="Platform"
            required
            className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]"
          />
        </div>
      </div>

      <div className="border-t border-[var(--outline-variant)]/20 pt-3 mt-1 flex flex-col gap-3">
        <p className="text-xs font-label text-[var(--on-surface-variant)]">
          Optional — used for API integrations
        </p>
        <div>
          <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-1.5">GitHub Username</label>
          <input
            type="text"
            value={values.githubUsername}
            onChange={(e) => set("githubUsername")(e.target.value)}
            placeholder="alexchen"
            className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]"
          />
        </div>
        <div>
          <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-1.5">Atlassian Email</label>
          <input
            type="email"
            value={values.atlassianEmail}
            onChange={(e) => set("atlassianEmail")(e.target.value)}
            placeholder="alex.chen@company.com"
            className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]"
          />
        </div>
      </div>

      {allSources.length > 0 && (
        <div className="border-t border-[var(--outline-variant)]/20 pt-3 mt-1">
          <p className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
            Assigned Data Sources
          </p>
          <div className="flex flex-col gap-1">
            {allSources.map((source) => {
              const Icon = SOURCE_ICONS[source.type];
              const checked = assignedIds.has(source.id);
              return (
                <label
                  key={source.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--surface-container-high)] transition-colors cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSource(source.id)}
                    className="accent-[var(--primary)] w-3.5 h-3.5"
                  />
                  <Icon size={13} className="text-[var(--on-surface-variant)] shrink-0" />
                  <span className="text-sm text-[var(--on-surface)] flex-1 truncate">{source.name}</span>
                  <span className="text-[10px] text-[var(--on-surface-variant)] font-label">
                    {source.type === "github_repo" ? `${source.org}/${source.identifier}` : source.identifier}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-[var(--error)] bg-[var(--error)]/10 rounded-md px-3 py-2">{error}</p>
      )}
    </form>
  );
}

function OnboardingSourceRow({ source, onDelete }: { source: DataSource; onDelete: () => void }) {
  const boards = (source.metadata?.boards ?? []) as JiraBoardRef[];
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-[var(--surface-container-low)]">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-[var(--on-surface)] truncate">{source.name}</div>
        <div className="text-xs text-[var(--on-surface-variant)] truncate">
          {source.type === "github_repo" && (
            <span>
              {source.org}/{source.identifier}
            </span>
          )}
          {source.type === "jira_project" && (
            <span>
              {source.identifier}
              {boards.length > 0 && (
                <>
                  {" "}
                  · {boards.length} board{boards.length !== 1 ? "s" : ""}
                </>
              )}
            </span>
          )}
          {source.type === "confluence_space" && <span>{source.identifier}</span>}
          {source.type === "linear_team" && <span className="font-mono text-[11px]">{source.identifier}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-xs text-[var(--error)] hover:underline"
      >
        Remove
      </button>
    </div>
  );
}
