import { describe, expect, test } from 'bun:test';
import {
  buildQuotaSchedulerConfigPatch,
  isValidWarmupModelId,
  normalizeQuotaSchedulerConfig,
  normalizeQuotaSchedulerStatus,
} from '../src/features/plugins/quotaSchedulerManagement';

describe('Codex Quota Scheduler editable controls', () => {
  test('does not invent a Luna warmup model when config omits one', () => {
    expect(
      normalizeQuotaSchedulerConfig({
        scheduler_mode: 'serial',
        serial_switch_percent: 98,
      })
    ).toEqual({
      schedulerMode: 'serial',
      serialSwitchPercent: 98,
      warmupModel: '',
    });
  });

  test('builds a sparse config patch', () => {
    const baseline = {
      schedulerMode: 'serial',
      serialSwitchPercent: 98,
      warmupModel: 'gpt-current',
    };

    expect(
      buildQuotaSchedulerConfigPatch(baseline, {
        ...baseline,
        warmupModel: 'gpt-selected',
      })
    ).toEqual({ warmup_model: 'gpt-selected' });
    expect(buildQuotaSchedulerConfigPatch(baseline, baseline)).toEqual({});
  });

  test('accepts future model ids while blocking unsafe header values', () => {
    expect(isValidWarmupModelId('provider/gpt-future:preview_2027.1')).toBe(true);
    expect(isValidWarmupModelId('gpt-future\r\nX-Test: injected')).toBe(false);
    expect(isValidWarmupModelId('model with spaces')).toBe(false);
    expect(isValidWarmupModelId('x'.repeat(257))).toBe(false);
  });

  test('normalizes manual selection and eligible auth model sources', () => {
    const status = normalizeQuotaSchedulerStatus(
      {
        serial_active_auth_id: 'auth-a',
        serial_selection_source: 'manual',
        serial_manual_active_auth_id: 'auth-a',
        warmup_model: 'gpt-selected',
        snapshots: [
          {
            auth_id: 'auth-a',
            auth_index: 'team-a.json',
            window: 'weekly',
            used_percent: 22,
            fresh: true,
            eligible: true,
          },
        ],
      },
      {},
      {
        files: [
          {
            auth_index: 'team-a.json',
            name: 'codex-team-a.json',
            email: 'member@example.test',
          },
        ],
      }
    );

    expect(status.serialSelectionSource).toBe('manual');
    expect(status.serialManualActiveAuthId).toBe('auth-a');
    expect(status.warmupModel).toBe('gpt-selected');
    expect(status.snapshots).toEqual([
      {
        authId: 'auth-a',
        label: 'member@example.test',
        modelSource: 'codex-team-a.json',
        window: 'weekly',
        usedPercent: 22,
        fresh: true,
        eligible: true,
        reason: '',
      },
    ]);
  });
});
