// ─── Local shapes for the Tauri-only payloads this feature reads ───
// The api methods used by the tabs return Promise<unknown>; these interfaces describe only
// the fields the UI consumes and are applied via casts on the awaited results.

export interface McpServer {
  name: string;
  connected?: boolean;
  status?: string;
  detail?: string;
}

export interface PluginInfo {
  name: string;
  enabled?: boolean;
  version?: string;
  scope?: string;
}
export type Plugin = string | PluginInfo;

export interface Marketplace {
  name: string;
  source?: string;
}

export interface Agent {
  name: string;
  type: string;
  model: string;
}

export interface Session {
  project: string;
  sessionId: string;
  lines: number;
  size: number;
  modified: number;
}

export interface PermissionRules {
  allow?: string[];
  soft_deny?: string[];
  block?: string[];
}

export type HooksConfig = Record<string, unknown>;
export interface HookCommandObj {
  command?: string;
}
export type HookCommand = string | HookCommandObj;

export interface AuthInfo {
  raw?: unknown;
  email?: string;
  subscriptionType?: string;
  orgName?: string;
  authMethod?: string;
  loggedIn?: boolean;
}
