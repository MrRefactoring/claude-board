import {
  createContext,
  useContext,
  useReducer,
  useRef,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type Dispatch,
} from 'react';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { speak } from '@/features/voice/engine/ttsEngine';
import { playStartBeep, playStopBeep } from '@/features/voice/engine/soundEffects';
import { startAudioCapture, stopAudioCapture, getAnalyser } from '@/features/voice/engine/sttEngine';
import { detectIntent } from '@/features/voice/intent/intentParser';
import { resolveCommand, getAllCommands } from '@/features/voice/commands/commandRegistry';
import type {
  CommandResult,
  CommandRefs,
  CommandHandlers,
  TaskDraft,
  VoiceCommand,
} from '@/features/voice/commands/commandRegistry';
import { t } from '@/features/voice/i18n/t';
import type { Task, Project } from '@/lib/types';
import '@/features/voice/commands/index'; // register all commands

// ─── Types ───
export interface Message {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
}

export interface VoiceState {
  open: boolean;
  messages: Message[];
  flow: string;
  draft: TaskDraft;
  ttsEnabled: boolean;
  isSpeaking: boolean;
}

export type VoiceAction =
  | { type: 'TOGGLE_OPEN' }
  | { type: 'SET_OPEN'; value: boolean }
  | { type: 'ADD_MESSAGE'; msg: Message }
  | { type: 'SET_FLOW'; flow: string; draft?: TaskDraft }
  | { type: 'TOGGLE_TTS' }
  | { type: 'SET_SPEAKING'; value: boolean }
  | { type: 'CLEAR' };

export interface VoiceContextValue {
  state: VoiceState;
  dispatch: Dispatch<VoiceAction>;
  processInput: (rawText: string) => Promise<void>;
  voice: ReturnType<typeof useVoiceInput>;
  flowLabel: string | null;
  getAnalyser: () => AnalyserNode | null;
  commands: VoiceCommand[];
  voiceLang: string;
  changeLang: (code: string) => void;
}

// ─── State ───
const initial: VoiceState = {
  open: false,
  messages: [],
  flow: 'idle',
  draft: {},
  ttsEnabled: true,
  isSpeaking: false,
};

function reducer(state: VoiceState, action: VoiceAction): VoiceState {
  switch (action.type) {
    case 'TOGGLE_OPEN':
      return { ...state, open: !state.open };
    case 'SET_OPEN':
      return { ...state, open: action.value };
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.msg] };
    case 'SET_FLOW':
      return { ...state, flow: action.flow, draft: action.draft ?? state.draft };
    case 'TOGGLE_TTS':
      return { ...state, ttsEnabled: !state.ttsEnabled };
    case 'SET_SPEAKING':
      return { ...state, isSpeaking: action.value };
    case 'CLEAR':
      return { ...state, messages: [], flow: 'idle', draft: {}, isSpeaking: false };
    default:
      return state;
  }
}

// ─── Context ───
const VoiceCtx = createContext<VoiceContextValue | null>(null);

const VOICE_LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'tr-TR', label: 'Türkçe' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'es-ES', label: 'Español' },
  { code: 'pt-BR', label: 'Português' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'nl-NL', label: 'Nederlands' },
  { code: 'pl-PL', label: 'Polski' },
  { code: 'ru-RU', label: 'Русский' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'zh-CN', label: '中文' },
  { code: 'ar-SA', label: 'العربية' },
  { code: 'hi-IN', label: 'हिन्दी' },
];

export { VOICE_LANGUAGES };

interface VoiceAssistantProviderProps {
  children: ReactNode;
  tasks: Task[];
  currentProject: Project | null;
  onCreateTask?: CommandHandlers['onCreateTask'];
  onStatusChange?: CommandHandlers['onStatusChange'];
}

