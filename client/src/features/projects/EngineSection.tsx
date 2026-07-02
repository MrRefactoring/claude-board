import { Cog, ShieldBan, BadgeCheck } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import type { Model } from '@/lib/types';
import { Section, Field, ToggleRow } from './formControls';
import type { ProjectForm } from './useProjectForm';

// ─── Engine ──
export default function EngineSection({ form }: { form: ProjectForm }) {
  const { t } = useTranslation();
  const {
    maxAutoRevisions,
    setMaxAutoRevisions,
    autoTestModel,
    setAutoTestModel,
    retryBaseDelay,
    setRetryBaseDelay,
    retryMaxDelay,
    setRetryMaxDelay,
    circuitBreakerThreshold,
    setCircuitBreakerThreshold,
    requireApproval,
    setRequireApproval,
    availableModels,
  } = form;
  return (
    <div className="space-y-4">
      <Section title={t('projectModal.engineSettings')} icon={Cog} desc={t('projectModal.engineSettingsDesc')}>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('projectModal.maxAutoRevisions')}>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={maxAutoRevisions || ''}
                  onChange={(e) => setMaxAutoRevisions(parseInt(e.target.value) || 0)}
                  placeholder="3"
                  className="input-field w-20"
                />
                <span className="text-xs text-surface-500">{t('projectModal.default3')}</span>
              </div>
            </Field>
            <Field label={t('projectModal.autoTestModel')}>
              <select
                value={autoTestModel || ''}
                onChange={(e) => setAutoTestModel(e.target.value)}
                className="input-field"
              >
                <option value="">{t('projectModal.defaultSonnet')}</option>
                {availableModels.map((m: Model) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                    {m.source === 'custom' ? ' (custom)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('projectModal.retryBaseDelay')}>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={retryBaseDelay || ''}
                  onChange={(e) => setRetryBaseDelay(parseInt(e.target.value) || 0)}
                  placeholder="30"
                  className="input-field w-20"
                />
                <span className="text-xs text-surface-500">{t('projectModal.secondsDefault30')}</span>
              </div>
            </Field>
            <Field label={t('projectModal.retryMaxDelay')}>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={7200}
                  value={retryMaxDelay || ''}
                  onChange={(e) => setRetryMaxDelay(parseInt(e.target.value) || 0)}
                  placeholder="600"
                  className="input-field w-20"
                />
                <span className="text-xs text-surface-500">{t('projectModal.secondsDefault600')}</span>
              </div>
            </Field>
          </div>
        </div>
      </Section>

      {/* Circuit Breaker */}
      <Section title={t('projectModal.circuitBreaker')} icon={ShieldBan} desc={t('projectModal.circuitBreakerDesc')}>
        <Field label={t('projectModal.circuitBreakerThreshold')} hint={t('projectModal.circuitBreakerHint')}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={50}
              value={circuitBreakerThreshold || ''}
              onChange={(e) => setCircuitBreakerThreshold(parseInt(e.target.value) || 0)}
              placeholder="0"
              className="input-field w-20"
            />
            <span className="text-xs text-surface-500">{t('projectModal.failuresDisabled')}</span>
          </div>
        </Field>
      </Section>

      {/* Approval Gate */}
      <Section title={t('projectModal.approvalGate')} icon={BadgeCheck}>
        <ToggleRow
          enabled={requireApproval}
          onToggle={() => setRequireApproval(!requireApproval)}
          label={requireApproval ? t('projectModal.approvalRequired') : t('projectModal.approvalNotRequired')}
          desc={t('projectModal.approvalDesc')}
          activeColor="emerald"
        />
      </Section>
    </div>
  );
}
