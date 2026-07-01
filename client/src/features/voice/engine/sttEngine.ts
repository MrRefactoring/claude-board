/**
 * Speech-to-text audio analyser for waveform visualization.
 * Provides an AnalyserNode that AudioVisualizer can read from.
 */

let _audioCtx: AudioContext | null = null;
let _analyser: AnalyserNode | null = null;
let _stream: MediaStream | null = null;

/**
 * Start capturing microphone audio for visualization.
 */
export async function startAudioCapture(): Promise<AnalyserNode | null> {
  try {
    _stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _audioCtx = new AudioContext();
    _analyser = _audioCtx.createAnalyser();
    _analyser.fftSize = 256;
    _analyser.smoothingTimeConstant = 0.7;

    const source = _audioCtx.createMediaStreamSource(_stream);
    source.connect(_analyser);

    return _analyser;
  } catch {
    return null;
  }
}

/** Stop capturing and release the microphone stream */
export function stopAudioCapture(): void {
  if (_stream) {
    _stream.getTracks().forEach((t) => t.stop());
    _stream = null;
  }
  if (_audioCtx) {
    _audioCtx.close().catch(() => {});
    _audioCtx = null;
  }
  _analyser = null;
}

export function getAnalyser(): AnalyserNode | null {
  return _analyser;
}
