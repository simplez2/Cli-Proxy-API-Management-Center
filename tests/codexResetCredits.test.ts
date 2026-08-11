import { describe, expect, test } from 'bun:test';
import {
  buildCodexResetCreditConsumePayload,
  canUseCodexResetCredit,
  hasCodexResetCreditInventory,
  shouldShowCodexResetCreditAction,
  formatShanghaiDateTime,
  normalizeCodexResetCreditConsumeOutcome,
  normalizeCodexResetCreditsPayload,
} from '../src/utils/quota/resetCredits';

describe('Codex reset credit details', () => {
  test('preserves null credits when upstream only exposes a count', () => {
    expect(
      normalizeCodexResetCreditsPayload({
        credits: null,
        available_count: 1,
        applicable_available_count: 0,
      })
    ).toEqual({
      availableCount: 1,
      credits: null,
      invalidPayload: false,
    });
  });

  test('distinguishes a successful empty detail list', () => {
    expect(normalizeCodexResetCreditsPayload({ credits: [], available_count: 0 })).toEqual({
      availableCount: 0,
      credits: [],
      invalidPayload: false,
    });
  });

  test('keeps only available Codex rate-limit credits with a usable opaque id', () => {
    const summary = normalizeCodexResetCreditsPayload({
      available_count: 2,
      credits: [
        {
          id: 'credit-1',
          reset_type: 'codex_rate_limits',
          status: 'available',
          granted_at: '2026-07-01T00:00:00Z',
          expires_at: '2026-08-01T00:00:00Z',
        },
        {
          id: 'other-credit',
          reset_type: 'other',
          status: 'available',
          expires_at: '2026-08-01T00:00:00Z',
        },
      ],
    });

    expect(summary.credits).toEqual([
      {
        id: 'credit-1',
        status: 'available',
        grantedAt: '2026-07-01T00:00:00Z',
        expiresAt: '2026-08-01T00:00:00Z',
        title: '',
        description: '',
      },
    ]);
  });

  test('keeps a selectable credit that does not expire', () => {
    expect(
      normalizeCodexResetCreditsPayload({
        available_count: 1,
        credits: [
          {
            id: 'credit-without-expiry',
            reset_type: 'codex_rate_limits',
            status: 'available',
            granted_at: 1782864000,
            expires_at: null,
            title: 'Full reset',
          },
        ],
      }).credits
    ).toEqual([
      {
        id: 'credit-without-expiry',
        status: 'available',
        grantedAt: '1782864000',
        expiresAt: null,
        title: 'Full reset',
        description: '',
      },
    ]);
  });

  test('rejects invalid payloads without pretending detail is empty', () => {
    expect(normalizeCodexResetCreditsPayload('not-json')).toEqual({
      availableCount: null,
      credits: null,
      invalidPayload: true,
    });
  });
});

describe('Codex reset credit consume payload', () => {
  test('forwards the selected credit id', () => {
    expect(buildCodexResetCreditConsumePayload('redeem-1', 'credit-2')).toEqual({
      redeem_request_id: 'redeem-1',
      credit_id: 'credit-2',
    });
  });

  test('lets the upstream select the next credit when details are unavailable', () => {
    expect(buildCodexResetCreditConsumePayload('redeem-2', null)).toEqual({
      redeem_request_id: 'redeem-2',
    });
  });
});

describe('Codex reset action availability', () => {
  test('keeps banked inventory visible while consume remains disabled', () => {
    const quota = {
      rateLimitResetCreditsAvailableCount: 1,
      rateLimitResetCreditsApplicableCount: 0,
    };
    expect(hasCodexResetCreditInventory(quota)).toBe(true);
    expect(shouldShowCodexResetCreditAction(quota)).toBe(true);
    expect(canUseCodexResetCredit(quota)).toBe(false);
  });

  test('disables reset until an eligible rate-limit window is exhausted', () => {
    expect(
      canUseCodexResetCredit({
        rateLimitResetCreditsAvailableCount: 1,
        rateLimitResetCreditsApplicableCount: 0,
      })
    ).toBe(false);
  });

  test('fails closed when upstream omits applicable availability', () => {
    expect(
      canUseCodexResetCredit({
        rateLimitResetCreditsAvailableCount: 1,
        rateLimitResetCreditsApplicableCount: null,
      })
    ).toBe(false);
  });

  test('enables reset when upstream reports an applicable credit', () => {
    expect(
      canUseCodexResetCredit({
        rateLimitResetCreditsAvailableCount: 1,
        rateLimitResetCreditsApplicableCount: 1,
      })
    ).toBe(true);
  });

  test('rejects applicable availability when inventory is empty', () => {
    const quota = {
      rateLimitResetCreditsAvailableCount: 0,
      rateLimitResetCreditsApplicableCount: 1,
    };
    expect(canUseCodexResetCredit(quota)).toBe(false);
    expect(shouldShowCodexResetCreditAction(quota)).toBe(false);
  });
});

describe('Codex reset credit consume outcome', () => {
  test('accepts both backend code and app-server outcome spellings', () => {
    expect(normalizeCodexResetCreditConsumeOutcome({ code: 'reset' })).toBe('reset');
    expect(normalizeCodexResetCreditConsumeOutcome({ outcome: 'alreadyRedeemed' })).toBe(
      'already_redeemed'
    );
  });

  test('preserves non-consuming outcomes for the UI to report', () => {
    expect(normalizeCodexResetCreditConsumeOutcome('{"code":"nothing_to_reset"}')).toBe(
      'nothing_to_reset'
    );
    expect(normalizeCodexResetCreditConsumeOutcome({ outcome: 'noCredit' })).toBe('no_credit');
  });
});

describe('Codex reset credit expiry timezone', () => {
  test('converts a UTC ISO timestamp to Asia/Shanghai time', () => {
    expect(formatShanghaiDateTime('2026-08-01T00:00:00Z')).toBe('2026-08-01 08:00:00');
  });

  test('does not add eight hours twice when the source already has an offset', () => {
    expect(formatShanghaiDateTime('2026-08-01T08:00:00+08:00')).toBe('2026-08-01 08:00:00');
  });

  test('supports Unix timestamps in seconds and milliseconds', () => {
    expect(formatShanghaiDateTime('1785542400')).toBe('2026-08-01 08:00:00');
    expect(formatShanghaiDateTime('1785542400000')).toBe('2026-08-01 08:00:00');
  });

  test('treats a timezone-less upstream ISO timestamp as UTC', () => {
    expect(formatShanghaiDateTime('2026-08-01T00:00:00')).toBe('2026-08-01 08:00:00');
  });
});
