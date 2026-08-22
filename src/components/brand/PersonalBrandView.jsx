import { useEffect, useRef, useState } from 'react';
import { usePersonalBrand } from '../../hooks/usePersonalBrand';
import { BRAND_TABS } from '../../lib/brand/schema';
import { getVoiceRecorderMimeType, transcribeAudio } from '../../utils/voiceTranscribe';
import { BrandHub, SignalDetail } from './BrandHub';
import { BrandIdeas, BrandLibrary, BrandPipeline } from './BrandPages';
import { BrandCreate, BrandDna } from './BrandCreate';
import './brand.css';

export function PersonalBrandView({
  displayName = '',
  lifelineDays = {},
  selfHubDays = {},
  projectActivity = [],
  projectList = [],
}) {
  const brand = usePersonalBrand({
    displayName,
    lifelineDays,
    selfHubDays,
    projectActivity,
    projectList,
  });
  const [tab, setTab] = useState('hub');
  const [captureText, setCaptureText] = useState('');
  const [captureKind, setCaptureKind] = useState('thought');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openSignal, setOpenSignal] = useState(null);
  const [weeklyAi, setWeeklyAi] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => () => {
    recorderRef.current?.stream?.getTracks?.().forEach((track) => track.stop());
  }, []);

  const openCreate = (item) => {
    if (item?.id) brand.setActiveItem(item.id);
    setTab('create');
    setOpenSignal(null);
  };

  const handleCapture = () => {
    const item = brand.captureIdea(captureText, captureKind);
    if (item) setCaptureText('');
  };

  const toggleMic = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      brand.setError('Η συσκευή δεν υποστηρίζει μικρόφωνο.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = getVoiceRecorderMimeType();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 800) return;
        setTranscribing(true);
        try {
          const text = await transcribeAudio(blob);
          if (text) setCaptureText((prev) => (prev ? `${prev} ${text}` : text));
        } catch (err) {
          brand.setError(err.message || 'Αποτυχία μεταγραφής.');
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      brand.setError(err.message || 'Δεν άνοιξε το μικρόφωνο.');
    }
  };

  const handleFromSignal = (signal) => {
    const item = brand.createFromSignal(signal, 'selected');
    openCreate(item);
  };

  const handleContinue = (item) => {
    if (item?.id) {
      if (item.stage === 'idea') brand.moveItem(item.id, 'drafting');
      openCreate(item);
      return;
    }
    if (brand.activeDraft) openCreate(brand.activeDraft);
  };

  const handleAskFromHub = () => {
    if (brand.activeDraft) openCreate(brand.activeDraft);
  };

  const handleVariationsFromHub = async () => {
    if (!brand.activeDraft) return;
    await brand.runVariations(brand.activeDraft);
    openCreate(brand.activeDraft);
  };

  const handleNewIdea = () => {
    setTab('hub');
    setOpenSignal(null);
    requestAnimationFrame(() => document.getElementById('brand-capture')?.focus());
  };

  if (brand.loading) {
    return (
      <section className="brand-view">
        <p className="brand-empty">Loading Personal Brand…</p>
      </section>
    );
  }

  return (
    <section className="brand-view">
      <header className="brand-view__header">
        <div>
          <h1 className="brand-view__title">Personal Brand</h1>
          <p className="brand-view__handle">{brand.handle || 'Set your handle in Brand DNA'}</p>
        </div>
        <div className="brand-view__actions">
          <button type="button" className="brand-btn brand-btn--outline" onClick={handleNewIdea}>
            New idea
          </button>
          <div className="brand-menu">
            <button
              type="button"
              className="brand-btn brand-btn--icon"
              aria-label="More"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
                <circle cx="5" cy="12" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="19" cy="12" r="1.7" />
              </svg>
            </button>
            {menuOpen && (
              <div className="brand-menu__pop">
                <button type="button" onClick={() => { setTab('dna'); setMenuOpen(false); }}>Brand DNA</button>
                <button type="button" onClick={() => { setTab('library'); setMenuOpen(false); }}>Library</button>
                <button
                  type="button"
                  onClick={async () => {
                    setMenuOpen(false);
                    const result = await brand.runWeeklyBrief();
                    if (result) {
                      setWeeklyAi(result);
                      setTab('hub');
                    }
                  }}
                >
                  Refresh weekly story
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="brand-tabs" aria-label="Personal Brand">
        {BRAND_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => { setTab(item.id); setOpenSignal(null); }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {brand.error ? <p className="brand-error">{brand.error}</p> : null}

      {tab === 'hub' && !openSignal && (
        <BrandHub
          signals={brand.signals}
          activeDraft={brand.activeDraft}
          pipeline={brand.pipeline}
          stats={brand.stats}
          balance={brand.balance}
          weekly={brand.weekly}
          weeklyAi={weeklyAi}
          captureText={captureText}
          captureKind={captureKind}
          recording={recording}
          transcribing={transcribing}
          onCaptureText={setCaptureText}
          onCaptureKind={setCaptureKind}
          onCapture={handleCapture}
          onToggleMic={toggleMic}
          onOpenSignal={setOpenSignal}
          onContinueDraft={handleContinue}
          onAskBrain={handleAskFromHub}
          onVariations={handleVariationsFromHub}
          onViewPipeline={() => setTab('pipeline')}
          onViewSignals={() => setTab('ideas')}
        />
      )}

      {tab === 'hub' && openSignal && (
        <SignalDetail
          signal={openSignal}
          onClose={() => setOpenSignal(null)}
          onCreate={handleFromSignal}
        />
      )}

      {tab === 'ideas' && (
        <BrandIdeas
          items={brand.items}
          signals={brand.signals}
          onOpen={(item) => openCreate(item)}
          onFromSignal={handleFromSignal}
        />
      )}

      {tab === 'create' && (
        <BrandCreate
          item={brand.activeDraft}
          busy={brand.busy}
          onChange={brand.upsertItem}
          onMove={brand.moveItem}
          onGenerate={brand.runGenerateDraft}
          onVariations={brand.runVariations}
          onAsk={brand.runAskBrain}
          onDelete={(id) => { brand.deleteItem(id); setTab('ideas'); }}
        />
      )}

      {tab === 'pipeline' && (
        <BrandPipeline
          pipeline={brand.pipeline}
          onOpen={openCreate}
          onMove={brand.moveItem}
        />
      )}

      {tab === 'library' && (
        <BrandLibrary items={brand.items} onOpen={openCreate} />
      )}

      {tab === 'dna' && (
        <BrandDna dna={brand.dna} handle={brand.handle} onSave={brand.saveDna} />
      )}
    </section>
  );
}
