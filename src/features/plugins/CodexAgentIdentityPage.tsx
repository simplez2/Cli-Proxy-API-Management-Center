import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import {
  IconCheck,
  IconFileText,
  IconKey,
  IconRefreshCw,
  IconShield,
  IconTrash2,
} from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { pluginsApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type {
  CodexAgentIdentityAction,
  CodexAgentIdentityBatchResponse,
  CodexAgentIdentityListResponse,
  CodexAgentIdentityRecord,
} from '@/types';
import { getErrorMessage } from '@/utils/helpers';
import styles from './CodexAgentIdentityPage.module.scss';

const MAX_IMPORT_BYTES = 1 << 20;

const emptyList: CodexAgentIdentityListResponse = {
  identities: [],
  summary: {
    total: 0,
    active: 0,
    disabled: 0,
    agentIdentity: 0,
    personalAccessToken: 0,
    unsynced: 0,
  },
  channelManagementEnabled: false,
  channelSyncError: '',
};

const formatDate = (value: string): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const redact = (message: string, secret: string): string => {
  const value = secret.trim();
  return value ? message.split(value).join('[已隐藏]') : message;
};

const errorText = (error: unknown, fallback: string, secret = '') =>
  redact(getErrorMessage(error, fallback), secret);

const kindLabel = (kind: string, t: (key: string) => string): string => {
  if (kind === 'personal_access_token') return t('agent_identity.personal_access_token');
  if (kind === 'agent_identity') return t('agent_identity.agent_identity');
  return kind || t('agent_identity.unknown_kind');
};

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <section className={styles.summaryCard}>
      <span className={styles.summaryLabel}>{label}</span>
      <strong className={styles.summaryValue}>{value}</strong>
      <span className={styles.summaryDetail}>{detail}</span>
    </section>
  );
}

function StateBadge({ active, children }: { active: boolean; children: string }) {
  const className =
    styles.stateBadge + ' ' + (active ? styles.stateBadgeActive : styles.stateBadgeMuted);
  return (
    <span className={className}>
      <span className={styles.stateDot} aria-hidden="true" />
      {children}
    </span>
  );
}

