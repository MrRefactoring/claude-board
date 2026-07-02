import { FolderOpen, RefreshCw, Settings } from 'lucide-react';
import Avatar from 'boring-avatars';
import { AVATAR_VARIANTS, AVATAR_COLORS } from '@/lib/constants';
import { useTranslation } from '@/i18n/I18nProvider';
import { IS_TAURI } from '@/lib/tauriEvents';
import { Section, Field } from './formControls';
import type { ProjectForm } from './useProjectForm';

type AvatarVariant = 'marble' | 'beam' | 'pixel' | 'sunset' | 'ring' | 'bauhaus' | 'geometric' | 'abstract';

// ─── General ──
export default function GeneralSection({ form }: { form: ProjectForm }) {
  const { t } = useTranslation();
  const {
    name,
    handleNameChange,
    nameRef,
    slug,
    setSlug,
    setAutoSlug,
    workingDir,
    setWorkingDir,
    icon,
    setIcon,
    avatarSeed,
    randomizeSeed,
    prBaseBranch,
    setPrBaseBranch,
  } = form;
  return (
    <div className="space-y-5">
      {/* Identity */}
      <Section title={t('projectModal.projectName')} icon={FolderOpen}>
        <div className="flex gap-4 items-start">
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-xl overflow-hidden ring-2 ring-surface-700">
              <Avatar size={56} name={avatarSeed} variant={icon as AvatarVariant} colors={AVATAR_COLORS} />
            </div>
            <button
              type="button"
              onClick={randomizeSeed}
              className="p-1 rounded-md hover:bg-surface-800 text-surface-500 hover:text-surface-300 transition-colors"
              title={t('projectModal.randomize')}
            >
              <RefreshCw size={12} />
            </button>
          </div>
          <div className="flex-1 space-y-3">
            <Field label={t('projectModal.projectName')}>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={t('projectModal.namePlaceholder')}
                className="input-field"
                required
              />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {AVATAR_VARIANTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setIcon(v)}
                  className={`p-0.5 rounded-lg transition-all ${
                    icon === v ? 'ring-2 ring-claude bg-claude/10' : 'hover:bg-surface-800'
                  }`}
                  title={v}
                >
                  <Avatar size={22} name={avatarSeed} variant={v as AvatarVariant} colors={AVATAR_COLORS} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Project Details */}
      <Section title={t('projectModal.workingDir')} icon={Settings}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('projectModal.slug')}>
            <input
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setAutoSlug(false);
              }}
              placeholder="my-project"
              className="input-field font-mono"
              required
            />
          </Field>
          <Field label={t('projectModal.baseBranch')}>
            <input
              value={prBaseBranch}
              onChange={(e) => setPrBaseBranch(e.target.value)}
              placeholder="main"
              className="input-field font-mono"
            />
          </Field>
        </div>
        <Field label={t('projectModal.workingDir')} hint={t('projectModal.workingDirHint')}>
          <div className="flex gap-2">
            <input
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              placeholder="/home/user/projects/my-project"
              className="input-field font-mono flex-1"
              required
            />
            {IS_TAURI && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { open } = await import('@tauri-apps/plugin-dialog');
                    const selected = await open({ directory: true, multiple: false });
                    if (selected) setWorkingDir(selected);
                  } catch (e) {
                    console.error('Failed to open folder picker:', e);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-surface-800 border border-surface-700 text-surface-400 hover:text-surface-100 hover:bg-surface-700 transition-colors whitespace-nowrap"
              >
                <FolderOpen size={13} />
                {t('projectModal.browse')}
              </button>
            )}
          </div>
        </Field>
      </Section>
    </div>
  );
}
