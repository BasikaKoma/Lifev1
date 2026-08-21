import { useCallback, useEffect, useRef, useState } from 'react';
import { isOpenAiConfigured } from '../lib/openai';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  parseAssistantMessage,
  describeIntents,
  ASSISTANT_EXAMPLES,
} from '../utils/assistantParser';
import { answerFromProjectBrief } from '../utils/projectBrief';
import { askWithProjectBrief } from '../utils/projectAgent';
import {
  getVoiceRecorderMimeType,
  transcribeAudio,
  listAudioInputDevices,
  getSavedMicDeviceId,
  saveMicDeviceId,
  buildMicConstraints,
  pickBestMicDeviceId,
  describeActiveMicTrack,
  isLikelyWrongAudioSource,
  wrongAudioSourceMessage,
} from '../utils/voiceTranscribe';

const SPEECH_LEVEL = 14;
const SILENCE_LEVEL = 8;
const SILENCE_MS = 1800;
const MIN_RECORD_MS = 700;

function micLevelBar(level) {
  const bars = 8;
  const active = Math.round((level / 100) * bars);
  return '▮'.repeat(active) + '▯'.repeat(bars - active);
}

export function AssistantOrb({ goals, stages, projectTitle, projectBrief, onApply }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micDevices, setMicDevices] = useState([]);
  const [selectedMicId, setSelectedMicId] = useState(() => getSavedMicDeviceId() || '');
  const [activeMicLabel, setActiveMicLabel] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: isOpenAiConfigured()
        ? 'Γράψε ή πάτα 🎤 Φωνή.\n\nΑν βλέπεις «Υπότιτλοι AUTHORWAVE», το μικρόφωνο πιάνει ήχο από video/extension — άλλαξε συσκευή από «Μικρόφωνο» παρακάτω.'
        : isSupabaseConfigured()
          ? 'Το Supabase είναι συνδεδεμένο (αποθήκευση cloud).\n\nΓια φωνή χρειάζεσαι ξεχωριστό OpenAI key: Settings → Voice.\n\nΜπορείς όμως να γράψεις εντολές κατευθείαν — δοκίμασε μια πρόταση παρακάτω.'
          : 'Γράψε εντολή ή πρόσθεσε OpenAI key (Settings → Voice) για φωνή.\n\nΠ.χ. «Βάλε στόχο 10 πελάτες»',
    },
  ]);

  const panelRef = useRef(null);
  const orbRef = useRef(null);
  const messagesRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micAnimRef = useRef(null);
  const chunksRef = useRef([]);
  const sessionActiveRef = useRef(false);
  const heardSpeechRef = useRef(false);
  const recordStartedAtRef = useRef(0);
  const silenceTimerRef = useRef(null);
  const goalsRef = useRef(goals);
  const stagesRef = useRef(stages);
  const projectTitleRef = useRef(projectTitle);
  const projectBriefRef = useRef(projectBrief);
  const selectedMicIdRef = useRef(selectedMicId);

  useEffect(() => {
    goalsRef.current = goals;
    stagesRef.current = stages;
    projectTitleRef.current = projectTitle;
    projectBriefRef.current = projectBrief;
  }, [goals, stages, projectTitle, projectBrief]);

  useEffect(() => {
    selectedMicIdRef.current = selectedMicId;
  }, [selectedMicId]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    const refreshMicDevices = async () => {
      try {
        // Warmup only to unlock device labels — then close immediately.
        // Do NOT leave this stream open; it often attaches to Stereo Mix.
        if (isOpenAiConfigured() && navigator.mediaDevices?.getUserMedia) {
          const warmup = await navigator.mediaDevices.getUserMedia({ audio: true });
          warmup.getTracks().forEach((track) => track.stop());
        }

        const devices = await listAudioInputDevices();
        if (cancelled) return;

        setMicDevices(devices);

        const preferred =
          selectedMicIdRef.current || getSavedMicDeviceId() || '';
        const bestId = pickBestMicDeviceId(devices, preferred);
        if (!bestId) return;

        // Never overwrite a valid non-loopback selection the user already made.
        const current = devices.find((d) => d.deviceId === selectedMicIdRef.current);
        if (current && !current.isLoopback) return;

        setSelectedMicId(bestId);
        saveMicDeviceId(bestId);
      } catch {
        /* ignore */
      }
    };

    refreshMicDevices();
    navigator.mediaDevices?.addEventListener('devicechange', refreshMicDevices);

    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener('devicechange', refreshMicDevices);
    };
  }, [open]);

  const handleMicDeviceChange = (deviceId) => {
    selectedMicIdRef.current = deviceId;
    setSelectedMicId(deviceId);
    saveMicDeviceId(deviceId);
  };

  const pushAssistantMessage = useCallback((text) => {
    if (!text) return;
    setMessages((prev) => [...prev, { role: 'assistant', text }]);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopMedia = useCallback(() => {
    clearSilenceTimer();
    if (micAnimRef.current) {
      cancelAnimationFrame(micAnimRef.current);
      micAnimRef.current = null;
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
    mediaRecorderRef.current = null;
    setMicLevel(0);
    setActiveMicLabel('');
  }, [clearSilenceTimer]);

  const processUserText = useCallback(async (rawText) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setLiveTranscript('');

    const { intents, hint } = parseAssistantMessage(trimmed, goalsRef.current, stagesRef.current);

    if (intents.length === 0) {
      const local = answerFromProjectBrief(trimmed, {
        title: projectTitleRef.current,
        brief: projectBriefRef.current,
      });
      if (local) {
        setMessages((prev) => [...prev, { role: 'assistant', text: local }]);
        return;
      }

      if (isOpenAiConfigured()) {
        try {
          const reply = await askWithProjectBrief({
            userText: trimmed,
            title: projectTitleRef.current,
            brief: projectBriefRef.current,
          });
          if (reply) {
            setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
            return;
          }
        } catch (err) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', text: err.message || hint },
          ]);
          return;
        }
      }

      setMessages((prev) => [...prev, { role: 'assistant', text: hint }]);
      return;
    }

    try {
      const result = await onApply(intents);
      const summary = describeIntents(intents).join('\n');
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: result?.message || `Έτοιμο!\n${summary}` },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: err.message || 'Κάτι πήγε στραβά.' },
      ]);
    }
  }, [onApply]);

  const finishRecording = useCallback(async (submit) => {
    if (!sessionActiveRef.current) return;

    sessionActiveRef.current = false;
    setListening(false);
    clearSilenceTimer();

    const recorder = mediaRecorderRef.current;
    const mimeType = getVoiceRecorderMimeType() || 'audio/webm';

    const blob = await new Promise((resolve) => {
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const data = chunksRef.current;
        chunksRef.current = [];
        resolve(data.length ? new Blob(data, { type: mimeType }) : null);
      };

      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
    });

    stopMedia();

    if (!submit) {
      setLiveTranscript('');
      return;
    }

    if (!blob || blob.size < 800) {
      setLiveTranscript('');
      pushAssistantMessage('Δεν ηχογραφήθηκε αρκετός ήχος. Πάτα 🎤 Φωνή και μίλα πιο δυνατά.');
      return;
    }

    setTranscribing(true);
    setLiveTranscript('Μεταγραφή…');

    try {
      const text = await transcribeAudio(blob);
      setTranscribing(false);
      setLiveTranscript('');

      if (!text) {
        pushAssistantMessage('Δεν κατάλαβα τι είπες. Δοκίμασε ξανά.');
        return;
      }

      if (isLikelyWrongAudioSource(text)) {
        pushAssistantMessage(wrongAudioSourceMessage(activeMicLabel));
        return;
      }

      setInput(text);
      await processUserText(text);
    } catch (err) {
      setTranscribing(false);
      setLiveTranscript('');
      pushAssistantMessage(err.message || 'Αποτυχία μεταγραφής.');
    }
  }, [clearSilenceTimer, stopMedia, pushAssistantMessage, processUserText, activeMicLabel]);

  const scheduleSilenceStop = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = window.setTimeout(() => {
      if (sessionActiveRef.current && heardSpeechRef.current) {
        finishRecording(true);
      }
    }, SILENCE_MS);
  }, [clearSilenceTimer, finishRecording]);

  const startListening = useCallback(async () => {
    if (sessionActiveRef.current) {
      await finishRecording(true);
      return;
    }

    if (!isOpenAiConfigured()) {
      pushAssistantMessage('Πρόσθεσε OpenAI API key στο Settings → Voice και κάνε refresh.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      pushAssistantMessage('Ο browser δεν υποστηρίζει μικρόφωνο.');
      return;
    }

    const mimeType = getVoiceRecorderMimeType();
    if (!mimeType || typeof MediaRecorder === 'undefined') {
      pushAssistantMessage('Ο browser δεν υποστηρίζει εγγραφή ήχου. Δοκίμασε Chrome ή Edge.');
      return;
    }

    const deviceId = selectedMicIdRef.current || selectedMicId;
    if (!deviceId) {
      pushAssistantMessage('Διάλεξε μικρόφωνο από το dropdown και δοκίμασε ξανά.');
      return;
    }

    const selectedMeta = micDevices.find((d) => d.deviceId === deviceId);
    if (selectedMeta?.isLoopback) {
      pushAssistantMessage(
        `Η συσκευή «${selectedMeta.label}» είναι Stereo Mix (ήχος συστήματος), όχι μικρόφωνο.\n\nΔιάλεξε το MAJOR IV ή άλλο πραγματικό μικρόφωνο από το dropdown.`
      );
      return;
    }

    heardSpeechRef.current = false;
    chunksRef.current = [];
    sessionActiveRef.current = true;
    setListening(true);
    setLiveTranscript('Έτοιμο — μίλα τώρα…');

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        buildMicConstraints(deviceId)
      );
      mediaStreamRef.current = stream;

      const track = stream.getAudioTracks()[0];
      const active = describeActiveMicTrack(track);
      setActiveMicLabel(active.label);

      // Browser ignored dropdown (old `ideal` bug) or Windows remapped to Stereo Mix.
      if (active.isLoopback) {
        sessionActiveRef.current = false;
        setListening(false);
        setLiveTranscript('');
        stopMedia();
        pushAssistantMessage(
          `Άνοιξε Stereo Mix («${active.label}») αντί για το μικρόφωνο που διάλεξες.\n\n` +
            'Windows → Ρυθμίσεις → Ήχος → Είσοδος:\n' +
            '• απενεργοποίησε «Stereo Mix / Στερεοφωνική μείξη»\n' +
            '• βάλε προεπιλογή το MAJOR IV ή άλλο μικρόφωνο\n\n' +
            'Μετά refresh και πάτα 🎤 Φωνή ξανά.'
        );
        return;
      }

      if (
        deviceId &&
        deviceId !== 'default' &&
        deviceId !== 'communications' &&
        active.deviceId &&
        active.deviceId !== deviceId
      ) {
        sessionActiveRef.current = false;
        setListening(false);
        setLiveTranscript('');
        stopMedia();
        pushAssistantMessage(
          `Το browser άνοιξε άλλη συσκευή («${active.label}») από αυτή που διάλεξες.\n\nΔιάλεξε ξανά από το dropdown και δοκίμασε.`
        );
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recordStartedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.start(200);

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      setLiveTranscript(`🎙 ${active.label || 'Μικρόφωνο'} — μίλα τώρα…`);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!sessionActiveRef.current || !analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
        const level = Math.min(100, Math.round(avg * 1.8));
        setMicLevel(level);

        const elapsed = Date.now() - recordStartedAtRef.current;
        if (level >= SPEECH_LEVEL) {
          heardSpeechRef.current = true;
          setLiveTranscript(`${micLevelBar(level)} Ακούω…`);
          scheduleSilenceStop();
        } else if (heardSpeechRef.current && level < SILENCE_LEVEL) {
          scheduleSilenceStop();
        } else if (heardSpeechRef.current) {
          setLiveTranscript(`${micLevelBar(level)} Ακούω…`);
        } else if (elapsed > MIN_RECORD_MS) {
          setLiveTranscript(`${micLevelBar(level)} Έτοιμο — μίλα τώρα…`);
        }

        micAnimRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      sessionActiveRef.current = false;
      setListening(false);
      setLiveTranscript('');
      stopMedia();
      const msg = String(err?.message || err?.name || '');
      if (/OverconstrainedError|constraint/i.test(msg) || err?.name === 'OverconstrainedError') {
        pushAssistantMessage(
          'Η επιλεγμένη συσκευή δεν είναι διαθέσιμη αυτή τη στιγμή.\n\nΔιάλεξε άλλη από το dropdown «Μικρόφωνο» (όχι Stereo Mix) και δοκίμασε ξανά.'
        );
        return;
      }
      pushAssistantMessage('Δεν δόθηκε πρόσβαση στο μικρόφωνο.');
    }
  }, [
    finishRecording,
    pushAssistantMessage,
    scheduleSilenceStop,
    stopMedia,
    selectedMicId,
    micDevices,
  ]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e) => {
      if (panelRef.current?.contains(e.target) || orbRef.current?.contains(e.target)) return;
      if (sessionActiveRef.current) finishRecording(true);
      setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, finishRecording]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, listening, liveTranscript, transcribing]);

  useEffect(() => () => {
    sessionActiveRef.current = false;
    stopMedia();
  }, [stopMedia]);

  const handleSubmit = () => {
    processUserText(input);
  };

  const handleOrbClick = () => {
    if (open) {
      if (sessionActiveRef.current) {
        finishRecording(true);
        return;
      }
      setOpen(false);
      return;
    }

    setOpen(true);
  };

  const handleExampleClick = (example) => {
    if (listening || transcribing) return;
    setInput(example);
    processUserText(example);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      if (sessionActiveRef.current) finishRecording(false);
      setOpen(false);
    }
  };

  const busy = listening || transcribing;

  return (
    <div className="assistant-orb">
      {open && (
        <div className="assistant-orb__panel" ref={panelRef}>
          <div className="assistant-orb__panel-header">
            <span>Assistant</span>
            <span className="assistant-orb__badge">
              {transcribing ? 'Μεταγραφή…' : listening ? '● Ακούω…' : 'Μίλα ή γράψε'}
            </span>
          </div>

          <div className="assistant-orb__body">
            <div className="assistant-orb__messages" ref={messagesRef}>
              {messages.map((msg, i) => (
                <div key={i} className={`assistant-orb__msg assistant-orb__msg--${msg.role}`}>
                  {msg.text}
                </div>
              ))}
              {(listening || transcribing) && liveTranscript && (
                <div className="assistant-orb__msg assistant-orb__msg--live">
                  🎤 {liveTranscript}
                </div>
              )}
            </div>

            <div className="assistant-orb__examples">
              {ASSISTANT_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="assistant-orb__example"
                  onClick={() => handleExampleClick(example)}
                  disabled={busy}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="assistant-orb__composer">
            {micDevices.length > 0 && (
              <label className="assistant-orb__mic-select">
                <span>Μικρόφωνο</span>
                <select
                  className="input"
                  value={selectedMicId}
                  onChange={(e) => handleMicDeviceChange(e.target.value)}
                  disabled={busy}
                >
                  {micDevices.map((device, index) => (
                    <option
                      key={device.deviceId || `mic-${index}`}
                      value={device.deviceId}
                      disabled={device.isLoopback}
                    >
                      {device.isLoopback
                        ? `⛔ ${device.label || 'Stereo Mix'} (όχι μικρόφωνο)`
                        : device.label || `Μικρόφωνο ${(device.deviceId || '').slice(0, 6) || '?'}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {listening && activeMicLabel && (
              <p className="assistant-orb__mic-active">🎙 {activeMicLabel}</p>
            )}
            <textarea
              className="input textarea assistant-orb__input"
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={busy ? 'Μίλα — η μεταγραφή εμφανίζεται εδώ…' : 'π.χ. Βάλε στόχο 10 πελάτες'}
              disabled={transcribing}
            />
            <div className="assistant-orb__actions">
              <button
                type="button"
                className={`btn btn--outline btn--sm ${listening ? 'assistant-orb__mic--active' : ''}`}
                onClick={startListening}
                disabled={transcribing}
                title={listening ? 'Σταμάτα και στείλε' : 'Μίλησε'}
              >
                {listening ? '■ Σταμάτα' : transcribing ? '…' : '🎤 Φωνή'}
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={handleSubmit}
                disabled={!input.trim() || busy}
              >
                Στείλε
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        ref={orbRef}
        type="button"
        className={`assistant-orb__btn ${open ? 'assistant-orb__btn--open' : ''} ${listening ? 'assistant-orb__btn--listening' : ''}`}
        onClick={handleOrbClick}
        aria-label="Assistant"
        title={listening ? 'Σταμάτα εγγραφή' : 'Assistant — μίλα ή γράψε'}
      >
        <span className="assistant-orb__glow" aria-hidden="true" />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      </button>
    </div>
  );
}