export function CodexAgentIdentityPage() {
  const { t } = useTranslation();
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const [data, setData] = useState<CodexAgentIdentityListResponse>(emptyList);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [singleToken, setSingleToken] = useState('');
  const [batchContent, setBatchContent] = useState('');
  const [batchPreview, setBatchPreview] = useState(true);
  const [batchAtomic, setBatchAtomic] = useState(true);
  const [importing, setImporting] = useState(false);
  const [batchResult, setBatchResult] = useState<CodexAgentIdentityBatchResponse | null>(null);
  const [busyID, setBusyID] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!connected) {
      setLoading(false);
      setError(t('notification.connection_required'));
      return;
    }
    setError('');
    try {
      setData(await pluginsApi.listAgentIdentities());
    } catch (err: unknown) {
      setError(errorText(err, t('agent_identity.load_failed')));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [connected, t]);

  useHeaderRefresh(load, connected);
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
  };

  const handleSingleImport = async () => {
    const token = singleToken.trim();
    if (!token) {
      showNotification(t('agent_identity.token_required'), 'error');
      return;
    }
    setImporting(true);
    setBatchResult(null);
    try {
      await pluginsApi.importAgentIdentity(token);
      setSingleToken('');
      showNotification(t('agent_identity.import_success'), 'success');
      await load();
    } catch (err: unknown) {
      showNotification(errorText(err, t('agent_identity.import_failed'), token), 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleBatchImport = async () => {
    const content = batchContent.trim();
    if (!content) {
      showNotification(t('agent_identity.batch_required'), 'error');
      return;
    }
    if (new TextEncoder().encode(content).byteLength > MAX_IMPORT_BYTES) {
      showNotification(t('agent_identity.batch_too_large'), 'error');
      return;
    }
    setImporting(true);
    try {
      const result = await pluginsApi.importAgentIdentitiesBatch(content, {
        preview: batchPreview,
        atomic: batchAtomic,
      });
      setBatchResult(result);
      if (!batchPreview) {
        showNotification(t('agent_identity.batch_import_complete'), 'success');
        await load();
      }
    } catch (err: unknown) {
      showNotification(errorText(err, t('agent_identity.batch_import_failed')), 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showNotification(t('agent_identity.batch_too_large'), 'error');
      return;
    }
    try {
      setBatchContent(await file.text());
      showNotification(t('agent_identity.file_loaded'), 'success');
    } catch (err: unknown) {
      showNotification(errorText(err, t('agent_identity.file_read_failed')), 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runAction = async (
    identity: CodexAgentIdentityRecord,
    action: CodexAgentIdentityAction
  ) => {
    setBusyID(identity.id);
    try {
      await pluginsApi.identityAction(identity.id, action);
      showNotification(t('agent_identity.action_success'), 'success');
      await load();
    } catch (err: unknown) {
      showNotification(errorText(err, t('agent_identity.action_failed')), 'error');
    } finally {
      setBusyID('');
    }
  };

  const confirmDelete = (identity: CodexAgentIdentityRecord) => {
    showConfirmation({
      title: t('agent_identity.delete_title'),
      message: t('agent_identity.delete_message', { id: identity.id }),
      confirmText: t('agent_identity.delete_confirm'),
      variant: 'danger',
      onConfirm: async () => {
        setBusyID(identity.id);
        try {
          await pluginsApi.deleteAgentIdentity(identity.id);
          showNotification(t('agent_identity.delete_success'), 'success');
          await load();
        } catch (err: unknown) {
          showNotification(errorText(err, t('agent_identity.delete_failed')), 'error');
          throw err;
        } finally {
          setBusyID('');
        }
      },
    });
  };

  const summary = data.summary;
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>{t('agent_identity.plugin_label')}</div>
          <h1 className={styles.title}>{t('agent_identity.title')}</h1>
          <p className={styles.description}>{t('agent_identity.description')}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          disabled={!connected}
          loading={refreshing}
        >
          <IconRefreshCw size={15} />
          {t('agent_identity.refresh')}
        </Button>
      </header>
      {loading ? <div className={styles.loadingState}>{t('common.loading')}</div> : null}
      {!loading && error ? (
        <EmptyState title={t('agent_identity.unavailable')} description={error} />
      ) : null}
      {!loading && !error ? (
        <>
          <div className={styles.summaryGrid}>
            <SummaryCard
              label={t('agent_identity.total')}
              value={summary.total}
              detail={t('agent_identity.total_hint')}
            />
            <SummaryCard
              label={t('agent_identity.active')}
              value={summary.active}
              detail={t('agent_identity.active_hint')}
            />
            <SummaryCard
              label={t('agent_identity.disabled')}
              value={summary.disabled}
              detail={t('agent_identity.disabled_hint')}
            />
            <SummaryCard
              label={t('agent_identity.unsynced')}
              value={summary.unsynced}
              detail={t('agent_identity.unsynced_hint')}
            />
          </div>
          <div className={styles.importGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitleWrap}>
                  <span className={styles.featureIcon} aria-hidden="true">
                    <IconKey size={18} />
                  </span>
                  <div>
                    <h2>{t('agent_identity.single_import')}</h2>
                    <p>{t('agent_identity.single_import_hint')}</p>
                  </div>
                </div>
              </div>
              <Input
                label={t('agent_identity.token_label')}
                type="password"
                autoComplete="off"
                value={singleToken}
                onChange={(event) => setSingleToken(event.target.value)}
                placeholder={t('agent_identity.token_placeholder')}
              />
              <div className={styles.actionRow}>
                <Button
                  onClick={handleSingleImport}
                  loading={importing}
                  disabled={!connected || !singleToken.trim()}
                >
                  <IconCheck size={15} />
                  {t('agent_identity.import_one')}
                </Button>
              </div>
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitleWrap}>
                  <span className={styles.featureIcon} aria-hidden="true">
                    <IconFileText size={18} />
                  </span>
                  <div>
                    <h2>{t('agent_identity.batch_import')}</h2>
                    <p>{t('agent_identity.batch_import_hint')}</p>
                  </div>
                </div>
                <label className={styles.fileButton}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.json,.jsonl,application/json,text/plain"
                    onChange={(event) => void handleFile(event.target.files?.[0])}
                  />
                  {t('agent_identity.choose_file')}
                </label>
              </div>
              <textarea
                className={styles.textarea}
                value={batchContent}
                onChange={(event) => setBatchContent(event.target.value)}
                placeholder={t('agent_identity.batch_placeholder')}
                aria-label={t('agent_identity.batch_label')}
                spellCheck={false}
              />
              <div className={styles.optionRow}>
                <label>
                  <input
                    type="checkbox"
                    checked={batchPreview}
                    onChange={(event) => setBatchPreview(event.target.checked)}
                  />{' '}
                  {t('agent_identity.preview')}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={batchAtomic}
                    onChange={(event) => setBatchAtomic(event.target.checked)}
                  />{' '}
                  {t('agent_identity.atomic')}
                </label>
                <span className={styles.byteHint}>{t('agent_identity.batch_limit')}</span>
              </div>
              <div className={styles.actionRow}>
                <Button
                  onClick={handleBatchImport}
                  loading={importing}
                  disabled={!connected || !batchContent.trim()}
                >
                  {batchPreview
                    ? t('agent_identity.preview_batch')
                    : t('agent_identity.import_batch')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setBatchContent('')}
                  disabled={importing || !batchContent}
                >
                  {t('agent_identity.clear')}
                </Button>
              </div>
            </section>
          </div>
          {batchResult ? (
            <section className={styles.resultPanel} aria-live="polite">
              <div className={styles.panelHeader}>
                <div>
                  <h2>
                    {batchResult.preview
                      ? t('agent_identity.preview_result')
                      : t('agent_identity.batch_result')}
                  </h2>
                  <p>{batchResult.transaction || batchResult.status}</p>
                </div>
                <span className={styles.resultSummary}>
                  {t('agent_identity.result_counts', { ...batchResult.summary })}
                </span>
              </div>
              <div className={styles.resultItems}>
                {batchResult.items.map((item) => (
                  <div
                    className={styles.resultItem}
                    key={String(item.index) + '-' + item.identityId}
                  >
                    <span className={styles.resultStatus}>{item.status}</span>
                    <span>{item.label || item.identityId || '#' + item.index}</span>
                    {item.message ? (
                      <span className={styles.resultMessage}>{item.message}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {data.channelSyncError ? (
            <div className={styles.warningPanel}>{data.channelSyncError}</div>
          ) : null}
          <section className={styles.panel + ' ' + styles.identityPanel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitleWrap}>
                <span className={styles.featureIcon} aria-hidden="true">
                  <IconShield size={18} />
                </span>
                <div>
                  <h2>{t('agent_identity.identities')}</h2>
                  <p>{t('agent_identity.identities_hint')}</p>
                </div>
              </div>
              <span className={styles.countPill}>{data.identities.length}</span>
            </div>
            {data.identities.length === 0 ? (
              <div className={styles.emptyState}>{t('agent_identity.no_identities')}</div>
            ) : (
              <div className={styles.tableScroller}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('agent_identity.account')}</th>
                      <th>{t('agent_identity.kind')}</th>
                      <th>{t('agent_identity.plan')}</th>
                      <th>{t('agent_identity.created')}</th>
                      <th>{t('agent_identity.sync')}</th>
                      <th>{t('agent_identity.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.identities.map((identity) => {
                      const rowBusy = busyID === identity.id;
                      return (
                        <tr key={identity.id}>
                          <td className={styles.accountCell} title={identity.id}>
                            <strong>{identity.email || identity.id}</strong>
                            <span>{identity.id}</span>
                          </td>
                          <td>{kindLabel(identity.credentialKind, t)}</td>
                          <td>{identity.planType || '—'}</td>
                          <td>{formatDate(identity.createdAt)}</td>
                          <td>
                            <StateBadge
                              active={identity.channelSynced && !identity.channelDisabled}
                            >
                              {identity.channelDisabled
                                ? t('agent_identity.status_disabled')
                                : identity.channelSynced
                                  ? t('agent_identity.status_synced')
                                  : t('agent_identity.status_unsynced')}
                            </StateBadge>
                          </td>
                          <td>
                            <div className={styles.rowActions}>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  void runAction(
                                    identity,
                                    identity.channelDisabled ? 'enable' : 'disable'
                                  )
                                }
                                disabled={rowBusy || !data.channelManagementEnabled}
                                loading={rowBusy}
                              >
                                {identity.channelDisabled
                                  ? t('agent_identity.enable')
                                  : t('agent_identity.disable')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void runAction(identity, 'refresh')}
                                disabled={rowBusy}
                                loading={rowBusy}
                              >
                                {t('agent_identity.refresh_metadata')}
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => confirmDelete(identity)}
                                disabled={rowBusy}
                                aria-label={t('agent_identity.delete')}
                              >
                                <IconTrash2 size={14} />
                                {t('agent_identity.delete')}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <div className={styles.securityPanel}>
            <IconShield size={18} aria-hidden="true" />
            <span>{t('agent_identity.security_description')}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
