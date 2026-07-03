import { useState, useRef, useCallback, useEffect } from 'react';

// The lib.dom typings for the Web Speech API are incomplete (the ctor comes
// through as `any`), so we declare the minimal surface this hook uses.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string } | undefined;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike | undefined };
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const SpeechRecognitionCtor: (new () => SpeechRecognitionInstance) | null =
  typeof window !== 'undefined'
    ? ((window.SpeechRecognition || window.webkitSpeechRecognition) as (new () => SpeechRecognitionInstance) | null)
    : null;

interface VoiceInputOptions {
  lang?: string;
  continuous?: boolean;
  onResult?: (text: string) => void;
  onEnd?: () => void;
}

export function useVoiceInput({ lang = 'en-US', continuous = false, onResult, onEnd }: VoiceInputOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(!!SpeechRecognitionCtor);
  const [interim, setInterim] = useState('');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const manualStopRef = useRef(false);
  // Keep latest callbacks in refs to avoid stale closures
  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
    setInterim('');
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognitionCtor) return;

    // Stop any existing session
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    manualStopRef.current = false;

    recognition.onstart = () => {
      setIsListening(true);
      setInterim('');
    };

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      setInterim(interimText);

      if (finalText) {
        onResultRef.current?.(finalText);
        setInterim('');
      }
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.warn('Speech recognition error:', event.error);
      }
      setIsListening(false);
      setInterim('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterim('');
      onEndRef.current?.();
      // Auto-restart if continuous and not manually stopped
      if (continuous && !manualStopRef.current) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch {}
        }, 100);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.warn('Speech recognition start error:', e);
      setIsListening(false);
    }
  }, [lang, continuous]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  return { isListening, isSupported, interim, start, stop, toggle };
}
