import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognitionCtor =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// The lib.dom typings for the Web Speech API are incomplete in this TS release
// (the SpeechRecognition instance interface isn't named), so derive it from the
// constructor value we already reference.
type SpeechRecognitionInstance = InstanceType<NonNullable<Window['SpeechRecognition']>>;

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

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
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
