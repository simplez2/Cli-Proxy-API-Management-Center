import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';
import {
  isManagementOAuthProviderKey,
  normalizeManagementOAuthProviderKey,
} from '@/utils/providerKeys';
import type {
  CodexQuotaSchedulerConfig,
  CodexQuotaSchedulerConfigPatch,
  CodexQuotaSchedulerQuarantineStatus,
  CodexQuotaSchedulerSnapshotStatus,
  CodexQuotaSchedulerStatus,
  CodexQuotaSchedulerWarmupStatus,
  PluginConfigField,
  PluginConfigObject,
  PluginDeleteResult,
  PluginListEntry,
  PluginListResponse,
  PluginMetadata,
  PluginMenu,
  PluginStoreEntry,
  PluginStoreInstallResult,
  PluginStorePlatform,
  PluginStoreResponse,
  PluginStoreSourceError,
} from '@/types';

const asString = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  return String(value);
};

const asBoolean = (value: unknown): boolean => value === true;

const asNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePluginOAuthProvider = (value: unknown): string | undefined => {
  const provider = normalizeManagementOAuthProviderKey(asString(value));
  return isManagementOAuthProviderKey(provider) ? provider : undefined;
};

const hasOwn = (source: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(source, key);

const normalizeConfigField = (value: unknown): PluginConfigField | null => {
  if (!isRecord(value)) return null;
  const name = asString(value.name).trim();
  if (!name) return null;
  const enumValues = Array.isArray(value.enum_values)
    ? value.enum_values.map((item) => asString(item)).filter(Boolean)
    : [];
  return {
    name,
    type: asString(value.type).trim() || 'string',
    enumValues,
    description: asString(value.description).trim(),
  };
};

const normalizeConfigFields = (value: unknown): PluginConfigField[] =>
  Array.isArray(value)
    ? (value.map((item) => normalizeConfigField(item)).filter(Boolean) as PluginConfigField[])
    : [];

const normalizeMetadata = (value: unknown): PluginMetadata | null => {
  if (!isRecord(value)) return null;
  const name = asString(value.name).trim();
  const version = asString(value.version).trim();
  const author = asString(value.author).trim();
  const githubRepository = asString(value.github_repository).trim();
  const logo = asString(value.logo).trim();
  const configFields = normalizeConfigFields(value.config_fields);

  if (!name && !version && !author && !githubRepository && !logo && configFields.length === 0) {
    return null;
  }

  return {
    name,
    version,
    author,
    githubRepository,
    logo,
    configFields,
  };
};

const normalizeMenu = (value: unknown): PluginMenu | null => {
  if (!isRecord(value)) return null;
  const path = asString(value.path).trim();
  const menu = asString(value.menu).trim();
  if (!path && !menu) return null;
  return {
    path,
    menu,
    description: asString(value.description).trim(),
  };
};

const normalizeMenus = (value: unknown): PluginMenu[] =>
  Array.isArray(value)
    ? (value.map((item) => normalizeMenu(item)).filter(Boolean) as PluginMenu[])
    : [];

const normalizePluginEntry = (value: unknown): PluginListEntry | null => {
  if (!isRecord(value)) return null;
  const id = asString(value.id).trim();
  if (!id) return null;

  const metadata = normalizeMetadata(value.metadata);
  const configFields = normalizeConfigFields(value.config_fields);
  const supportsOAuth = asBoolean(value.supports_oauth);
  const oauthProvider = normalizePluginOAuthProvider(value.oauth_provider);
  const legacyOAuthProvider =
    supportsOAuth && !hasOwn(value, 'oauth_provider')
      ? normalizePluginOAuthProvider(id)
      : undefined;

  return {
    id,
    path: asString(value.path).trim(),
    configured: asBoolean(value.configured),
    registered: asBoolean(value.registered),
    enabled: value.enabled !== false,
    effectiveEnabled: asBoolean(value.effective_enabled),
    supportsOAuth,
    oauthProvider: oauthProvider ?? legacyOAuthProvider,
    logo: asString(value.logo || metadata?.logo).trim(),
    configFields: configFields.length > 0 ? configFields : (metadata?.configFields ?? []),
    menus: normalizeMenus(value.menus),
    metadata,
  };
};

const normalizePluginList = (value: unknown): PluginListResponse => {
  const source = isRecord(value) ? value : {};
  const plugins = Array.isArray(source.plugins)
    ? (source.plugins
        .map((item) => normalizePluginEntry(item))
        .filter(Boolean) as PluginListEntry[])
    : [];

  return {
    pluginsEnabled: asBoolean(source.plugins_enabled),
    pluginsDir: asString(source.plugins_dir).trim() || 'plugins',
    plugins,
  };
};

const normalizePluginConfig = (value: unknown): PluginConfigObject =>
  isRecord(value) ? { ...value } : {};

const normalizeDeleteResult = (value: unknown): PluginDeleteResult => {
  const source = isRecord(value) ? value : {};
  return {
    status: asString(source.status).trim(),
    id: asString(source.id).trim(),
    path: asString(source.path).trim(),
    fileDeleted: asBoolean(source.file_deleted),
    configuredRemoved: asBoolean(source.configured_removed),
    restartRequired: asBoolean(source.restart_required),
  };
};

const normalizeQuotaSchedulerQuarantine = (value: unknown): CodexQuotaSchedulerQuarantineStatus => {
  const source = isRecord(value) ? value : {};
  return {
    total: asNumber(source.total),
    cooldown: asNumber(source.cooldown),
    probation: asNumber(source.probation),
    halfOpen: asNumber(source.half_open),
    probeReady: asNumber(source.probe_ready),
    total429s: asNumber(source.total_429s),
    probation429s: asNumber(source.probation_429s),
    probeStarts: asNumber(source.probe_starts),
    probeSuccesses: asNumber(source.probe_successes),
    probeFailures: asNumber(source.probe_failures),
  };
};

const normalizeQuotaSchedulerSnapshot = (
  value: unknown
): CodexQuotaSchedulerSnapshotStatus | null => {
  if (!isRecord(value)) return null;
  const authID = asString(value.auth_id).trim();
  if (!authID) return null;
  return {
    authID,
    window: asString(value.window).trim(),
    usedPercent: asNumber(value.used_percent),
    resetCredits: asNumber(value.reset_credits),
    resetAt: asString(value.reset_at).trim(),
    fresh: asBoolean(value.fresh),
    eligible: asBoolean(value.eligible),
    reason: asString(value.reason).trim(),
  };
};

const normalizeQuotaSchedulerWarmup = (value: unknown): CodexQuotaSchedulerWarmupStatus | null => {
  if (!isRecord(value)) return null;
  const authID = asString(value.auth_id).trim();
  if (!authID) return null;
  return {
    authID,
    window: asString(value.window).trim(),
    attemptedAt: asString(value.attempted_at).trim(),
    activatedAt: asString(value.activated_at).trim(),
    resetAt: asString(value.reset_at).trim(),
    status: asNumber(value.status),
    error: asString(value.error).trim(),
  };
};

const normalizeQuotaSchedulerStatus = (value: unknown): CodexQuotaSchedulerStatus => {
  if (!isRecord(value)) {
    throw new Error('Invalid Codex Quota Scheduler status response');
  }

  const snapshots = Array.isArray(value.snapshots)
    ? (value.snapshots
        .map((item) => normalizeQuotaSchedulerSnapshot(item))
        .filter(Boolean) as CodexQuotaSchedulerSnapshotStatus[])
    : [];
  const warmups = Array.isArray(value.warmups)
    ? (value.warmups
        .map((item) => normalizeQuotaSchedulerWarmup(item))
        .filter(Boolean) as CodexQuotaSchedulerWarmupStatus[])
    : [];

  const manualActiveAuthID = asString(
    value.serial_manual_active_auth_id ??
      value.manual_active_auth_id ??
      value.manual_serial_active_auth_id
  ).trim();
  const rawSelectionSource = asString(value.serial_selection_source).trim().toLowerCase();
  const serialSelectionSource: 'auto' | 'manual' =
    rawSelectionSource === 'manual' ||
    Boolean(manualActiveAuthID) ||
    asBoolean(value.serial_manual_selection) ||
    asBoolean(value.serial_manual_lock)
      ? 'manual'
      : 'auto';

  return {
    enabled: asBoolean(value.enabled),
    schedulerMode: asString(value.scheduler_mode).trim(),
    serialSwitchPercent: asNumber(value.serial_switch_percent),
    warmupModel: asString(value.warmup_model).trim(),
    serialActiveAuthID: asString(value.serial_active_auth_id).trim(),
    serialSelectionSource,
    serialManualActiveAuthID: manualActiveAuthID,
    serialSelectedAt: asString(value.serial_selected_at).trim(),
    serialSwitches: asNumber(value.serial_switches),
    serialProvisionalFallbacks: asNumber(value.serial_provisional_fallbacks),
    serialProvisionalAuthID: asString(value.serial_provisional_auth_id).trim(),
    serialCandidateMissingSince: asString(value.serial_candidate_missing_since).trim(),
    serialCandidateMissingConfirmations: asNumber(
      value.serial_candidate_missing_confirmations
    ),
    serialLastSwitchAt: asString(value.serial_last_switch_at).trim(),
    serialLastSwitchReason: asString(value.serial_last_switch_reason).trim(),
    keeperConfigured: asBoolean(value.keeper_configured),
    warmupEnabled: asBoolean(value.warmup_enabled),
    refreshes: asNumber(value.refreshes),
    lastRefresh: asString(value.last_refresh).trim(),
    lastError: asString(value.last_error).trim(),
    freshSnapshots: asNumber(value.fresh_snapshots),
    quarantine: normalizeQuotaSchedulerQuarantine(value.quarantine),
    snapshots,
    warmups,
  };
};

const normalizeQuotaSchedulerConfig = (value: unknown): CodexQuotaSchedulerConfig => {
  const source = isRecord(value) ? value : {};
  const threshold = asNumber(source.serial_switch_percent);
  return {
    schedulerMode: asString(source.scheduler_mode).trim() || 'serial',
    serialSwitchPercent: threshold > 0 ? threshold : 98,
    warmupModel: asString(source.warmup_model).trim(),
  };
};

const normalizeStoreEntry = (value: unknown): PluginStoreEntry | null => {
  if (!isRecord(value)) return null;
  const id = asString(value.id).trim();
  if (!id) return null;
  const sourceId = asString(value.source_id).trim();
  const storeId = asString(value.store_id).trim() || (sourceId ? `${sourceId}/${id}` : id);

  const tags = Array.isArray(value.tags)
    ? value.tags.map((item) => asString(item).trim()).filter(Boolean)
    : [];
  const platforms = Array.isArray(value.platforms)
    ? (value.platforms
        .map((item): PluginStorePlatform | null => {
          if (!isRecord(item)) return null;
          const goos = asString(item.goos).trim();
          const goarch = asString(item.goarch).trim();
          return goos || goarch ? { goos, goarch } : null;
        })
        .filter(Boolean) as PluginStorePlatform[])
    : [];

  return {
    storeId,
    sourceId,
    sourceName: asString(value.source_name).trim(),
    sourceUrl: asString(value.source_url).trim(),
    id,
    name: asString(value.name).trim(),
    description: asString(value.description).trim(),
    author: asString(value.author).trim(),
    version: asString(value.version).trim(),
    repository: asString(value.repository).trim(),
    installType: asString(value.install_type).trim(),
    authRequired: asBoolean(value.auth_required),
    authConfigured: asBoolean(value.auth_configured),
    platforms,
    logo: asString(value.logo).trim(),
    homepage: asString(value.homepage).trim(),
    license: asString(value.license).trim(),
    tags,
    installed: asBoolean(value.installed),
    installedVersion: asString(value.installed_version).trim(),
    path: asString(value.path).trim(),
    configured: asBoolean(value.configured),
    registered: asBoolean(value.registered),
    enabled: asBoolean(value.enabled),
    effectiveEnabled: asBoolean(value.effective_enabled),
    updateAvailable: asBoolean(value.update_available),
  };
};

const normalizeStoreSourceError = (value: unknown): PluginStoreSourceError | null => {
  if (!isRecord(value)) return null;
  const sourceId = asString(value.source_id).trim();
  const sourceUrl = asString(value.source_url).trim();
  const message = asString(value.message).trim();
  if (!sourceId && !sourceUrl && !message) return null;
  return {
    sourceId,
    sourceName: asString(value.source_name).trim(),
    sourceUrl,
    message,
  };
};

const normalizeStoreList = (value: unknown): PluginStoreResponse => {
  const source = isRecord(value) ? value : {};
  const plugins = Array.isArray(source.plugins)
    ? (source.plugins
        .map((item) => normalizeStoreEntry(item))
        .filter(Boolean) as PluginStoreEntry[])
    : [];
  const sourceErrors = Array.isArray(source.source_errors)
    ? (source.source_errors
        .map((item) => normalizeStoreSourceError(item))
        .filter(Boolean) as PluginStoreSourceError[])
    : [];

  return {
    pluginsEnabled: asBoolean(source.plugins_enabled),
    pluginsDir: asString(source.plugins_dir).trim() || 'plugins',
    sourceErrors,
    plugins,
  };
};

const normalizeInstallResult = (value: unknown): PluginStoreInstallResult => {
  const source = isRecord(value) ? value : {};
  return {
    status: asString(source.status).trim(),
    sourceId: asString(source.source_id).trim(),
    sourceName: asString(source.source_name).trim(),
    sourceUrl: asString(source.source_url).trim(),
    id: asString(source.id).trim(),
    version: asString(source.version).trim(),
    installType: asString(source.install_type).trim(),
    path: asString(source.path).trim(),
    pluginsEnabled: asBoolean(source.plugins_enabled),
    restartRequired: asBoolean(source.restart_required),
  };
};

export interface PluginStoreInstallOptions {
  sourceId?: string;
  version?: string;
}

export const pluginsApi = {
  async list(): Promise<PluginListResponse> {
    const data = await apiClient.get('/plugins');
    return normalizePluginList(data);
  },

  updateEnabled: (id: string, enabled: boolean) =>
    apiClient.patch(`/plugins/${encodeURIComponent(id)}/enabled`, { enabled }),

  async deletePlugin(id: string): Promise<PluginDeleteResult> {
    const data = await apiClient.delete(`/plugins/${encodeURIComponent(id)}`);
    return normalizeDeleteResult(data);
  },

  async getConfig(id: string): Promise<PluginConfigObject> {
    const data = await apiClient.get(`/plugins/${encodeURIComponent(id)}/config`);
    return normalizePluginConfig(data);
  },

  patchConfig: (id: string, config: PluginConfigObject) =>
    apiClient.patch(`/plugins/${encodeURIComponent(id)}/config`, config),

  async getQuotaSchedulerStatus(): Promise<CodexQuotaSchedulerStatus> {
    const data = await apiClient.get('/plugins/codex-quota-scheduler/quota');
    return normalizeQuotaSchedulerStatus(data);
  },

  async getQuotaSchedulerConfig(): Promise<CodexQuotaSchedulerConfig> {
    const data = await apiClient.get('/plugins/codex-quota-scheduler/config');
    return normalizeQuotaSchedulerConfig(data);
  },

  patchQuotaSchedulerConfig(config: CodexQuotaSchedulerConfigPatch) {
    const patch: PluginConfigObject = {};
    if (config.schedulerMode !== undefined) patch.scheduler_mode = config.schedulerMode;
    if (config.serialSwitchPercent !== undefined) {
      patch.serial_switch_percent = config.serialSwitchPercent;
    }
    if (config.warmupModel !== undefined) patch.warmup_model = config.warmupModel;
    return apiClient.patch('/plugins/codex-quota-scheduler/config', patch);
  },

  setQuotaSchedulerSerialActive(authID: string) {
    return apiClient.put('/plugins/codex-quota-scheduler/serial-active', { auth_id: authID });
  },

  clearQuotaSchedulerSerialActive() {
    return apiClient.delete('/plugins/codex-quota-scheduler/serial-active');
  },
};

export const pluginStoreApi = {
  async list(): Promise<PluginStoreResponse> {
    const data = await apiClient.get('/plugin-store');
    return normalizeStoreList(data);
  },

  async install(
    id: string,
    options: PluginStoreInstallOptions = {}
  ): Promise<PluginStoreInstallResult> {
    const path = `/plugin-store/${encodeURIComponent(id)}/install`;
    const params = new URLSearchParams();
    const sourceId = options.sourceId?.trim();
    const version = options.version?.trim();
    if (sourceId) params.set('source', sourceId);
    if (version) params.set('version', version);
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const data = await apiClient.post(`${path}${query}`, version ? { version } : undefined);
    return normalizeInstallResult(data);
  },
};
