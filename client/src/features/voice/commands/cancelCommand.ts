import { registerCommand } from '@/features/voice/commands/commandRegistry';
import type { CommandContext, CommandResult } from '@/features/voice/commands/commandRegistry';
import { t } from '@/features/voice/i18n/t';
import { CANCEL_PATTERNS } from '@/features/voice/i18n/patterns';

registerCommand({
  id: 'cancel',
  patterns: CANCEL_PATTERNS,
  flowStates: [],
  description: 'Cancels the current operation',
  hint: 'Cancel',
  icon: 'x-circle',

  execute(_input: string, ctx: CommandContext): CommandResult | null {
    const { lang } = ctx;
    if (ctx.flow !== 'idle') {
      return { flow: 'idle', draft: {}, message: t('cancel.done', lang) };
    }
    return { flow: 'idle', message: t('cancel.ok', lang) };
  },
});
