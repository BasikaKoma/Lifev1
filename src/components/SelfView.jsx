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
  SelfHubMenu,
} from './self/hub';
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
