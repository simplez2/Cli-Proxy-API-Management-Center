import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { IconRefreshCw } from '@/components/ui/icons';
import { authFilesApi, pluginsApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type {
  CodexQuotaSchedulerConfig,
  CodexQuotaSchedulerSnapshotStatus,
  CodexQuotaSchedulerStatus,
  CodexQuotaSchedulerWarmupStatus,
} from '@/types';
import { getErrorMessage } from '@/utils/helpers';
import styles from './CodexQuotaSchedulerPage.module.scss';

const EMPTY_VALUE = '—';
const AUTO_AUTH = '';

const formatDateTime = (value: string): string => {
  if (!value) return EMPTY_VALUE;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const formatPercent = (value: number): string =>
  `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)}%`;

const SWITCH_REASON_KEYS: Record<string, string> = {
  candidate_unavailable: 'quota_scheduler.switch_reason_candidate_unavailable',
  candidate_unavailable_confirmed:
    'quota_scheduler.switch_reason_candidate_unavailable_confirmed',
  serial_threshold: 'quota_scheduler.switch_reason_serial_threshold',
  quarantined: 'quota_scheduler.switch_reason_quarantined',
  initial_selection: 'quota_scheduler.switch_reason_initial_selection',
};

const latestWarmup = (
  warmups: CodexQuotaSchedulerWarmupStatus[]
): CodexQuotaSchedulerWarmupStatus | null =>
  warmups.reduce<CodexQuotaSchedulerWarmupStatus | null>((latest, item) => {
    if (!latest) return item;
    const latestTime = Date.parse(latest.activatedAt || latest.attemptedAt);
    const itemTime = Date.parse(item.activatedAt || item.attemptedAt);
    if (Number.isNaN(itemTime)) return latest;
    return Number.isNaN(latestTime) || itemTime > latestTime ? item : latest;
  }, null);

function StatusBadge({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span className={`${styles.badge} ${active ? styles.badgeSuccess : styles.badgeMuted}`}>
      <span className={styles.badgeDot} aria-hidden="true" />
      {children}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
}) {
  return (
    <section className={styles.summaryCard}>
      <span className={styles.summaryLabel}>{label}</span>
      <strong className={styles.summaryValue}>{value}</strong>
      <span className={styles.summaryDetail}>{detail}</span>
    </section>
  );
}

function SnapshotTable({ snapshots }: { snapshots: CodexQuotaSchedulerSnapshotStatus[] }) {
  const { t } = useTranslation();

  if (snapshots.length === 0) {
    return <div className={styles.emptyState}>{t('quota_scheduler.no_snapshots')}</div>;
  }

  return (
    <div className={styles.tableScroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('quota_scheduler.account')}</th>
            <th>{t('quota_scheduler.window')}</th>
            <th>{t('quota_scheduler.used')}</th>
            <th>{t('quota_scheduler.reset_credits')}</th>
            <th>{t('quota_scheduler.reset_at')}</th>
            <th>{t('quota_scheduler.eligibility')}</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((snapshot) => (
            <tr key={snapshot.authID}>
              <td className={styles.accountCell} title={snapshot.authID}>
                {snapshot.authID}
              </td>
              <td>{snapshot.window || EMPTY_VALUE}</td>
              <td>{formatPercent(snapshot.usedPercent)}</td>
              <td>{snapshot.resetCredits}</td>
              <td>{formatDateTime(snapshot.resetAt)}</td>
              <td>
                <StatusBadge active={snapshot.fresh && snapshot.eligible}>
                  {snapshot.fresh && snapshot.eligible
                    ? t('quota_scheduler.eligible')
                    : snapshot.reason || t('quota_scheduler.ineligible')}
                </StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CodexQuotaSchedulerPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const [status, setStatus] = useState<CodexQuotaSchedulerStatus | null>(null);
  const [config, setConfig] = useState<CodexQuotaSchedulerConfig | null>(null);
  const [baselineSerialAuth, setBaselineSerialAuth] = useState(AUTO_AUTH);
  const [draftMode, setDraftMode] = useState('serial');
  const [draftThreshold, setDraftThreshold] = useState('98');
  const [draft5hHandoffMode, setDraft5hHandoffMode] = useState('inherit_global');
  const [draft5hThreshold, setDraft5hThreshold] = useState('98');
  const [draftWarmupModel, setDraftWarmupModel] = useState('gpt-5.6-luna');
  const [draftSerialAuth, setDraftSerialAuth] = useState(AUTO_AUTH);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modelCandidates, setModelCandidates] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelError, setModelError] = useState('');

  const connected = connectionStatus === 'connected';

  const loadDashboard = useCallback(async (preserveDraft = false) => {
    if (!connected) {
      setLoading(false);
      setError(t('notification.connection_required'));
      return false;
    }

    setLoading(true);
    setError('');
    try {
      const [nextStatus, nextConfig] = await Promise.all([
        pluginsApi.getQuotaSchedulerStatus(),
        pluginsApi.getQuotaSchedulerConfig(),
      ]);
      const nextManualAuth =
        nextStatus.serialSelectionSource === 'manual'
          ? nextStatus.serialManualActiveAuthID || nextStatus.serialActiveAuthID || AUTO_AUTH
          : AUTO_AUTH;
      setStatus(nextStatus);
      setConfig(nextConfig);
      setBaselineSerialAuth(nextManualAuth);
      if (!preserveDraft) {
        setDraftMode(nextConfig.schedulerMode);
        setDraftThreshold(String(nextConfig.serialSwitchPercent));
        setDraft5hHandoffMode(nextConfig.serial5hHandoffMode);
        setDraft5hThreshold(String(nextConfig.serial5hSwitchPercent));
        setDraftWarmupModel(nextConfig.warmupModel);
        setDraftSerialAuth(nextManualAuth);
      }
      return true;
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('quota_scheduler.load_failed')));
      return false;
    } finally {
      setLoading(false);
    }
  }, [connected, t]);

  useEffect(() => {
    void loadDashboard(false);
  }, [loadDashboard]);

  const modelSource =
    status?.serialActiveAuthID ||
    status?.snapshots.find((snapshot) => snapshot.fresh && snapshot.eligible)?.authID ||
    '';

  useEffect(() => {
    let cancelled = false;
    if (!connected || !modelSource) {
      setModelCandidates([]);
      return;
    }
    setModelCandidates([]);
    setModelsLoading(true);
    setModelError('');
    authFilesApi
      .getModelsForAuthFile(modelSource)
      .then((items) => {
        if (cancelled) return;
        setModelCandidates(
          [...new Set(items.map((item) => String(item.id || '').trim()).filter(Boolean))].sort(
            (left, right) => left.localeCompare(right)
          )
        );
      })
      .catch(() => {
        if (!cancelled) setModelError(t('quota_scheduler.model_catalog_failed'));
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, modelSource, t]);

  const parsedThreshold = Number(draftThreshold);
  const parsed5hThreshold = Number(draft5hThreshold);
  const fiveHourThresholdEnabled = draft5hHandoffMode === 'custom_threshold';
  const effectiveDraftSerial = draftMode === 'serial' ? draftSerialAuth : AUTO_AUTH;
  const configDirty = Boolean(config) &&
    (draftMode !== config?.schedulerMode ||
      parsedThreshold !== config?.serialSwitchPercent ||
      draft5hHandoffMode !== config?.serial5hHandoffMode ||
      parsed5hThreshold !== config?.serial5hSwitchPercent ||
      draftWarmupModel.trim() !== config?.warmupModel);
  const selectionDirty = effectiveDraftSerial !== baselineSerialAuth;
  const dirty = configDirty || selectionDirty;
  const eligibleAuthIDs = useMemo(
    () =>
      new Set(
        (status?.snapshots ?? [])
          .filter((snapshot) => snapshot.fresh && snapshot.eligible)
          .map((snapshot) => snapshot.authID)
      ),
    [status?.snapshots]
  );
  const modeOptions = useMemo(
    () =>
      ['serial', 'legacy', 'shadow', 'enforce'].map((value) => ({
        value,
        label: t(`quota_scheduler.mode_${value}`),
      })),
    [t]
  );
  const fiveHourModeOptions = useMemo(
    () =>
      ['inherit_global', 'custom_threshold', 'reserve_aware', '429_only'].map((value) => ({
        value,
        label: t(`quota_scheduler.five_hour_mode_${value}`),
      })),
    [t]
  );
  const modelOptions = useMemo(() => {
    const selected = draftWarmupModel.trim();
    const values = [...new Set([selected, ...modelCandidates].filter(Boolean))];
    return values.map((value) => ({
      value,
      label:
        value === selected && !modelCandidates.includes(value)
          ? `${value} · ${t('quota_scheduler.current_model_unavailable')}`
          : value,
    }));
  }, [draftWarmupModel, modelCandidates, t]);
  const accountOptions = useMemo(() => {
    const eligible = (status?.snapshots ?? []).filter(
      (snapshot) => snapshot.fresh && snapshot.eligible
    );
    const options = [
      { value: AUTO_AUTH, label: t('quota_scheduler.automatic_account') },
      ...eligible.map((snapshot) => ({
        value: snapshot.authID,
        label: `${snapshot.authID} · ${formatPercent(snapshot.usedPercent)} · ${snapshot.window || EMPTY_VALUE}`,
      })),
    ];
    if (
      draftSerialAuth !== AUTO_AUTH &&
      !eligible.some((snapshot) => snapshot.authID === draftSerialAuth)
    ) {
      options.push({
        value: draftSerialAuth,
        label: `${draftSerialAuth} · ${t('quota_scheduler.manual_account_unavailable')}`,
      });
    }
    return options;
  }, [draftSerialAuth, status?.snapshots, t]);

  const resetDraft = () => {
    if (!config) return;
    setDraftMode(config.schedulerMode);
    setDraftThreshold(String(config.serialSwitchPercent));
    setDraft5hHandoffMode(config.serial5hHandoffMode);
    setDraft5hThreshold(String(config.serial5hSwitchPercent));
    setDraftWarmupModel(config.warmupModel);
    setDraftSerialAuth(baselineSerialAuth);
    setError('');
  };

  const validateDraft = (): string => {
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 1 || parsedThreshold > 100) {
      return t('quota_scheduler.invalid_threshold');
    }
    if (
      !Number.isFinite(parsed5hThreshold) ||
      parsed5hThreshold < 1 ||
      parsed5hThreshold > 100
    ) {
      return t('quota_scheduler.invalid_5h_threshold');
    }
    const warmupModel = draftWarmupModel.trim();
    if (!warmupModel) return t('quota_scheduler.model_required');
    if (warmupModel.length > 256 || !/^[A-Za-z0-9._:/-]+$/.test(warmupModel)) {
      return t('quota_scheduler.invalid_model_id');
    }
    if (effectiveDraftSerial !== AUTO_AUTH && !eligibleAuthIDs.has(effectiveDraftSerial)) {
      return t('quota_scheduler.account_not_eligible');
    }
    return '';
  };

  const performSave = async () => {
    const validation = validateDraft();
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError('');
    let writeApplied = false;
    try {
      if (configDirty) {
        const patch: Parameters<typeof pluginsApi.patchQuotaSchedulerConfig>[0] = {};
        if (draftMode !== config?.schedulerMode) patch.schedulerMode = draftMode;
        if (parsedThreshold !== config?.serialSwitchPercent) {
          patch.serialSwitchPercent = parsedThreshold;
        }
        if (draft5hHandoffMode !== config?.serial5hHandoffMode) {
          patch.serial5hHandoffMode = draft5hHandoffMode;
        }
        if (parsed5hThreshold !== config?.serial5hSwitchPercent) {
          patch.serial5hSwitchPercent = parsed5hThreshold;
        }
        if (draftWarmupModel.trim() !== config?.warmupModel) {
          patch.warmupModel = draftWarmupModel.trim();
        }
        await pluginsApi.patchQuotaSchedulerConfig(patch);
        writeApplied = true;
      }
      if (selectionDirty) {
        if (effectiveDraftSerial === AUTO_AUTH) {
          await pluginsApi.clearQuotaSchedulerSerialActive();
        } else {
          await pluginsApi.setQuotaSchedulerSerialActive(effectiveDraftSerial);
        }
        writeApplied = true;
      }
      const refreshed = await loadDashboard(false);
      if (!refreshed) {
        showNotification(t('quota_scheduler.partial_save'), 'warning');
        return;
      }
      showNotification(t('quota_scheduler.changes_saved'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err, t('quota_scheduler.save_failed'));
      if (writeApplied) {
        await loadDashboard(false);
        showNotification(`${t('quota_scheduler.partial_save')}: ${message}`, 'warning');
      } else {
        setError(message);
        showNotification(`${t('quota_scheduler.save_failed')}: ${message}`, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const requestSave = () => {
    if (!dirty || saving) return;
    const validation = validateDraft();
    if (validation) {
      setError(validation);
      return;
    }
    if (selectionDirty || draftMode !== config?.schedulerMode) {
      showConfirmation({
        title: t('quota_scheduler.confirm_routing_title'),
        message: t('quota_scheduler.confirm_routing_message'),
        confirmText: t('quota_scheduler.apply_changes'),
        onConfirm: performSave,
      });
      return;
    }
    void performSave();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      requestSave();
    }
  };

  const warmupSummary = useMemo(() => {
    const warmups = status?.warmups ?? [];
    const latest = latestWarmup(warmups);
    const successes = warmups.filter((item) => item.status >= 200 && item.status < 300).length;
    return { latest, successes, total: warmups.length };
  }, [status?.warmups]);
  const rawSwitchReason = status?.serialLastSwitchReason.trim() ?? '';
  const switchReasonKey = SWITCH_REASON_KEYS[rawSwitchReason];
  const localizedSwitchReason = switchReasonKey
    ? t(switchReasonKey)
    : rawSwitchReason || EMPTY_VALUE;

  return (
    <div className={styles.page} onKeyDown={handleKeyDown}>
      <header className={styles.pageHeader}>
        <div className={styles.headerCopy}>
          <div className={styles.eyebrow}>{t('quota_scheduler.plugin_label')}</div>
          <h1 className={styles.title}>{t('quota_scheduler.title')}</h1>
          <p className={styles.description}>{t('quota_scheduler.description')}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void loadDashboard(true)}
          loading={loading}
          disabled={!connected || saving || dirty}
        >
          <IconRefreshCw size={15} />
          {t('quota_scheduler.refresh')}
        </Button>
      </header>

      {error ? (
        <div className={styles.errorBox} role="alert">
          {error}
        </div>
      ) : null}

      {status?.lastError ? (
        <div className={styles.warningBox} role="status">
          <strong>{t('quota_scheduler.last_error')}:</strong> {status.lastError}
        </div>
      ) : null}

      {loading && !status ? (
        <div className={styles.loadingPanel}>{t('common.loading')}</div>
      ) : status && config ? (
        <>
          <section className={styles.controlPanel} aria-busy={saving}>
            <div className={styles.controlHeader}>
              <div>
                <div className={styles.controlKicker}>{t('quota_scheduler.hot_apply_note')}</div>
                <h2>{t('quota_scheduler.controls_title')}</h2>
                <p>{t('quota_scheduler.controls_description')}</p>
              </div>
              <StatusBadge active={!dirty}>
                {dirty
                  ? t('quota_scheduler.unsaved_changes')
                  : t('quota_scheduler.settings_current')}
              </StatusBadge>
            </div>

            <div className={styles.controlGrid}>
              <div className={styles.controlField}>
                <label id={'scheduler-mode-label'}>{t('quota_scheduler.scheduler_mode')}</label>
                <Select
                  value={draftMode}
                  options={modeOptions}
                  onChange={setDraftMode}
                  disabled={saving}
                  ariaLabelledBy={'scheduler-mode-label'}
                  fullWidth
                />
                <p>{t(`quota_scheduler.mode_${draftMode}_hint`)}</p>
              </div>

              <div className={styles.controlField}>
                <label htmlFor={'scheduler-threshold'}>{t('quota_scheduler.switch_threshold')}</label>
                <div className={styles.thresholdControl}>
                  <input
                    className={styles.range}
                    type={'range'}
                    min={'1'}
                    max={'100'}
                    step={'1'}
                    value={Number.isFinite(parsedThreshold) ? parsedThreshold : 98}
                    onChange={(event) => setDraftThreshold(event.target.value)}
                    disabled={saving}
                    aria-label={t('quota_scheduler.switch_threshold')}
                  />
                  <Input
                    id={'scheduler-threshold'}
                    type={'number'}
                    min={'1'}
                    max={'100'}
                    step={'1'}
                    value={draftThreshold}
                    onChange={(event) => setDraftThreshold(event.target.value)}
                    disabled={saving}
                    rightElement={<span className={styles.unit}>%</span>}
                    aria-describedby={'scheduler-threshold-hint'}
                  />
                </div>
                <p id={'scheduler-threshold-hint'}>
                  {t('quota_scheduler.switch_threshold_hint')}
                </p>
              </div>

              <div className={styles.controlField}>
                <label id={'five-hour-mode-label'}>{t('quota_scheduler.five_hour_policy')}</label>
                <Select
                  value={draft5hHandoffMode}
                  options={fiveHourModeOptions}
                  onChange={setDraft5hHandoffMode}
                  disabled={saving}
                  ariaLabelledBy={'five-hour-mode-label'}
                  fullWidth
                />
                <p>{t(`quota_scheduler.five_hour_mode_${draft5hHandoffMode}_hint`)}</p>
              </div>

              <div className={styles.controlField}>
                <label htmlFor={'five-hour-threshold'}>
                  {t('quota_scheduler.five_hour_threshold')}
                </label>
                <div className={styles.thresholdControl}>
                  <input
                    className={styles.range}
                    type={'range'}
                    min={'1'}
                    max={'100'}
                    step={'1'}
                    value={Number.isFinite(parsed5hThreshold) ? parsed5hThreshold : 98}
                    onChange={(event) => setDraft5hThreshold(event.target.value)}
                    disabled={saving || !fiveHourThresholdEnabled}
                    aria-label={t('quota_scheduler.five_hour_threshold')}
                  />
                  <Input
                    id={'five-hour-threshold'}
                    type={'number'}
                    min={'1'}
                    max={'100'}
                    step={'1'}
                    value={draft5hThreshold}
                    onChange={(event) => setDraft5hThreshold(event.target.value)}
                    disabled={saving || !fiveHourThresholdEnabled}
                    rightElement={<span className={styles.unit}>%</span>}
                    aria-describedby={'five-hour-threshold-hint'}
                  />
                </div>
                <p id={'five-hour-threshold-hint'}>
                  {fiveHourThresholdEnabled
                    ? t('quota_scheduler.five_hour_threshold_hint')
                    : t('quota_scheduler.five_hour_threshold_disabled_hint')}
                </p>
              </div>

              <div className={styles.controlField}>
                <label id={'warmup-model-label'}>{t('quota_scheduler.warmup_model')}</label>
                <Select
                  value={draftWarmupModel.trim()}
                  options={modelOptions}
                  onChange={setDraftWarmupModel}
                  disabled={saving || modelsLoading || modelOptions.length === 0}
                  ariaLabelledBy={'warmup-model-label'}
                  placeholder={
                    modelsLoading ? t('quota_scheduler.model_catalog_loading') : undefined
                  }
                  fullWidth
                />
                <Input
                  value={draftWarmupModel}
                  onChange={(event) => setDraftWarmupModel(event.target.value)}
                  disabled={saving}
                  aria-label={t('quota_scheduler.custom_model')}
                  placeholder={'model-id'}
                />
                <p className={modelError ? styles.fieldWarning : undefined}>
                  {modelError || t('quota_scheduler.warmup_model_hint')}
                </p>
              </div>

              <div className={styles.controlField}>
                <label id={'serial-account-label'}>{t('quota_scheduler.serial_account')}</label>
                <Select
                  value={draftSerialAuth}
                  options={accountOptions}
                  onChange={setDraftSerialAuth}
                  disabled={saving || draftMode !== 'serial'}
                  ariaLabelledBy={'serial-account-label'}
                  fullWidth
                />
                <p>
                  {draftMode === 'serial'
                    ? t('quota_scheduler.serial_account_hint')
                    : t('quota_scheduler.serial_account_disabled')}
                </p>
              </div>
            </div>

            <div className={styles.controlFooter}>
              <div className={styles.applyState} role={'status'} aria-live={'polite'}>
                {saving
                  ? t('quota_scheduler.applying')
                  : dirty
                    ? t('quota_scheduler.unsaved_hint')
                    : t('quota_scheduler.hot_apply_note')}
              </div>
              <div className={styles.controlActions}>
                <Button variant={'secondary'} onClick={resetDraft} disabled={!dirty || saving}>
                  {t('quota_scheduler.discard_changes')}
                </Button>
                <Button onClick={requestSave} disabled={!dirty || saving} loading={saving}>
                  {t('quota_scheduler.apply_changes')}
                </Button>
              </div>
            </div>
          </section>

          <div className={styles.summaryGrid}>
            <SummaryCard
              label={t('quota_scheduler.runtime')}
              value={
                <StatusBadge active={status.enabled}>
                  {status.enabled ? t('quota_scheduler.enabled') : t('quota_scheduler.disabled')}
                </StatusBadge>
              }
              detail={`${t('quota_scheduler.mode')}: ${status.schedulerMode || EMPTY_VALUE}`}
            />
            <SummaryCard
              label={t('quota_scheduler.active_account')}
              value={status.serialActiveAuthID || t('quota_scheduler.not_selected')}
              detail={`${
                status.serialSelectionSource === 'manual'
                  ? t('quota_scheduler.manual_account')
                  : t('quota_scheduler.automatic_account')
              } · ${t('quota_scheduler.selected_at')}: ${formatDateTime(status.serialSelectedAt)}`}
            />
            <SummaryCard
              label={t('quota_scheduler.keeper_snapshots')}
              value={status.freshSnapshots}
              detail={`${t('quota_scheduler.last_refresh')}: ${formatDateTime(status.lastRefresh)}`}
            />
            <SummaryCard
              label={t('quota_scheduler.quarantine')}
              value={status.quarantine.total}
              detail={`${t('quota_scheduler.total_429s')}: ${status.quarantine.total429s}`}
            />
          </div>

          <div className={styles.detailGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>{t('quota_scheduler.serial_policy')}</h2>
                <StatusBadge active={status.schedulerMode === 'serial'}>
                  {status.schedulerMode || EMPTY_VALUE}
                </StatusBadge>
              </div>
              <dl className={styles.definitionList}>
                <div>
                  <dt>{t('quota_scheduler.switch_threshold')}</dt>
                  <dd>{formatPercent(status.serialSwitchPercent)}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.five_hour_policy')}</dt>
                  <dd>{t(`quota_scheduler.five_hour_mode_${config.serial5hHandoffMode}`)}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.five_hour_threshold')}</dt>
                  <dd>{formatPercent(config.serial5hSwitchPercent)}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.switch_count')}</dt>
                  <dd>{status.serialSwitches}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.provisional_fallback_requests')}</dt>
                  <dd>{status.serialProvisionalFallbacks}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.provisional_account')}</dt>
                  <dd>{status.serialProvisionalAuthID || EMPTY_VALUE}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.candidate_missing_since')}</dt>
                  <dd>{formatDateTime(status.serialCandidateMissingSince)}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.candidate_missing_confirmations')}</dt>
                  <dd>{status.serialCandidateMissingConfirmations}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.last_switch')}</dt>
                  <dd>{formatDateTime(status.serialLastSwitchAt)}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.last_switch_reason')}</dt>
                  <dd>{localizedSwitchReason}</dd>
                </div>
              </dl>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>{t('quota_scheduler.warmup')}</h2>
                <StatusBadge active={status.warmupEnabled}>
                  {status.warmupEnabled
                    ? t('quota_scheduler.enabled')
                    : t('quota_scheduler.disabled')}
                </StatusBadge>
              </div>
              <dl className={styles.definitionList}>
                <div>
                  <dt>{t('quota_scheduler.warmup_model')}</dt>
                  <dd>{status.warmupModel || config.warmupModel || EMPTY_VALUE}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.successful_warmups')}</dt>
                  <dd>
                    {warmupSummary.successes} / {warmupSummary.total}
                  </dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.latest_warmup_account')}</dt>
                  <dd>{warmupSummary.latest?.authID || EMPTY_VALUE}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.latest_warmup_time')}</dt>
                  <dd>{formatDateTime(warmupSummary.latest?.activatedAt || '')}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.latest_warmup_status')}</dt>
                  <dd>{warmupSummary.latest?.status || EMPTY_VALUE}</dd>
                </div>
              </dl>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>{t('quota_scheduler.quarantine_details')}</h2>
              </div>
              <dl className={styles.definitionList}>
                <div>
                  <dt>{t('quota_scheduler.cooldown')}</dt>
                  <dd>{status.quarantine.cooldown}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.probation')}</dt>
                  <dd>{status.quarantine.probation}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.half_open')}</dt>
                  <dd>{status.quarantine.halfOpen}</dd>
                </div>
                <div>
                  <dt>{t('quota_scheduler.probe_successes')}</dt>
                  <dd>
                    {status.quarantine.probeSuccesses} / {status.quarantine.probeStarts}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <section className={`${styles.panel} ${styles.accountsPanel}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2>{t('quota_scheduler.accounts')}</h2>
                <p>{t('quota_scheduler.accounts_description')}</p>
              </div>
              <span className={styles.countPill}>{status.snapshots.length}</span>
            </div>
            <SnapshotTable snapshots={status.snapshots} />
          </section>

          <div className={styles.securityNote}>{t('quota_scheduler.security_note')}</div>
        </>
      ) : null}
    </div>
  );
}