export function VoiceAssistantProvider({
  children,
  tasks,
  currentProject,
  onCreateTask,
  onStatusChange,
}: VoiceAssistantProviderProps) {
  const [state, dispatch] = useReducer(reducer, initial);
  // Auto-detect voice language from app UI language
  const [voiceLang, setVoiceLang] = useState<string>(() => {
    const stored = localStorage.getItem('voice-lang');
    if (stored) return stored;
    // Sync with app UI language
    const uiLang = localStorage.getItem('ui-lang') || navigator.language?.split('-')[0] || 'en';
    const langMap: Record<string, string> = {
      en: 'en-US',
      tr: 'tr-TR',
      de: 'de-DE',
      fr: 'fr-FR',
      es: 'es-ES',
      pt: 'pt-BR',
      it: 'it-IT',
      nl: 'nl-NL',
      pl: 'pl-PL',
      ru: 'ru-RU',
      ja: 'ja-JP',
      ko: 'ko-KR',
      zh: 'zh-CN',
      ar: 'ar-SA',
      hi: 'hi-IN',
    };
    return langMap[uiLang] || 'en-US';
  });

  const changeLang = useCallback((code: string) => {
    setVoiceLang(code);
    localStorage.setItem('voice-lang', code);
  }, []);

  // Refs for latest values (avoid stale closures)
  const stateRef = useRef(state);
  const tasksRef = useRef(tasks);
  const projectRef = useRef(currentProject);
  const handlersRef = useRef({ onCreateTask, onStatusChange });
  const commandRefsRef = useRef<CommandRefs>({}); // mutable refs for commands (e.g., statusTarget)
  const voiceLangRef = useRef(voiceLang);
  const voiceRef = useRef<ReturnType<typeof useVoiceInput> | null>(null); // ref to useVoiceInput return, updated below

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    projectRef.current = currentProject;
  }, [currentProject]);
  useEffect(() => {
    handlersRef.current = { onCreateTask, onStatusChange };
  }, [onCreateTask, onStatusChange]);
  useEffect(() => {
    voiceLangRef.current = voiceLang;
  }, [voiceLang]);

  // ─── Process input ───
  const processInput = useCallback(async (rawText: string): Promise<void> => {
    if (!rawText?.trim()) return;
    const text = rawText.trim();
    const cur = stateRef.current;

    // Add user message
    dispatch({ type: 'ADD_MESSAGE', msg: { role: 'user', text, ts: Date.now() } });

    // Detect intent
    const commands = getAllCommands();
    const intent = detectIntent(text, commands);

    // Build context (use ref for latest language)
    const lang = voiceLangRef.current;
    const ctx = {
      flow: cur.flow,
      draft: cur.draft,
      intent,
      tasks: tasksRef.current,
      currentProject: projectRef.current,
      refs: commandRefsRef.current,
      lang,
    };

    // Resolve command
    let result: CommandResult | null = null;
    const command = resolveCommand(intent, cur.flow);

    if (command) {
      result = command.execute(text, ctx);
    }

    // Fallback
    if (!result) {
      result = {
        flow: cur.flow === 'idle' ? 'idle' : cur.flow,
        message: cur.flow === 'idle' ? t('fallback.idle', lang) : t('fallback.active', lang),
      };
    }

    // Update state
    dispatch({ type: 'SET_FLOW', flow: result.flow, draft: result.draft });

    // Add assistant message
    if (result.message) {
      dispatch({ type: 'ADD_MESSAGE', msg: { role: 'assistant', text: result.message, ts: Date.now() } });

      // TTS — stop mic before speaking, use ref for latest voice hook
      if (stateRef.current.ttsEnabled) {
        dispatch({ type: 'SET_SPEAKING', value: true });
        voiceRef.current?.stop();
        await speak(result.message, lang);
        dispatch({ type: 'SET_SPEAKING', value: false });
      }
    }

    // Execute side-effect action
    if (result.action) {
      result.action(handlersRef.current);
    }
  }, []);

  // ─── Voice input ───
  const voice = useVoiceInput({
    lang: voiceLang,
    continuous: false,
    // onResult expects void — the async pipeline runs detached
    onResult: (text) => void processInput(text),
  });
  // Latest-ref pattern: consumers are async callbacks, post-render sync is fine.
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  // Sound effects on listen state changes
  const prevListening = useRef(false);
  useEffect(() => {
    if (voice.isListening && !prevListening.current) {
      playStartBeep();
      void startAudioCapture();
    }
    if (!voice.isListening && prevListening.current) {
      playStopBeep();
      stopAudioCapture();
    }
    prevListening.current = voice.isListening;
  }, [voice.isListening]);

  // ─── Flow label ───
  const flowLabel = state.flow !== 'idle' ? t('flow.' + state.flow, voiceLang) : null;

  const value: VoiceContextValue = {
    state,
    dispatch,
    processInput,
    voice,
    flowLabel,
    getAnalyser,
    commands: getAllCommands(),
    voiceLang,
    changeLang,
  };

  return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}

export function useVoiceAssistant(): VoiceContextValue {
  const ctx = useContext(VoiceCtx);
  if (!ctx) throw new Error('useVoiceAssistant must be inside VoiceAssistantProvider');
  return ctx;
}
