import '@testing-library/jest-dom';

// The Web Speech / Web Audio APIs aren't implemented in jsdom, so we install
// minimal mocks. They only need to satisfy the code under test, not the full
// lib.dom shapes — assignments go through a loosely-typed `window` view.
const w = window as unknown as Record<string, unknown>;

// Mock SpeechRecognition
class MockSpeechRecognition {
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start() {
    this.onstart?.();
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
}

w.SpeechRecognition = MockSpeechRecognition;
w.webkitSpeechRecognition = MockSpeechRecognition;

// Mock SpeechSynthesis
w.speechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: () => [{ lang: 'en-US', name: 'English' }],
  speaking: false,
  onvoiceschanged: null,
};

w.SpeechSynthesisUtterance = class {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
};

// Mock AudioContext
w.AudioContext = class {
  state = 'running';
  createOscillator() {
    return {
      connect: vi.fn(),
      frequency: { value: 0 },
      type: 'sine',
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };
  }
  get destination() {
    return {};
  }
  get currentTime() {
    return 0;
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
};
