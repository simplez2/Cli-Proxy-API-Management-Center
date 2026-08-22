import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { authFilesApi } from '@/services/api';
import { apiClient } from '@/services/api/client';
import { useNotificationStore } from '@/stores';
import { getErrorMessage } from '@/utils/helpers';
import {
  buildQuotaSchedulerConfigPatch,
  isValidWarmupModelId,
  normalizeQuotaSchedulerConfig,
  type QuotaSchedulerConfig,
  type QuotaSchedulerStatus,
} from './quotaSchedulerManagement';
import styles from './QuotaSchedulerControls.module.scss';

const AUTO_AUTH = '';
const MODES = ['serial', 'legacy', 'shadow', 'enforce'] as const;

interface QuotaSchedulerControlsProps {
  connected: boolean;
  status: QuotaSchedulerStatus;
  onSaved: () => Promise<void>;
}

export function QuotaSchedulerControls({
  connected,
  status,
  onSaved,
}: QuotaSchedulerControlsProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const [config, setConfig] = useState<QuotaSchedulerConfig | null>(null);
  const [baselineSerialAuth, setBaselineSerialAuth] = useState(AUTO_AUTH);
  const [draftMode, setDraftMode] = useState('serial');
  const [draftThreshold, setDraftThreshold] = useState('98');
  const [draftWarmupModel, setDraftWarmupModel] = useState('');
  const [draftSerialAuth, setDraftSerialAuth] = useState(AUTO_AUTH);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modelCandidates, setModelCandidates] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelError, setModelError] = useState('');

  const statusManualAuth =
    status.serialSelectionSource === 'manual'
      ? status.serialManualActiveAuthId || status.activeAuthId || AUTO_AUTH
      : AUTO_AUTH;

  const loadConfig = useCallback(async () => {
    if (!connected) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const nextConfig = normalizeQuotaSchedulerConfig(
        await apiClient.get('/plugins/codex-quota-scheduler/config')
      );
      setConfig(nextConfig);
      setBaselineSerialAuth(statusManualAuth);
      setDraftMode(nextConfig.schedulerMode);
      setDraftThreshold(String(nextConfig.serialSwitchPercent));
      setDraftWarmupModel(nextConfig.warmupModel);
      setDraftSerialAuth(statusManualAuth);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('plugin_resource.scheduler_controls_load_failed')));
    } finally {
      setLoading(false);
    }
  }, [connected, statusManualAuth, t]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const parsedThreshold = Number(draftThreshold);
  const effectiveSerialAuth = draftMode === 'serial' ? draftSerialAuth : AUTO_AUTH;
  const configDirty =
    Boolean(config) &&
    (draftMode !== config?.schedulerMode ||
      parsedThreshold !== config?.serialSwitchPercent ||
      draftWarmupModel.trim() !== config?.warmupModel);
  const selectionDirty = effectiveSerialAuth !== baselineSerialAuth;
  const dirty = configDirty || selectionDirty;

  const eligibleSnapshots = useMemo(
    () => status.snapshots.filter((snapshot) => snapshot.fresh && snapshot.eligible),
    [status.snapshots]
  );
  const eligibleAuthIds = useMemo(
    () => new Set(eligibleSnapshots.map((snapshot) => snapshot.authId)),
    [eligibleSnapshots]
  );
  const selectedSnapshot = status.snapshots.find(
    (snapshot) => snapshot.authId === (draftSerialAuth || status.activeAuthId)
  );
  const modelSource =
    selectedSnapshot?.modelSource ||
    status.snapshots.find((snapshot) => snapshot.authId === status.activeAuthId)?.modelSource ||
    eligibleSnapshots[0]?.modelSource ||
    '';

  useEffect(() => {
    let cancelled = false;
    setModelCandidates([]);
    setModelError('');
    if (!connected || !modelSource) {
      setModelsLoading(false);
      return;
    }
    setModelsLoading(true);
    authFilesApi
      .getModelsForAuthFile(modelSource)
      .then((models) => {
        if (cancelled) return;
        setModelCandidates(
          [...new Set(models.map((model) => String(model.id || '').trim()).filter(Boolean))].sort(
            (left, right) => left.localeCompare(right)
          )
        );
      })
      .catch(() => {
        if (!cancelled) setModelError(t('plugin_resource.scheduler_model_catalog_failed'));
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, modelSource, t]);

  const modeOptions = useMemo(
    () =>
      MODES.map((mode) => ({
        value: mode,
        label: t(`plugin_resource.scheduler_mode_${mode}`),
      })),
    [t]
  );
  const modelOptions = useMemo(() => {
    const selected = draftWarmupModel.trim();
    return [...new Set([selected, ...modelCandidates].filter(Boolean))].map((model) => ({
      value: model,
      label:
        model === selected && !modelCandidates.includes(model)
          ? `${model} · ${t('plugin_resource.scheduler_model_custom')}`
          : model,
    }));
  }, [draftWarmupModel, modelCandidates, t]);
  const accountOptions = useMemo(() => {
    const options = [
      { value: AUTO_AUTH, label: t('plugin_resource.scheduler_account_auto') },
      ...eligibleSnapshots.map((snapshot) => ({
        value: snapshot.authId,
        label: `${snapshot.label} · ${snapshot.window || '—'} · ${
          snapshot.usedPercent === null ? '—' : `${snapshot.usedPercent}%`
        }`,
      })),
    ];
    if (
      draftSerialAuth !== AUTO_AUTH &&
      !eligibleSnapshots.some((snapshot) => snapshot.authId === draftSerialAuth)
    ) {
      options.push({
        value: draftSerialAuth,
        label: `${draftSerialAuth} · ${t('plugin_resource.scheduler_account_unavailable')}`,
      });
    }
    return options;
  }, [draftSerialAuth, eligibleSnapshots, t]);

  const validate = () => {
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 1 || parsedThreshold > 100) {
      return t('plugin_resource.scheduler_threshold_invalid');
    }
    if (!draftWarmupModel.trim() && draftWarmupModel.trim() !== config?.warmupModel) {
      return t('plugin_resource.scheduler_model_required');
    }
    if (draftWarmupModel.trim() && !isValidWarmupModelId(draftWarmupModel)) {
      return t('plugin_resource.scheduler_model_invalid');
    }
    if (effectiveSerialAuth !== AUTO_AUTH && !eligibleAuthIds.has(effectiveSerialAuth)) {
      return t('plugin_resource.scheduler_account_invalid');
    }
    return '';
  };

  const resetDraft = () => {
    if (!config) return;
    setDraftMode(config.schedulerMode);
    setDraftThreshold(String(config.serialSwitchPercent));
    setDraftWarmupModel(config.warmupModel);
    setDraftSerialAuth(baselineSerialAuth);
    setError('');
  };

  const performSave = async () => {
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError('');
    let writeApplied = false;
    try {
      if (configDirty && config) {
        const patch = buildQuotaSchedulerConfigPatch(config, {
          schedulerMode: draftMode,
          serialSwitchPercent: parsedThreshold,
          warmupModel: draftWarmupModel.trim(),
        });
        await apiClient.patch('/plugins/codex-quota-scheduler/config', patch);
        writeApplied = true;
      }
      if (selectionDirty) {
        if (effectiveSerialAuth === AUTO_AUTH) {
          await apiClient.delete('/plugins/codex-quota-scheduler/serial-active');
        } else {
          await apiClient.put('/plugins/codex-quota-scheduler/serial-active', {
            auth_id: effectiveSerialAuth,
          });
        }
        writeApplied = true;
      }
      await onSaved();
      await loadConfig();
      showNotification(t('plugin_resource.scheduler_controls_saved'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err, t('plugin_resource.scheduler_controls_save_failed'));
      if (writeApplied) {
        await onSaved().catch(() => undefined);
        await loadConfig().catch(() => undefined);
        showNotification(
          `${t('plugin_resource.scheduler_controls_partial')}: ${message}`,
          'warning'
        );
      } else {
        setError(message);
        showNotification(message, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const requestSave = () => {
    if (!dirty || saving) return;
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    showConfirmation({
      title: t('plugin_resource.scheduler_controls_confirm_title'),
      message: t('plugin_resource.scheduler_controls_confirm_message'),
      confirmText: t('plugin_resource.scheduler_controls_apply'),
      onConfirm: performSave,
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      requestSave();
    }
  };

  return (
    <section className={styles.controls} onKeyDown={handleKeyDown} aria-busy={saving}>
      <header className={styles.header}>
        <div>
          <span>{t('plugin_resource.scheduler_controls_kicker')}</span>
          <h2>{t('plugin_resource.scheduler_controls_title')}</h2>
          <p>{t('plugin_resource.scheduler_controls_desc')}</p>
        </div>
        <strong className={dirty ? styles.dirty : styles.synced}>
          {dirty
            ? t('plugin_resource.scheduler_controls_unsaved')
            : t('plugin_resource.scheduler_controls_synced')}
        </strong>
      </header>

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}
      {loading && !config ? (
        <div className={styles.loading}>{t('common.loading')}</div>
      ) : config ? (
        <>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label id="scheduler-mode-control-label">{t('plugin_resource.scheduler_mode')}</label>
              <Select
                value={draftMode}
                options={modeOptions}
                onChange={setDraftMode}
                disabled={saving}
                ariaLabelledBy="scheduler-mode-control-label"
              />
              <p>{t(`plugin_resource.scheduler_mode_${draftMode}_hint`)}</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="scheduler-threshold-control">
                {t('plugin_resource.scheduler_switch_threshold')}
              </label>
              <div className={styles.threshold}>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={Number.isFinite(parsedThreshold) ? parsedThreshold : 98}
                  onChange={(event) => setDraftThreshold(event.target.value)}
                  disabled={saving}
                  aria-label={t('plugin_resource.scheduler_switch_threshold')}
                />
                <Input
                  id="scheduler-threshold-control"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={draftThreshold}
                  onChange={(event) => setDraftThreshold(event.target.value)}
                  disabled={saving}
                  rightElement={<span className={styles.unit}>%</span>}
                />
              </div>
              <p>{t('plugin_resource.scheduler_threshold_hint')}</p>
            </div>

            <div className={styles.field}>
              <label id="scheduler-warmup-model-label">
                {t('plugin_resource.scheduler_warmup_model')}
              </label>
              <Select
                value={draftWarmupModel.trim()}
                options={modelOptions}
                onChange={setDraftWarmupModel}
                disabled={saving || modelsLoading || modelOptions.length === 0}
                placeholder={
                  modelsLoading ? t('plugin_resource.scheduler_model_catalog_loading') : undefined
                }
                ariaLabelledBy="scheduler-warmup-model-label"
              />
              <Input
                value={draftWarmupModel}
                onChange={(event) => setDraftWarmupModel(event.target.value)}
                disabled={saving}
                aria-label={t('plugin_resource.scheduler_custom_model')}
                placeholder="model-id"
              />
              <p className={modelError ? styles.warning : undefined}>
                {modelError || t('plugin_resource.scheduler_warmup_model_hint')}
              </p>
            </div>

            <div className={styles.field}>
              <label id="scheduler-account-control-label">
                {t('plugin_resource.scheduler_serial_account')}
              </label>
              <Select
                value={draftSerialAuth}
                options={accountOptions}
                onChange={setDraftSerialAuth}
                disabled={saving || draftMode !== 'serial'}
                ariaLabelledBy="scheduler-account-control-label"
              />
              <p>
                {draftMode === 'serial'
                  ? t('plugin_resource.scheduler_serial_account_hint')
                  : t('plugin_resource.scheduler_serial_account_disabled')}
              </p>
            </div>
          </div>

          <footer className={styles.footer}>
            <p>{t('plugin_resource.scheduler_controls_direct_write_note')}</p>
            <div>
              <Button variant="secondary" onClick={resetDraft} disabled={!dirty || saving}>
                {t('plugin_resource.scheduler_controls_discard')}
              </Button>
              <Button onClick={requestSave} loading={saving} disabled={!dirty || saving}>
                {t('plugin_resource.scheduler_controls_apply')}
              </Button>
            </div>
          </footer>
        </>
      ) : null}
    </section>
  );
}
