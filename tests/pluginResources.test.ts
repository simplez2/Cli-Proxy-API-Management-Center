import { describe, expect, test } from 'bun:test';
import {
  buildAgentIdentityManagementURL,
  CODEX_AGENT_IDENTITY_PLUGIN_ID,
  CODEX_QUOTA_SCHEDULER_PLUGIN_ID,
  collectPluginResourceEntries,
} from '../src/features/plugins/pluginResources';
import type { PluginListEntry, PluginMenu } from '../src/types';

const pluginEntry = (
  id: string,
  effectiveEnabled: boolean,
  menus: PluginMenu[] = []
): PluginListEntry => ({
  id,
  path: `/plugins/${id}.so`,
  configured: true,
  registered: true,
  enabled: effectiveEnabled,
  effectiveEnabled,
  supportsOAuth: false,
  logo: '',
  configFields: [],
  menus,
  metadata: {
    name:
      id === CODEX_AGENT_IDENTITY_PLUGIN_ID
        ? 'Codex Agent Identity'
        : id === CODEX_QUOTA_SCHEDULER_PLUGIN_ID
          ? 'Codex Quota Scheduler'
          : id,
    version: '0.1.0',
    author: 'test',
    githubRepository: '',
    logo: '',
    configFields: [],
  },
});

describe('plugin resource navigation', () => {
  test('creates a native entry for effective Agent Identity without public menus', () => {
    const entries = collectPluginResourceEntries([
      pluginEntry(CODEX_AGENT_IDENTITY_PLUGIN_ID, true),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      pluginID: CODEX_AGENT_IDENTITY_PLUGIN_ID,
      pluginTitle: 'Codex Agent Identity',
      kind: 'codex-agent-identity',
      menuIndex: 0,
      route: '/plugin-pages/codex-agent-identity/0',
    });
    expect(entries[0]?.menu.path).toBe('');
  });

  test('does not create an entry for ineffective Agent Identity', () => {
    expect(
      collectPluginResourceEntries([pluginEntry(CODEX_AGENT_IDENTITY_PLUGIN_ID, false)])
    ).toEqual([]);
  });

  test('builds the protected Agent Identity URL from a Management API base', () => {
    expect(buildAgentIdentityManagementURL('https://cpa.example/v0/management')).toBe(
      'https://cpa.example/agent-identity/'
    );
  });

  test('creates an authenticated native entry for the effective quota scheduler', () => {
    const entries = collectPluginResourceEntries([
      pluginEntry(CODEX_QUOTA_SCHEDULER_PLUGIN_ID, true),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      pluginID: CODEX_QUOTA_SCHEDULER_PLUGIN_ID,
      kind: 'codex-quota-scheduler',
      menuIndex: 0,
      route: '/plugin-pages/codex-quota-scheduler/0',
    });
    expect(entries[0]?.menu.path).toBe('');
  });

  test('does not create an entry for an ineffective quota scheduler', () => {
    expect(
      collectPluginResourceEntries([pluginEntry(CODEX_QUOTA_SCHEDULER_PLUGIN_ID, false)])
    ).toEqual([]);
  });

  test('keeps existing static plugin menu entries unchanged', () => {
    const entries = collectPluginResourceEntries([
      pluginEntry('keeper', true, [
        {
          path: '/v0/resource/plugins/keeper/open',
          menu: 'Keeper',
          description: 'Open Keeper',
        },
      ]),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      pluginID: 'keeper',
      kind: 'iframe',
      label: 'Keeper',
      description: 'Open Keeper',
    });
    expect(entries[0]?.menu.path).toBe('/v0/resource/plugins/keeper/open');
  });
});
