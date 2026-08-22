export interface CodexResetCredit {
  id: string;
  status: string;
  grantedAt: string;
  expiresAt: string | null;
  title: string;
  description: string;
}

export interface CodexResetCreditsSummary {
  availableCount: number | null;
  credits: CodexResetCredit[] | null;
  invalidPayload: boolean;
}

interface CodexResetCreditAvailability {
  rateLimitResetCreditsAvailableCount?: number | null;
  // Informational only. Official Codex gates the reset action on availableCount.
  rateLimitResetCreditsApplicableCount?: number | null;
}

export const canUseCodexResetCredit = (quota: CodexResetCreditAvailability): boolean =>
  (quota.rateLimitResetCreditsAvailableCount ?? 0) > 0;

export type CodexResetCreditConsumeOutcome =
  'reset' | 'already_redeemed' | 'nothing_to_reset' | 'no_credit' | 'unknown';

const SHANGHAI_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const parseExpiryDate = (value: string): Date | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numeric = Number(trimmed);
  let date: Date;
  if (Number.isFinite(numeric)) {
    const absolute = Math.abs(numeric);
    const timestampMs =
      absolute < 1e11
        ? numeric * 1000
        : absolute < 1e14
          ? numeric
          : absolute < 1e17
            ? numeric / 1000
            : numeric / 1e6;
    date = new Date(Math.round(timestampMs));
  } else {
    const hasExplicitTimeZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
    const isZoneLessISODateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(
      trimmed
    );
    date = new Date(isZoneLessISODateTime && !hasExplicitTimeZone ? `${trimmed}Z` : trimmed);
  }

  return Number.isNaN(date.getTime()) ? null : date;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const normalizeStringValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  return null;
};

const normalizeNumberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const normalizeCodexResetCreditConsumeOutcome = (
  payload: unknown
): CodexResetCreditConsumeOutcome => {
  let parsedPayload = payload;
  if (typeof payload === 'string') {
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      return 'unknown';
    }
  }

  const record = asRecord(parsedPayload);
  const rawOutcome = normalizeStringValue(record?.outcome ?? record?.code);
  if (!rawOutcome) return 'unknown';

  const normalized = rawOutcome
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
  switch (normalized) {
    case 'reset':
    case 'already_redeemed':
    case 'nothing_to_reset':
    case 'no_credit':
      return normalized;
    default:
      return 'unknown';
  }
};

const normalizeCredit = (value: unknown): CodexResetCredit | null => {
  const record = asRecord(value);
  if (!record) return null;
  if (normalizeStringValue(record.reset_type ?? record.resetType) !== 'codex_rate_limits') {
    return null;
  }
  if (normalizeStringValue(record.status) !== 'available') {
    return null;
  }

  const id = normalizeStringValue(record.id);
  if (!id) return null;

  return {
    id,
    status: normalizeStringValue(record.status) ?? '',
    grantedAt: normalizeStringValue(record.granted_at ?? record.grantedAt) ?? '',
    expiresAt: normalizeStringValue(record.expires_at ?? record.expiresAt),
    title: normalizeStringValue(record.title) ?? '',
    description: normalizeStringValue(record.description) ?? '',
  };
};

export const buildCodexResetCreditConsumePayload = (
  redeemRequestId: string,
  creditId?: string | null
): { redeem_request_id: string; credit_id?: string } => {
  const normalizedCreditId = normalizeStringValue(creditId);
  return normalizedCreditId
    ? { redeem_request_id: redeemRequestId, credit_id: normalizedCreditId }
    : { redeem_request_id: redeemRequestId };
};

export const normalizeCodexResetCreditsPayload = (payload: unknown): CodexResetCreditsSummary => {
  let parsedPayload = payload;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) {
      return { availableCount: null, credits: null, invalidPayload: true };
    }
    try {
      parsedPayload = JSON.parse(trimmed);
    } catch {
      return { availableCount: null, credits: null, invalidPayload: true };
    }
  }

  const record = asRecord(parsedPayload);
  if (!record) {
    return { availableCount: null, credits: null, invalidPayload: true };
  }

  const hasExpectedShape =
    'credits' in record || 'available_count' in record || 'availableCount' in record;
  const credits = Array.isArray(record.credits)
    ? record.credits
        .map((item) => normalizeCredit(item))
        .filter((item): item is CodexResetCredit => Boolean(item))
    : null;

  return {
    availableCount: normalizeNumberValue(record.available_count ?? record.availableCount),
    credits,
    invalidPayload: !hasExpectedShape,
  };
};

export const formatShanghaiDateTime = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = parseExpiryDate(value);
  if (!date) return '';

  const parts = Object.fromEntries(
    SHANGHAI_TIME_FORMATTER.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
};
