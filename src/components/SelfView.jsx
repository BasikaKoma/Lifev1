import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { buildSelfHubView } from '../utils/selfHubData';
import { localTodayIsoDate } from '../utils/selfDateUtils';
import { useLifelineDayView, DAY_VIEW_PHASE } from '../hooks/useLifelineDayView';
import { LifelineDayModal } from './LifelineDayModal';
import { LifelineNorthStars } from './LifelineNorthStars';
import {
  SelfCompactHeader,
  SelfHub,
  SelfDayProgress,
  SelfDeepWorkCard,
  SelfTodayThreeCard,
  SelfNextBestActionCard,
  SelfSummaryStrip,
  SelfProjectDayCard,
  SelfRoutinesCard,
  SelfHubMenu,
} from './self/hub';
import {
  getDayEntry,
  mergeDayRoutines,
  normalizeRoutineTemplates,
  toggleRoutineDone,
  getRoutineWeekScore,
  collectNotesCreatedForDate,
  isTimestampOnDate,
  stampNoteText,
} from '../utils/lifelineDays';
import { getSelfHubDayEntry } from '../utils/selfHubDays';
import { buildSelfHubTimelineEvents } from '../utils/selfHubTimelineEvents';
import './SelfView.css';
import './selfHub.css';

export function SelfView({
  onNavigateHome,
  selfData,
  ouraStatus,
  ouraLoading,
  ouraBusy,
  ouraError,
  onOpenOuraModal,
  onOpenScaleModal,
  onSyncOura,
  scaleConnected,
  displayName,
  stages = [],
  ouraRow = null,
  lifelineDays = {},
  onUpdateLifelineDay,
  projectActivity = [],
  notes = [],
  selfHubDays = {},
  mapTheme = null,
  onMapThemeChange,
  isLifeline = false,
  routineTemplates: routineTemplatesProp,
  onUpdateRoutineTemplates,
  onRefreshProjectActivity,
  northStars = [],
  onUpdateNorthStars,
  pathBundle = null,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusMessage, setFocusMessage] = useState(null);
  const menuRef = useRef(null);
  const recoveredJournalRef = useRef(false);
  const dayView = useLifelineDayView();
  const {
    isActive: dayViewActive,
    isOpen: dayViewOpen,
    date: dayViewDate,
    phase: dayViewPhase,
    open: openDayView,
    close: closeDayView,
  } = dayView;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    onRefreshProjectActivity?.();
  }, [onRefreshProjectActivity]);

  useEffect(() => {
    if (recoveredJournalRef.current || !onUpdateLifelineDay) return;
    const today = localTodayIsoDate();
    const journal = String(getDayEntry(lifelineDays, today).notes || '').trim();
    if (journal) {
      recoveredJournalRef.current = true;
      return;
    }
    const fromActivity = collectNotesCreatedForDate(projectActivity, today).map((item) =>
      stampNoteText(item.title, item.timestamp || new Date())
    );
    const fromLive = (notes || [])
      .filter((note) => {
        if (!note || note.archived) return false;
        const created = note.createdAt || note.updatedAt;
        return !created || isTimestampOnDate(created, today);
      })
      .map((note) => stampNoteText(note.body || note.title, note.createdAt || note.updatedAt || new Date()));
    const unique = [...new Set([...fromLive, ...fromActivity].filter(Boolean))];
    if (!unique.length) return;
    recoveredJournalRef.current = true;
    onUpdateLifelineDay(today, { notes: unique.join('\n\n') });
  }, [lifelineDays, notes, onUpdateLifelineDay, projectActivity]);

  const hubView = useMemo(
    () =>
      buildSelfHubView({
        selfData,
        displayName,
        ouraStatus,
        scaleConnected,
        stages,
        ouraRow,
        projectActivity,
        selfHubDays,
        isLifeline,
        lifelineDays,
        pathBundle,
      }),
    [selfData, displayName, ouraStatus, scaleConnected, stages, ouraRow, projectActivity, selfHubDays, isLifeline, lifelineDays, pathBundle],
  );

  const waitingForData = ouraStatus?.connected && selfData?.source === 'oura-empty';

  const handleStartFocus = () => {
    setFocusMessage(hubView.nextAction.message);
    window.setTimeout(() => setFocusMessage(null), 4000);
  };

  const handleOpenDayDetails = useCallback(() => {
    if (dayViewActive) return;
    openDayView({ date: localTodayIsoDate() });
  }, [dayViewActive, openDayView]);

  const handleCloseDayDetails = useCallback(() => {
    closeDayView();
  }, [closeDayView]);

  const handleUpdateRoutineTemplates = useCallback(
    (templates) => {
      if (onUpdateRoutineTemplates) {
        onUpdateRoutineTemplates(templates);
        return;
      }
      onMapThemeChange?.({
        lifeline: {
          ...(mapTheme?.lifeline || {}),
          routineTemplates: templates,
        },
      });
    },
    [mapTheme, onMapThemeChange, onUpdateRoutineTemplates],
  );

  const today = localTodayIsoDate();
  const routineTemplates = normalizeRoutineTemplates(
    routineTemplatesProp ?? mapTheme?.lifeline?.routineTemplates,
  );
  const todayRoutineLog = useMemo(() => {
    const lifelineEntry = getDayEntry(lifelineDays, today);
    const hubEntry = getSelfHubDayEntry(selfHubDays, today);
    return hubEntry.journal?.routines && Object.keys(hubEntry.journal.routines).length
      ? hubEntry.journal.routines
      : lifelineEntry.routines;
  }, [lifelineDays, selfHubDays, today]);
  const todayRoutines = useMemo(
    () => mergeDayRoutines(routineTemplates, todayRoutineLog),
    [routineTemplates, todayRoutineLog]
  );
  const routineWeek = useMemo(
    () => getRoutineWeekScore(lifelineDays, routineTemplates, today, (date) => getDayEntry(lifelineDays, date)),
    [lifelineDays, routineTemplates, today]
  );

  const timeline = useMemo(
    () =>
      buildSelfHubTimelineEvents({
        routines: todayRoutines,
        projectDay: hubView.projectDay,
        heartRate: hubView.floatingMetrics?.heartRate,
        ouraRow,
        date: today,
      }),
    [todayRoutines, hubView.projectDay, hubView.floatingMetrics, ouraRow, today],
  );
  const dayProgress = useMemo(
    () => ({
      ...hubView.dayProgress,
      segments: [...(hubView.dayProgress?.segments ?? []), ...(timeline.segments ?? [])],
    }),
    [hubView.dayProgress, timeline.segments],
  );

  const handleToggleTodayRoutine = useCallback(
    (routine) => {
      onUpdateLifelineDay?.(today, {
        routines: toggleRoutineDone(todayRoutineLog, routine, !routine.done),
      });
    },
    [onUpdateLifelineDay, today, todayRoutineLog],
  );

  return (
    <div
      className={`self-view self-view--hub${dayViewActive ? ' self-view--day-open' : ''}`}
    >
      <div className="self-dashboard-inner">
        <div className="self-hub-header-wrap" ref={menuRef}>
          <SelfCompactHeader
            header={hubView.header}
            menuOpen={menuOpen}
            onMenuToggle={() => setMenuOpen((open) => !open)}
            onOpenDayDetails={handleOpenDayDetails}
            onNavigateHome={onNavigateHome}
          >
            <SelfHubMenu
              ouraStatus={ouraStatus}
              ouraLoading={ouraLoading}
              ouraBusy={ouraBusy}
              scaleConnected={scaleConnected}
              onOpenOuraModal={onOpenOuraModal}
              onOpenScaleModal={onOpenScaleModal}
              onSyncOura={onSyncOura}
              onClose={() => setMenuOpen(false)}
            />
          </SelfCompactHeader>
        </div>

        {(ouraError || waitingForData) && (
          <div className="self-view__banner">
            {ouraError && <p>{ouraError}</p>}
            {waitingForData && !ouraError && (
              <p>Oura connected. Syncing your latest metrics…</p>
            )}
          </div>
        )}

        {!hubView.hasData && !waitingForData && (
          <div className="self-view__banner self-view__banner--info">
            <p>No health data yet. Open the menu to connect or sync Oura / Scale.</p>
          </div>
        )}

        <div className="self-view__hub-body">
          <LifelineNorthStars
            stars={northStars}
            onChange={onUpdateNorthStars}
            variant="hub"
          />

          <SelfHub floatingMetrics={hubView.floatingMetrics} capacity={hubView.capacity} />

          <SelfDayProgress
            dayProgress={dayProgress}
            events={timeline.events}
            onOpenDayDetails={handleOpenDayDetails}
          />

          <SelfSummaryStrip
            metrics={hubView.summaryStrip}
            onOpenDayDetails={handleOpenDayDetails}
          />

          <SelfRoutinesCard
            dayRoutines={todayRoutines}
            weekLabel={routineWeek.label}
            onToggle={handleToggleTodayRoutine}
            onOpenDayDetails={handleOpenDayDetails}
          />

          <div className="self-hub-cards">
            <SelfDeepWorkCard
              deepWork={hubView.deepWork}
              onOpenDayDetails={handleOpenDayDetails}
            />
            <SelfTodayThreeCard
              todayThree={hubView.todayThree}
              onOpenDayDetails={handleOpenDayDetails}
            />
            <SelfNextBestActionCard
              nextAction={hubView.nextAction}
              onStartFocus={handleStartFocus}
              onOpenDayDetails={handleOpenDayDetails}
            />
          </div>

          <SelfProjectDayCard
            projectDay={hubView.projectDay}
            onOpenDayDetails={handleOpenDayDetails}
          />
        </div>
      </div>

      {focusMessage ? (
        <div className="self-view__focus-toast" role="status">
          Focus: {focusMessage}
        </div>
      ) : null}

      <LifelineDayModal
        open={dayViewOpen}
        date={dayViewDate}
        phase={dayViewPhase || DAY_VIEW_PHASE.timeline}
        lifelineDays={lifelineDays}
        selfHubDays={selfHubDays}
        routineTemplates={routineTemplates}
        projectActivity={projectActivity}
        stages={stages}
        onUpdateDay={onUpdateLifelineDay}
        onUpdateRoutineTemplates={handleUpdateRoutineTemplates}
        onClose={handleCloseDayDetails}
        backLabel="← Self"
      />
    </div>
  );
}
