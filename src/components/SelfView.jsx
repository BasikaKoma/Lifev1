import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { buildSelfHubView } from '../utils/selfHubData';
import { localTodayIsoDate } from '../utils/selfDateUtils';
import { useLifelineDayView, DAY_VIEW_PHASE } from '../hooks/useLifelineDayView';
import { LifelineDayModal } from './LifelineDayModal';
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
} from '../utils/lifelineDays';
import { getSelfHubDayEntry } from '../utils/selfHubDays';
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
  selfHubDays = {},
  mapTheme = null,
  onMapThemeChange,
  onRefreshProjectActivity,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusMessage, setFocusMessage] = useState(null);
  const menuRef = useRef(null);
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
      }),
    [selfData, displayName, ouraStatus, scaleConnected, stages, ouraRow, projectActivity, selfHubDays],
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
      onMapThemeChange?.({
        lifeline: {
          ...(mapTheme?.lifeline || {}),
          routineTemplates: templates,
        },
      });
    },
    [mapTheme, onMapThemeChange],
  );

  const today = localTodayIsoDate();
  const routineTemplates = normalizeRoutineTemplates(mapTheme?.lifeline?.routineTemplates);
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
          <SelfHub floatingMetrics={hubView.floatingMetrics} capacity={hubView.capacity} />

          <SelfDayProgress
            dayProgress={hubView.dayProgress}
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
        routineTemplates={mapTheme?.lifeline?.routineTemplates ?? []}
        projectActivity={projectActivity}
        onUpdateDay={onUpdateLifelineDay}
        onUpdateRoutineTemplates={handleUpdateRoutineTemplates}
        onClose={handleCloseDayDetails}
        backLabel="← Self"
      />
    </div>
  );
}
