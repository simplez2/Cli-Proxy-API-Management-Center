import { afterEach, describe, expect, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { pluginsApi } from '../src/services/api/plugins';

const originalGet = apiClient.get;
const originalPatch = apiClient.patch;
const originalPut = apiClient.put;
const originalDelete = apiClient.delete;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.patch = originalPatch;
  apiClient.put = originalPut;
  apiClient.delete = originalDelete;
});

describe('Codex Quota Scheduler status', () => {
  test('normalizes v0.1.2 provisional fallback state', async () => {
    let requestedURL = '';
    apiClient.get = (async (url: string) => {
      requestedURL = url;
      return {
        serial_provisional_fallbacks: 17,
        serial_provisional_auth_id: 'codex-backup.json',
        serial_candidate_missing_since: '2026-07-29T11:31:00Z',
        serial_candidate_missing_confirmations: 2,
      };
    }) as typeof apiClient.get;

    const status = await pluginsApi.getQuotaSchedulerStatus();

    expect(requestedURL).toBe('/plugins/codex-quota-scheduler/quota');
    expect({
      fallbacks: status.serialProvisionalFallbacks,
      authID: status.serialProvisionalAuthID,
      missingSince: status.serialCandidateMissingSince,
      confirmations: status.serialCandidateMissingConfirmations,
    }).toEqual({
      fallbacks: 17,
      authID: 'codex-backup.json',
      missingSince: '2026-07-29T11:31:00Z',
      confirmations: 2,
    });
  });

  test('defaults provisional fields for v0.1.1 responses', async () => {
    apiClient.get = (async () => ({ serial_switches: 32 })) as typeof apiClient.get;

    const status = await pluginsApi.getQuotaSchedulerStatus();

    expect(status.serialSwitches).toBe(32);
    expect({
      fallbacks: status.serialProvisionalFallbacks,
      authID: status.serialProvisionalAuthID,
      missingSince: status.serialCandidateMissingSince,
      confirmations: status.serialCandidateMissingConfirmations,
    }).toEqual({
      fallbacks: 0,
      authID: '',
      missingSince: '',
      confirmations: 0,
    });
  });

  test('normalizes editable scheduler config', async () => {
    let requestedURL = '';
    apiClient.get = (async (url: string) => {
      requestedURL = url;
      return {
        scheduler_mode: 'shadow',
        serial_switch_percent: 96,
        warmup_model: 'gpt-5.6-luna',
      };
    }) as typeof apiClient.get;

    const config = await pluginsApi.getQuotaSchedulerConfig();

    expect(requestedURL).toBe('/plugins/codex-quota-scheduler/config');
    expect(config).toEqual({
      schedulerMode: 'shadow',
      serialSwitchPercent: 96,
      warmupModel: 'gpt-5.6-luna',
      serial5hHandoffMode: 'inherit_global',
      serial5hSwitchPercent: 98,
    });
  });

  test('does not silently pin a missing warmup model to Luna', async () => {
    apiClient.get = (async () => ({
      scheduler_mode: 'serial',
      serial_switch_percent: 98,
    })) as typeof apiClient.get;

    const config = await pluginsApi.getQuotaSchedulerConfig();

    expect(config.warmupModel).toBe('');
  });

  test('maps config and serial account writes to authenticated management routes', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    apiClient.patch = (async (url: string, body?: unknown) => {
      calls.push({ method: 'PATCH', url, body });
      return {};
    }) as typeof apiClient.patch;
    apiClient.put = (async (url: string, body?: unknown) => {
      calls.push({ method: 'PUT', url, body });
      return {};
    }) as typeof apiClient.put;
    apiClient.delete = (async (url: string) => {
      calls.push({ method: 'DELETE', url });
      return {};
    }) as typeof apiClient.delete;

    await pluginsApi.patchQuotaSchedulerConfig({
      schedulerMode: 'serial',
      serialSwitchPercent: 98,
      warmupModel: 'gpt-5.6-luna',
    });
    await pluginsApi.setQuotaSchedulerSerialActive('codex-team-a.json');
    await pluginsApi.clearQuotaSchedulerSerialActive();

    expect(calls).toEqual([
      {
        method: 'PATCH',
        url: '/plugins/codex-quota-scheduler/config',
        body: {
          scheduler_mode: 'serial',
          serial_switch_percent: 98,
          warmup_model: 'gpt-5.6-luna',
        },
      },
      {
        method: 'PUT',
        url: '/plugins/codex-quota-scheduler/serial-active',
        body: { auth_id: 'codex-team-a.json' },
      },
      { method: 'DELETE', url: '/plugins/codex-quota-scheduler/serial-active' },
    ]);
  });

  test('normalizes manual selection and warmup model status', async () => {
    apiClient.get = (async () => ({
      serial_selection_source: 'manual',
      serial_manual_active_auth_id: 'codex-team-a.json',
      serial_active_auth_id: 'codex-team-a.json',
      warmup_model: 'gpt-5.6-luna',
    })) as typeof apiClient.get;

    const status = await pluginsApi.getQuotaSchedulerStatus();

    expect(status.serialSelectionSource).toBe('manual');
    expect(status.serialManualActiveAuthID).toBe('codex-team-a.json');
    expect(status.warmupModel).toBe('gpt-5.6-luna');
  });
});
