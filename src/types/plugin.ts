export type PluginConfigFieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'array'
  | 'object';

export interface PluginConfigField {
  name: string;
  type: PluginConfigFieldType | string;
  enumValues: string[];
  description: string;
}

export type PluginConfigObject = Record<string, unknown>;

export interface PluginMetadata {
  name: string;
  version: string;
  author: string;
  githubRepository: string;
  logo: string;
  configFields: PluginConfigField[];
}

export interface PluginMenu {
  path: string;
  menu: string;
  description: string;
}

export interface PluginListEntry {
  id: string;
  path: string;
  configured: boolean;
  registered: boolean;
  enabled: boolean;
  effectiveEnabled: boolean;
  supportsOAuth: boolean;
  oauthProvider?: string;
  logo: string;
  configFields: PluginConfigField[];
  menus: PluginMenu[];
  metadata: PluginMetadata | null;
}

export interface PluginListResponse {
  pluginsEnabled: boolean;
  pluginsDir: string;
  plugins: PluginListEntry[];
}

export interface PluginDeleteResult {
  status: string;
  id: string;
  path: string;
  fileDeleted: boolean;
  configuredRemoved: boolean;
  restartRequired: boolean;
}

export interface PluginStoreEntry {
  storeId: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  repository: string;
  installType: string;
  authRequired: boolean;
  authConfigured: boolean;
  platforms: PluginStorePlatform[];
  logo: string;
  homepage: string;
  license: string;
  tags: string[];
  installed: boolean;
  installedVersion: string;
  path: string;
  configured: boolean;
  registered: boolean;
  enabled: boolean;
  effectiveEnabled: boolean;
  updateAvailable: boolean;
}

export interface PluginStorePlatform {
  goos: string;
  goarch: string;
}

export interface PluginStoreSourceError {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  message: string;
}

export interface PluginStoreResponse {
  pluginsEnabled: boolean;
  pluginsDir: string;
  sourceErrors: PluginStoreSourceError[];
  plugins: PluginStoreEntry[];
}

export interface PluginStoreInstallResult {
  status: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  id: string;
  version: string;
  installType: string;
  path: string;
  pluginsEnabled: boolean;
  restartRequired: boolean;
}

export interface CodexAgentIdentityRecord {
  id: string;
  createdAt: string;
  credentialKind: string;
  email: string;
  planType: string;
  expiresAt: string;
  expired: boolean;
  fedramp: boolean;
  channelManaged: boolean;
  channelSynced: boolean;
  channelDisabled: boolean;
  channelAuthFile: string;
}

export interface CodexAgentIdentitySummary {
  total: number;
  active: number;
  disabled: number;
  agentIdentity: number;
  personalAccessToken: number;
  unsynced: number;
}

export interface CodexAgentIdentityListResponse {
  identities: CodexAgentIdentityRecord[];
  summary: CodexAgentIdentitySummary;
  channelManagementEnabled: boolean;
  channelSyncError: string;
}

export type CodexAgentIdentityAction = 'enable' | 'disable' | 'refresh';

export interface CodexAgentIdentityBatchItem {
  index: number;
  label: string;
  identityId: string;
  status: string;
  code: string;
  message: string;
  credentialKind: string;
  email: string;
  planType: string;
  expiresAt: string;
  fedramp: boolean;
  channelSynced: boolean;
  duplicateOf: number;
}

export interface CodexAgentIdentityBatchSummary {
  total: number;
  ready: number;
  imported: number;
  duplicate: number;
  invalid: number;
  upstreamUnavailable: number;
  failed: number;
  rolledBack: number;
  rollbackFailed: number;
  aborted: number;
}

export interface CodexAgentIdentityBatchResponse {
  status: string;
  preview: boolean;
  atomic: boolean;
  transaction: string;
  summary: CodexAgentIdentityBatchSummary;
  items: CodexAgentIdentityBatchItem[];
}
