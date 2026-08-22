import { useCallback, useEffect, useRef, useState } from 'react';
import { getVoiceRecorderMimeType } from '../utils/voiceTranscribe';

/**
 * Records a full phone call via microphone (use with the call on open speaker).
 * Unlike the assistant voice capture, this never auto-stops on silence — it runs
 * until the user stops it. Returns a blob + duration when stopped.
 */
export function useCallRecorder() {
  const [status, setStatus] = useState('idle'); // idle | recording | paused
  const [elapsed, setElapsed] = useState(0); // seconds
  const [level, setLevel] = useState(0); // 0..100
  const [error, setError] = useState('');

  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const pausedMsRef = useRef(0);
  const pauseStartedRef = useRef(0);
  const timerRef = useRef(null);
  const mimeRef = useRef('audio/webm');

  const cleanup = useCallback(() => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    setError('');
    if (status === 'recording') return false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Η συσκευή δεν υποστηρίζει μικρόφωνο.');
      return false;
    }
    const mimeType = getVoiceRecorderMimeType();
    if (typeof MediaRecorder === 'undefined' || mimeType === null) {
      setError('Η συσκευή δεν υποστηρίζει εγγραφή ήχου.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // keep the far end audible through the speaker
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;

      const effectiveMime = mimeType || 'audio/webm';
      mimeRef.current = effectiveMime;
      const recorder = new MediaRecorder(
        stream,
        effectiveMime ? { mimeType: effectiveMime, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 }
      );
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(1000);

      startedAtRef.current = Date.now();
      pausedMsRef.current = 0;
      setElapsed(0);

      timerRef.current = setInterval(() => {
        const active = Date.now() - startedAtRef.current - pausedMsRef.current;
        setElapsed(Math.max(0, Math.floor(active / 1000)));
      }, 500);

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
        setLevel(Math.min(100, Math.round(avg * 1.8)));
        animRef.current = requestAnimationFrame(tick);
      };
      tick();

      setStatus('recording');
      return true;
    } catch (err) {
      cleanup();
      setStatus('idle');
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Δεν δόθηκε πρόσβαση στο μικρόφωνο. Δώσε άδεια και δοκίμασε ξανά.');
      } else {
        setError('Δεν ξεκίνησε η εγγραφή. Έλεγξε το μικρόφωνο.');
      }
      return false;
    }
  }, [status, cleanup]);

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.pause();
      pauseStartedRef.current = Date.now();
      setStatus('paused');
    }
  }, []);

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'paused') {
      recorder.resume();
      if (pauseStartedRef.current) {
        pausedMsRef.current += Date.now() - pauseStartedRef.current;
        pauseStartedRef.current = 0;
      }
      setStatus('recording');
    }
  }, []);

  /** Stops recording and resolves with { blob, durationSeconds, mimeType }. */
  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      const durationSeconds = Math.max(
        0,
        Math.floor((Date.now() - startedAtRef.current - pausedMsRef.current) / 1000)
      );

      if (!recorder || recorder.state === 'inactive') {
        cleanup();
        setStatus('idle');
        resolve({ blob: null, durationSeconds, mimeType: mimeRef.current });
        return;
      }

      recorder.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        const blob = chunks.length ? new Blob(chunks, { type: mimeRef.current }) : null;
        cleanup();
        mediaRecorderRef.current = null;
        setStatus('idle');
        setElapsed(0);
        resolve({ blob, durationSeconds, mimeType: mimeRef.current });
      };

      try {
        recorder.stop();
      } catch {
        cleanup();
        setStatus('idle');
        resolve({ blob: null, durationSeconds, mimeType: mimeRef.current });
      }
    });
  }, [cleanup]);

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    chunksRef.current = [];
    mediaRecorderRef.current = null;
    cleanup();
    setStatus('idle');
    setElapsed(0);
  }, [cleanup]);

  useEffect(() => () => cancel(), [cancel]);

  return { status, elapsed, level, error, start, pause, resume, stop, cancel };
}
