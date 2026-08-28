import { afterEach, describe, expect, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { pluginsApi } from '../src/services/api/plugins';

const originalGetAtOrigin = apiClient.getAtOrigin;
const originalPostAtOrigin = apiClient.postAtOrigin;
const originalDeleteAtOrigin = apiClient.deleteAtOrigin;

afterEach(() => {
  apiClient.getAtOrigin = originalGetAtOrigin;
  apiClient.postAtOrigin = originalPostAtOrigin;
  apiClient.deleteAtOrigin = originalDeleteAtOrigin;
});

describe('Codex Agent Identity management API', () => {
  test('uses the authenticated sidecar plane instead of CPA plugin resource routes', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    apiClient.getAtOrigin = (async (url: string) => {
      calls.push({ method: 'GET', url });
      return { identities: [], summary: {}, channel_management_enabled: true };
    }) as typeof apiClient.getAtOrigin;
    apiClient.postAtOrigin = (async (url: string, body?: unknown) => {
      calls.push({ method: 'POST', url, body });
      return {};
    }) as typeof apiClient.postAtOrigin;
    apiClient.deleteAtOrigin = (async (url: string) => {
      calls.push({ method: 'DELETE', url });
      return {};
    }) as typeof apiClient.deleteAtOrigin;

    await pluginsApi.listAgentIdentities();
    await pluginsApi.importAgentIdentity('cais_test');
    await pluginsApi.importAgentIdentitiesBatch('cais_test\n', { preview: true, atomic: true });
    await pluginsApi.identityAction('team-a.json', 'disable');
    await pluginsApi.deleteAgentIdentity('team-a.json');

    expect(calls).toEqual([
      {
        method: 'GET',
        url: '/agent-identity/api/identities',
      },
      {
        method: 'POST',
        url: '/agent-identity/api/identities/import',
        body: { codex_access_token: 'cais_test' },
      },
      {
        method: 'POST',
        url: '/agent-identity/api/identities/import/batch?preview=true&atomic=true',
        body: 'cais_test\n',
      },
      {
        method: 'POST',
        url: '/agent-identity/api/identities/team-a.json/actions',
        body: { action: 'disable' },
      },
      {
        method: 'DELETE',
        url: '/agent-identity/api/identities/team-a.json',
      },
    ]);
  });
});
