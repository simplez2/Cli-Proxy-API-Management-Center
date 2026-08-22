import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import {
  IconExternalLink,
  IconFileText,
  IconKey,
  IconShield,
} from '@/components/ui/icons';
import { useAuthStore } from '@/stores';
import { buildAgentIdentityManagementURL } from './pluginResources';
import styles from './CodexAgentIdentityPage.module.scss';

export function CodexAgentIdentityPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const connected = connectionStatus === 'connected';
  const managementURL = buildAgentIdentityManagementURL(apiBase);

  const openManagement = () => {
    window.open(managementURL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>{t('agent_identity.plugin_label')}</div>
          <h1 className={styles.title}>{t('agent_identity.title')}</h1>
          <p className={styles.description}>{t('agent_identity.description')}</p>
        </div>
      </header>

      <section className={styles.launchPanel}>
        <div className={styles.launchCopy}>
          <span className={styles.statusBadge}>
            <span className={styles.statusDot} aria-hidden />
            {t('agent_identity.enabled')}
          </span>
          <h2>{t('agent_identity.ready_title')}</h2>
          <p>{t('agent_identity.ready_description')}</p>
        </div>
        <div className={styles.launchAction}>
          <Button onClick={openManagement} disabled={!connected}>
            <IconExternalLink size={16} />
            {t('agent_identity.open_management')}
          </Button>
          <span>{t('agent_identity.opens_separately')}</span>
        </div>
      </section>

      <div className={styles.featureGrid}>
        <section className={styles.featureCard}>
          <span className={styles.featureIcon} aria-hidden>
            <IconKey size={20} />
          </span>
          <h2>{t('agent_identity.auth_title')}</h2>
          <p>{t('agent_identity.auth_description')}</p>
        </section>

        <section className={styles.featureCard}>
          <span className={styles.featureIcon} aria-hidden>
            <IconFileText size={20} />
          </span>
          <h2>{t('agent_identity.batch_title')}</h2>
          <p>{t('agent_identity.batch_description')}</p>
        </section>

        <section className={styles.featureCard}>
          <span className={styles.featureIcon} aria-hidden>
            <IconShield size={20} />
          </span>
          <h2>{t('agent_identity.lifecycle_title')}</h2>
          <p>{t('agent_identity.lifecycle_description')}</p>
        </section>
      </div>

      <section className={styles.securityPanel}>
        <span className={styles.securityIcon} aria-hidden>
          <IconShield size={20} />
        </span>
        <div>
          <h2>{t('agent_identity.security_title')}</h2>
          <p>{t('agent_identity.security_description')}</p>
        </div>
      </section>
    </div>
  );
}
