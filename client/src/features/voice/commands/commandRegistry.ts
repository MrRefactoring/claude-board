/**
 * Central command registry with plugin architecture.
 * Commands register themselves at import time.
 */

import type { Task, Project, TaskStatus } from '@/lib/types';

/** A parsed user intent — a command/conversational id plus the cleaned text. */
export interface Intent {
  id: string;
  text: string;
}

/** In-progress task being assembled across a create-task flow. */
export interface TaskDraft {
  title?: string;
  description?: string;
  task_type?: string;
  priority?: number;
}

/** Payload handed to the app when a create-task flow completes. */
export interface NewTaskInput {
  title: string;
  description: string;
  task_type: string;
  priority: number;
  model: string;
}

/** Side-effect callbacks a command result can invoke against the host app. */
export interface CommandHandlers {
  onCreateTask?: (task: NewTaskInput) => void;
  onStatusChange?: (taskId: number, status: TaskStatus) => void;
}

/** Mutable per-session scratch space shared with commands (e.g. statusTarget). */
export interface CommandRefs {
  statusTarget?: Task | null;
}

/** Execution context passed to every command's `execute`. */
export interface CommandContext {
  /** Current flow state. */
  flow: string;
  /** Mutable refs (e.g. statusTarget). */
  refs: CommandRefs;
  /** Current draft data. */
  draft?: TaskDraft;
  /** Parsed intent. */
  intent?: Intent | null;
  /** Current tasks array. */
  tasks?: Task[];
  /** Active project. */
  currentProject?: Project | null;
  /** Active voice language code (e.g. 'en-US'). */
  lang?: string;
}

/** Value a command returns to drive the next turn. */
export interface CommandResult {
  /** Next flow state ('idle' to end). */
  flow: string;
  /** Updated draft. */
  draft?: TaskDraft;
  /** Assistant response text. */
  message?: string;
  /** Side-effect callback. */
  action?: (handlers: CommandHandlers) => void;
}

/** A registered voice command. */
export interface VoiceCommand {
  /** Unique command identifier. */
  id: string;
  /** Intent patterns that trigger this command. */
  patterns: RegExp[];
  /** Flow states this command owns. */
  flowStates?: string[];
  /** Human-readable description. */
  description: string;
  /** Short hint shown in UI. */
  hint: string;
  /** Lucide icon name for hints. */
  icon?: string;
  execute: (input: string, ctx: CommandContext) => CommandResult | null;
}

const _commands: VoiceCommand[] = [];
const _flowOwners = new Map<string, string>();

/**
 * Register a command. Called at module load time.
 */
export function registerCommand(command: VoiceCommand): void {
  if (_commands.some((c) => c.id === command.id)) return; // idempotent

  // Validate flow state uniqueness
  for (const state of command.flowStates || []) {
    if (_flowOwners.has(state)) {
      console.warn(`Flow state "${state}" already owned by "${_flowOwners.get(state)}"`);
    }
    _flowOwners.set(state, command.id);
  }

  _commands.push(command);
}

/**
 * Resolve which command should handle current input.
 * Priority: active flow owner > pattern match > null
 */
export function resolveCommand(intent: Intent | null, currentFlow: string): VoiceCommand | null {
  // If we're in an active flow, the owning command handles it
  if (currentFlow !== 'idle') {
    const ownerId = _flowOwners.get(currentFlow);
    if (ownerId) {
      return _commands.find((c) => c.id === ownerId) || null;
    }
  }

  // Otherwise match by intent id
  if (intent?.id && intent.id !== 'freetext') {
    return _commands.find((c) => c.id === intent.id) || null;
  }

  return null;
}

/** @returns All registered commands */
export function getAllCommands(): VoiceCommand[] {
  return [..._commands];
}
