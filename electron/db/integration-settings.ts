import { getDb } from "./index";
import type { IntegrationCategory, IntegrationSettingsState } from "../integrations/types";
import {
  DEFAULT_INTEGRATION_SETTINGS,
  isCodeProviderId,
  isDocsProviderId,
  isWorkProviderId,
} from "../integrations/types";

interface Row {
  category: string;
  provider_id: string;
}

function normalize(state: Partial<IntegrationSettingsState> | null): IntegrationSettingsState {
  if (!state) return { ...DEFAULT_INTEGRATION_SETTINGS };
  return {
    code: state.code && isCodeProviderId(state.code) ? state.code : DEFAULT_INTEGRATION_SETTINGS.code,
    work: state.work && isWorkProviderId(state.work) ? state.work : DEFAULT_INTEGRATION_SETTINGS.work,
    docs: state.docs && isDocsProviderId(state.docs) ? state.docs : DEFAULT_INTEGRATION_SETTINGS.docs,
  };
}

export function getIntegrationSettings(): IntegrationSettingsState {
  const db = getDb();
  let rows: Row[] = [];
  try {
    rows = db.prepare("SELECT category, provider_id FROM integration_settings").all() as Row[];
  } catch {
    return { ...DEFAULT_INTEGRATION_SETTINGS };
  }
  if (rows.length === 0) return { ...DEFAULT_INTEGRATION_SETTINGS };

  const partial: Partial<IntegrationSettingsState> = {};
  for (const r of rows) {
    if (r.category === "code" && isCodeProviderId(r.provider_id)) partial.code = r.provider_id;
    if (r.category === "work" && isWorkProviderId(r.provider_id)) partial.work = r.provider_id;
    if (r.category === "docs" && isDocsProviderId(r.provider_id)) partial.docs = r.provider_id;
  }
  return normalize(partial);
}

export function setIntegrationProvider(category: IntegrationCategory, providerId: string): IntegrationSettingsState {
  const db = getDb();
  const valid =
    (category === "code" && isCodeProviderId(providerId)) ||
    (category === "work" && isWorkProviderId(providerId)) ||
    (category === "docs" && isDocsProviderId(providerId));
  if (!valid) {
    throw new Error(`Invalid provider "${providerId}" for category "${category}"`);
  }

  db.prepare(
    `INSERT INTO integration_settings (category, provider_id, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(category) DO UPDATE SET provider_id = excluded.provider_id, updated_at = excluded.updated_at`,
  ).run(category, providerId);
  return getIntegrationSettings();
}
