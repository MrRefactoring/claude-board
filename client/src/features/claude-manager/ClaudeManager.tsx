import { useState } from 'react';
import { Server, Plug, Shield, Settings, Users, Webhook, History, Lock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import McpTab from './McpTab';
import PluginsTab from './PluginsTab';
import AgentsTab from './AgentsTab';
import SessionsTab from './SessionsTab';
import PermissionsTab from './PermissionsTab';
import HooksTab from './HooksTab';
import AuthTab from './AuthTab';
import SettingsTab from './SettingsTab';

type Props = Record<string, never>;

const TABS: { id: string; labelKey: string; icon: LucideIcon }[] = [
  { id: 'mcp', labelKey: 'cm.tabs.mcp', icon: Server },
  { id: 'plugins', labelKey: 'cm.tabs.plugins', icon: Plug },
  { id: 'agents', labelKey: 'cm.tabs.agents', icon: Users },
  { id: 'sessions', labelKey: 'cm.tabs.sessions', icon: History },
  { id: 'permissions', labelKey: 'cm.tabs.permissions', icon: Lock },
  { id: 'hooks', labelKey: 'cm.tabs.hooks', icon: Webhook },
  { id: 'auth', labelKey: 'cm.tabs.account', icon: Shield },
  { id: 'settings', labelKey: 'cm.tabs.settings', icon: Settings },
];

export default function ClaudeManager(_props: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('mcp');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 flex-wrap">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          return (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === tb.id ? 'bg-claude/15 text-claude' : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800/50'}`}
            >
              <Icon size={13} /> {t(tb.labelKey)}
            </button>
          );
        })}
      </div>
      {tab === 'mcp' && <McpTab />}
      {tab === 'plugins' && <PluginsTab />}
      {tab === 'agents' && <AgentsTab />}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'permissions' && <PermissionsTab />}
      {tab === 'hooks' && <HooksTab />}
      {tab === 'auth' && <AuthTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}
