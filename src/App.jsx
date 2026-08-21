import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './hooks/useAuth';
import { useAppState } from './hooks/useAppState';
import { filterRegularProjects } from './utils/lifeline';
import { getSupabaseConfigError, isSupabaseConfigured } from './lib/supabase';
import { Sidebar } from './components/Sidebar';
import { BusinessPath } from './components/BusinessPath';
import { RoadmapCanvas } from './components/RoadmapCanvas';
import { LifelineWorkspace } from './components/brain/LifelineWorkspace';
import { CurrentFocusPanel } from './components/CurrentFocusPanel';
import { DoNotStartYet } from './components/DoNotStartYet';
import { StageDetails } from './components/StageDetails';
import { WorkspaceView } from './components/WorkspaceView';
import { GlobalRoadmapView } from './components/GlobalRoadmapView';
import { SettingsView } from './components/SettingsView';
import { SelfView } from './components/SelfView';
import { OuraConnectModal } from './components/OuraConnectModal';
import { AssistantOrb } from './components/AssistantOrb';
import { QuickNoteOrb } from './components/QuickNoteOrb';
import { AuthView } from './components/AuthView';
import { ConfigErrorView } from './components/ConfigErrorView';
import { APP_NAME } from './constants/branding';
import { useOura, useOuraOAuthReturn } from './hooks/useOura';
import { useProfile } from './hooks/useProfile';
import { useHealthSelfHubSync } from './hooks/useHealthSelfHubSync';
import { useSelfHubLiveCapture } from './hooks/useSelfHubLiveCapture';
import { buildSelfHubView } from './utils/selfHubData';
import { useHealthData } from './hooks/useHealthData';
import { useScale, saveScaleProfile } from './hooks/useScale';
import { ScaleConnectModal } from './components/ScaleConnectModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { platform } from './platform';
import { useMobilePinchZoom } from './hooks/useMobilePinchZoom';
import * as deepLink from './platform/deepLink';
import { installOfflineFlush } from './lib/sync/offlineQueue';
import { upsertMetricsBatch } from './lib/health/healthMetrics';
import './App.css';

export default function App() {
  const configError = getSupabaseConfigError();
  const { user, authLoading, isConfigured, signIn, signUp, signOut } = useAuth();

  if (configError && !isSupabaseConfigured()) {
    return <ConfigErrorView message={configError} />;
  }

  if (isConfigured && authLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading__spinner" />
        <p>Loading {APP_NAME}…</p>
      </div>
    );
  }

  if (isConfigured && !user) {
    return <AuthView onSignIn={signIn} onSignUp={signUp} />;
  }

  return <MainApp user={user} onSignOut={signOut} />;
}

function MainApp({ user, onSignOut }) {
  const [brainMode, setBrainMode] = useState('closed');

  const {
    loading,
    workspaceReady,
    retryLoadWorkspace,
    syncing,
    hasUnsavedChanges,
    flushSaveNow,
    syncError,
    projectId,
    projectList,
    projectTitle,
    projectBrief,
    stages,
    goals,
    notes,
    backlog,
    canvasConnections,
    canvasStickies,
    canvasObstacles,
    canvasResources,
    canvasTasks,
    canvasInk,
    mapTheme,
    updateMapTheme,
    selectedStageId,
    focusMode,
    activeView,
    setProjectTitle,
    setProjectBrief,
    setSelectedStageId,
    setFocusMode,
    setActiveView,
    openStage,
    openProjectRoadmap,
    openLifeline,
    lifelineProjectId,
    lastRegularProjectId,
    lifelineFocusToken,
    lifelineAnchors,
    setLifelineAnchorDate,
    assignLifelineAnchorToday,
    lifelineDays,
    updateLifelineDay,
    updateLifelineDaysBatch,
    selfHubDays,
    captureSelfHubLiveDay,
    projectActivity,
    refreshProjectActivity,
    isLifeline,
    closeStage,
    switchProject,
    createNewProject,
    deleteCurrentProject,
    updateStage,
    updateStagePlan,
    addStage,
    reorderStage,
    moveStagePosition,
    moveStageTimelineY,
    moveItemTimelineY,
    applyRoadmapSpineMove,
    resizeRoadmapSpine,
    clearStageFromCanvas,
    addGoal,
    updateGoal,
    moveGoal,
    removeGoal,
    moveStage,
    removeStage,
    addCheckpoint,
    updateCheckpoint,
    removeCheckpoint,
    reorderCheckpoint,
    addIdea,
    updateIdea,
    removeIdea,
    moveIdeaPosition,
    addBacklogIdea,
    removeBacklogIdea,
    moveBacklogIdeaPosition,
    clearIdeaFromCanvas,
    addCanvasConnection,
    removeCanvasConnection,
    addCanvasSticky,
    updateCanvasSticky,
    moveCanvasSticky,
    clearStickyFromCanvas,
    removeCanvasSticky,
    updateNodeCanvasStyle,
    applyCanvasAutoLayout,
    addCanvasInkStroke,
    removeCanvasInkStrokes,
    moveCanvasInkStrokes,
    clearCanvasInk,
    undo,
    addBlocker,
    updateBlocker,
    addCanvasObstacle,
    updateCanvasObstacle,
    moveCanvasObstacle,
    removeCanvasObstacle,
    clearCanvasObstacleFromCanvas,
    addCanvasResource,
    updateCanvasResource,
    moveCanvasResource,
    removeCanvasResource,
    clearCanvasResourceFromCanvas,
    addCanvasTask,
    updateCanvasTask,
    moveCanvasTask,
    removeCanvasTask,
    clearCanvasTaskFromCanvas,
    addDecision,
    updateDecision,
    markStageDone,
    toggleStageComplete,
    clearAllData,
    addNote,
    updateNote,
    deleteNote,
    applyAssistantIntents,
    applySmartCapture,
    undoSmartCapture,
  } = useAppState(user?.id);

  const {
    status: ouraStatus,
    selfData: ouraSelfData,
    metricsRow: ouraMetricsRow,
    loading: ouraLoading,
    busy: ouraBusy,
    error: ouraError,
    connect: connectOura,
    disconnect: disconnectOura,
    sync: syncOuraData,
    refreshAll: refreshOura,
  } = useOura({ enabled: Boolean(user), pollWhenActive: activeView === 'self' });

  const {
    displayName: selfDisplayName,
    setDisplayName: setSelfDisplayName,
    saveDisplayName: saveSelfDisplayName,
    saving: savingSelfDisplayName,
    error: selfDisplayNameError,
  } = useProfile({ enabled: Boolean(user), user });

  const { pushHealthToSelfHub } = useHealthSelfHubSync({
    enabled: Boolean(user),
    connected: Boolean(ouraStatus?.connected),
    lastSyncedAt: ouraStatus?.last_synced_at,
    onCaptureHealth: captureSelfHubLiveDay,
  });

  const {
    selfData: healthSelfData,
    healthMetrics,
    refresh: refreshHealth,
  } = useHealthData({
    enabled: Boolean(user),
    ouraRow: ouraMetricsRow,
    ouraConnected: Boolean(ouraStatus?.connected),
  });

  const selfData =
    ouraStatus?.connected
      ? healthSelfData?.source === 'merged'
        ? healthSelfData
        : ouraSelfData
      : healthSelfData?.source !== 'empty'
        ? healthSelfData
        : ouraSelfData;

  const [ouraModalOpen, setOuraModalOpen] = useState(false);
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('lifev1-sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });

  const handleWeightSaved = useCallback(() => {
    refreshHealth().catch(() => {});
    pushHealthToSelfHub().catch(() => {});
  }, [refreshHealth, pushHealthToSelfHub]);

  const scale = useScale({
    enabled: Boolean(user),
    modalOpen: scaleModalOpen,
    onWeightSaved: handleWeightSaved,
  });

  const hubView = useMemo(
    () =>
      buildSelfHubView({
        selfData,
        displayName: selfDisplayName,
        ouraStatus,
        scaleConnected: scale.isLinked,
        stages,
        ouraRow: ouraMetricsRow,
        projectActivity,
        selfHubDays,
      }),
    [
      selfData,
      selfDisplayName,
      ouraStatus,
      scale.isLinked,
      stages,
      ouraMetricsRow,
      projectActivity,
      selfHubDays,
    ],
  );

  useSelfHubLiveCapture({
    enabled: Boolean(user),
    activeView,
    selfData,
    hubView,
    projectActivity,
    healthMetrics,
    ouraRow: ouraMetricsRow,
    onCapture: captureSelfHubLiveDay,
  });

  const pinchZoomEnabled =
    platform.isMobile && !canvasFullscreen && activeView !== 'roadmap' && activeView !== 'overview';
  const pinchRef = useMobilePinchZoom(pinchZoomEnabled);

  const handleNavigate = (view) => {
    setFocusMode(false);
    const keepsLifelineProject = view === 'self' || view === 'settings' || view === 'overview';
    if (isLifeline && !keepsLifelineProject) {
      const regular = filterRegularProjects(projectList);
      const target = regular.find((p) => p.id === projectId && !p.isLifeline) || regular[0];
      if (target && target.id !== projectId) {
        switchProject(target.id).then(() => setActiveView(view));
        return;
      }
    }
    setActiveView(view);
  };

  useEffect(() => {
    return installOfflineFlush(async (item) => {
      if (item.type === 'health_metrics' && item.metrics?.length) {
        await upsertMetricsBatch(item.metrics);
      }
    });
  }, []);

  useEffect(() => {
    return deepLink.onDeepLink((url) => {
      const result = deepLink.parseOuraCallback(url);
      if (result?.success) {
        refreshOura()
          .then(() => pushHealthToSelfHub())
          .catch(() => {});
        setActiveView('self');
        setOuraModalOpen(true);
      }
    });
  }, [pushHealthToSelfHub, refreshOura, setActiveView]);

  useOuraOAuthReturn({
    onConnected: () => {
      refreshOura()
        .then(() => pushHealthToSelfHub())
        .catch(() => {});
      setActiveView('self');
      setOuraModalOpen(true);
    },
  });

  const handleOuraConnect = async () => {
    try {
      await connectOura();
    } catch {
      setOuraModalOpen(true);
    }
  };

  const handleOuraSync = async () => {
    await syncOuraData();
    await pushHealthToSelfHub();
    await refreshHealth();
  };

  const handleSaveSelfDisplayName = async () => {
    try {
      await saveSelfDisplayName(selfDisplayName);
    } catch {
      /* error surfaced in hook */
    }
  };

  const handleOuraDisconnect = async () => {
    if (!window.confirm('Αποσύνδεση Oura; Τα tokens θα διαγραφούν από το cloud.')) return;
    await disconnectOura();
  };

  const selectedStage = stages.find((s) => s.id === selectedStageId) || null;

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('lifev1-sidebar-collapsed', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    if (activeView === 'whiteboard') setActiveView('roadmap');
  }, [activeView, setActiveView]);

  useEffect(() => {
    if (activeView !== 'roadmap') setCanvasFullscreen(false);
  }, [activeView]);

  useEffect(() => {
    if (!isLifeline && brainMode !== 'closed') setBrainMode('closed');
  }, [isLifeline, brainMode]);

  useEffect(() => {
    if (selectedStage) setCanvasFullscreen(false);
  }, [selectedStage]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setCanvasFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const handleSelectStage = (stageId) => {
    openStage(stageId);
  };

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading__spinner" />
        <p>Φόρτωση projects…</p>
      </div>
    );
  }

  if (!workspaceReady) {
    return (
      <div className="workspace-error">
        <div className="workspace-error__card">
          <h1>Δεν φορτώθηκε το workspace</h1>
          <p>
            {syncError || 'Η σύνδεση με τη βάση απέτυχε. Τα κλικ δεν λειτουργούν μέχρι να φορτωθεί project.'}
          </p>
          <div className="workspace-error__actions">
            <button type="button" className="btn btn--primary" onClick={() => retryLoadWorkspace()}>
              Δοκίμασε ξανά
            </button>
            <button type="button" className="btn btn--ghost" onClick={onSignOut}>
              Αποσύνδεση
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (focusMode) {
      return (
        <>
          <div className="focus-banner">
            <span>Focus Mode — only what matters right now</span>
          </div>
          <CurrentFocusPanel stages={stages} />
          <DoNotStartYet stages={stages} />
        </>
      );
    }

    if (selectedStage && activeView === 'roadmap') {
      return (
        <StageDetails
          stage={selectedStage}
          stages={stages}
          onClose={closeStage}
          onUpdateStage={updateStage}
          onUpdateStagePlan={updateStagePlan}
          onUpdateCheckpoint={updateCheckpoint}
          onRemoveCheckpoint={removeCheckpoint}
          onAddCheckpoint={addCheckpoint}
          onUpdateIdea={updateIdea}
          onAddIdea={addIdea}
          onUpdateBlocker={updateBlocker}
          onAddBlocker={addBlocker}
          onUpdateDecision={updateDecision}
          onAddDecision={addDecision}
          onMarkStageDone={markStageDone}
          onToggleStageComplete={toggleStageComplete}
        />
      );
    }

    switch (activeView) {
      case 'overview':
        return (
          <GlobalRoadmapView
            currentProjectId={projectId}
            projectList={projectList}
            onSelectStage={(id, stageId) => openProjectRoadmap(id, stageId)}
            onOpenProject={(id) => openProjectRoadmap(id)}
          />
        );
      case 'roadmap': {
        const canvas = (
          <RoadmapCanvas
            stages={stages}
            backlog={backlog}
            canvasConnections={canvasConnections}
            canvasStickies={canvasStickies}
            canvasObstacles={canvasObstacles}
            canvasResources={canvasResources}
            canvasTasks={canvasTasks}
            canvasInk={canvasInk}
            onSelectStage={handleSelectStage}
            onUpdateStage={updateStage}
            onAddCheckpoint={addCheckpoint}
            onUpdateCheckpoint={updateCheckpoint}
            onRemoveCheckpoint={removeCheckpoint}
            onReorderCheckpoint={reorderCheckpoint}
            onAddMilestone={addStage}
            onMoveStagePosition={moveStagePosition}
            onMoveStageTimelineY={moveStageTimelineY}
            onMoveItemTimelineY={moveItemTimelineY}
            onApplyRoadmapSpine={applyRoadmapSpineMove}
            onResizeRoadmapSpine={resizeRoadmapSpine}
            onClearStageFromCanvas={clearStageFromCanvas}
            onMoveIdeaPosition={moveIdeaPosition}
            onMoveBacklogIdeaPosition={moveBacklogIdeaPosition}
            onAddBacklogIdea={addBacklogIdea}
            onClearIdeaFromCanvas={clearIdeaFromCanvas}
            onAddCanvasConnection={addCanvasConnection}
            onRemoveCanvasConnection={removeCanvasConnection}
            onAddCanvasSticky={addCanvasSticky}
            onUpdateCanvasSticky={updateCanvasSticky}
            onMoveCanvasSticky={moveCanvasSticky}
            onClearStickyFromCanvas={clearStickyFromCanvas}
            onUpdateNodeCanvasStyle={updateNodeCanvasStyle}
            onApplyAutoLayout={applyCanvasAutoLayout}
            onRemoveStage={removeStage}
            onRemoveBacklogIdea={removeBacklogIdea}
            onRemoveIdea={removeIdea}
            onRemoveCanvasSticky={removeCanvasSticky}
            onAddCanvasObstacle={addCanvasObstacle}
            onUpdateCanvasObstacle={updateCanvasObstacle}
            onMoveCanvasObstacle={moveCanvasObstacle}
            onRemoveCanvasObstacle={removeCanvasObstacle}
            onAddCanvasResource={addCanvasResource}
            onUpdateCanvasResource={updateCanvasResource}
            onMoveCanvasResource={moveCanvasResource}
            onRemoveCanvasResource={removeCanvasResource}
            onAddCanvasTask={addCanvasTask}
            onUpdateCanvasTask={updateCanvasTask}
            onMoveCanvasTask={moveCanvasTask}
            onRemoveCanvasTask={removeCanvasTask}
            onAddCanvasInkStroke={addCanvasInkStroke}
            onRemoveCanvasInkStrokes={removeCanvasInkStrokes}
            onMoveCanvasInkStrokes={moveCanvasInkStrokes}
            onClearCanvasInk={clearCanvasInk}
            onUndo={undo}
            onAddNote={addNote}
            onAddGoal={addGoal}
            mapTheme={mapTheme}
            onMapThemeChange={updateMapTheme}
            isFullscreen={canvasFullscreen}
            onFullscreenChange={setCanvasFullscreen}
            isLifeline={isLifeline}
            lifelineAnchors={lifelineAnchors}
            onUpdateLifelineAnchor={setLifelineAnchorDate}
            onAssignLifelineToday={assignLifelineAnchorToday}
            onOpenLifelineProject={openProjectRoadmap}
            lifelineDays={lifelineDays}
            selfHubDays={selfHubDays}
            onUpdateLifelineDay={updateLifelineDay}
            projectActivity={projectActivity}
            onRefreshProjectActivity={refreshProjectActivity}
            lifelineFocusToken={lifelineFocusToken}
            syncing={syncing}
            hasUnsavedChanges={hasUnsavedChanges}
            onSave={flushSaveNow}
            onOpenWorkspace={!platform.isMobile ? () => handleNavigate('workspace') : undefined}
          />
        );
        if (!isLifeline) return canvas;
        return (
          <LifelineWorkspace
            brainMode={brainMode}
            onBrainModeChange={setBrainMode}
            snapshotInput={{
              selfData,
              lifelineDays,
              selfHubDays,
              projectList,
              currentProject: { id: projectId, title: projectTitle },
              stages,
              goals,
              notes,
            }}
            contextExtras={{
              projectTitle,
              stageTitle: selectedStage?.title,
            }}
          >
            {canvas}
          </LifelineWorkspace>
        );
      }
      case 'workspace':
        return (
          <WorkspaceView
            stages={stages}
            goals={goals}
            notes={notes}
            backlog={backlog}
            canvasStickies={canvasStickies}
            canvasConnections={canvasConnections}
            canvasObstacles={canvasObstacles}
            canvasResources={canvasResources}
            canvasTasks={canvasTasks}
            projectTitle={projectTitle}
            onTitleChange={setProjectTitle}
            projectBrief={projectBrief}
            onBriefChange={setProjectBrief}
            onSelectStage={handleSelectStage}
            onAddNote={addNote}
            onUpdateNote={updateNote}
            onUpdateSticky={updateCanvasSticky}
            onUpdateStage={updateStage}
            onUpdateCheckpoint={updateCheckpoint}
            onAddTask={addCanvasTask}
            onUpdateTask={updateCanvasTask}
          />
        );
      case 'self':
        return (
          <SelfView
            onNavigateHome={() => setActiveView('roadmap')}
            selfData={selfData}
            ouraStatus={ouraStatus}
            ouraLoading={ouraLoading}
            ouraBusy={ouraBusy}
            ouraError={ouraError}
            onOpenOuraModal={() => setOuraModalOpen(true)}
            onOpenScaleModal={() => setScaleModalOpen(true)}
            onSyncOura={handleOuraSync}
            scaleConnected={scale.isLinked}
            scaleBleConnected={scale.connected}
            scalePaired={scale.isLinked}
            displayName={selfDisplayName}
            stages={stages}
            ouraRow={ouraMetricsRow}
            lifelineDays={lifelineDays}
            onUpdateLifelineDay={updateLifelineDay}
            projectActivity={projectActivity}
            selfHubDays={selfHubDays}
            mapTheme={mapTheme}
            onMapThemeChange={updateMapTheme}
            onRefreshProjectActivity={refreshProjectActivity}
          />
        );
      case 'settings':
        return (
          <SettingsView
            focusMode={focusMode}
            onFocusModeToggle={setFocusMode}
            onClearAllData={clearAllData}
            onFlushSave={flushSaveNow}
            projectId={projectId}
            isLifeline={isLifeline}
            user={user}
            onSignOut={onSignOut}
            ouraStatus={ouraStatus}
            onOpenOuraModal={() => setOuraModalOpen(true)}
            onOpenScaleModal={() => setScaleModalOpen(true)}
            scaleConnected={scale.isLinked}
            scaleBleConnected={scale.connected}
            scalePaired={scale.isLinked}
            selfDisplayName={selfDisplayName}
            onSelfDisplayNameChange={setSelfDisplayName}
            onSaveSelfDisplayName={handleSaveSelfDisplayName}
            savingSelfDisplayName={savingSelfDisplayName}
            selfDisplayNameError={selfDisplayNameError}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className={`app ${focusMode ? 'app--focus' : ''} ${selectedStage ? 'app--detail' : ''} ${activeView === 'overview' ? 'app--overview' : ''} ${activeView === 'roadmap' && !selectedStage ? 'app--roadmap' : ''} ${activeView === 'self' ? 'app--self' : ''} ${activeView === 'settings' ? 'app--settings' : ''} ${canvasFullscreen ? 'app--canvas-fullscreen' : ''} ${sidebarCollapsed ? 'app--sidebar-collapsed' : ''} ${platform.isMobile ? 'app--mobile' : ''}`}>
      {!canvasFullscreen && !platform.isMobile && (
        <Sidebar
          activeView={activeView}
          onNavigate={handleNavigate}
          projectTitle={projectTitle}
          projectId={projectId}
          projectList={projectList}
          onSwitchProject={switchProject}
          onCreateProject={createNewProject}
          onDeleteProject={deleteCurrentProject}
          isLifeline={isLifeline}
          lifelineProjectId={lifelineProjectId}
          lastRegularProjectId={lastRegularProjectId}
          onOpenLifeline={openLifeline}
          syncing={syncing}
          hasUnsavedChanges={hasUnsavedChanges}
          onSave={flushSaveNow}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapsed}
        >
          <QuickNoteOrb
            placement="sidebar"
            stages={stages}
            projectList={projectList}
            currentProjectId={projectId}
            currentProjectTitle={projectTitle}
            lifelineProjectId={lifelineProjectId}
            onCapture={applySmartCapture}
            onOpenProject={switchProject}
            onUndoCapture={undoSmartCapture}
          />
        </Sidebar>
      )}

      <div className="app__content" ref={pinchRef}>
        <main className="main">{renderContent()}</main>
      </div>

      <MobileBottomNav
        activeView={activeView}
        isLifeline={isLifeline}
        onNavigate={handleNavigate}
        onOpenLifeline={openLifeline}
        hidden={canvasFullscreen || focusMode}
      />

      {(!canvasFullscreen && platform.isMobile) && (
        <QuickNoteOrb
          placement="global"
          stages={stages}
          projectList={projectList}
          currentProjectId={projectId}
          currentProjectTitle={projectTitle}
          lifelineProjectId={lifelineProjectId}
          onCapture={applySmartCapture}
          onOpenProject={switchProject}
          onUndoCapture={undoSmartCapture}
        />
      )}

      {!canvasFullscreen && !platform.isMobile && brainMode === 'closed' && (
        <AssistantOrb
          goals={goals}
          stages={stages}
          projectTitle={projectTitle}
          projectBrief={projectBrief}
          onApply={applyAssistantIntents}
        />
      )}

      <OuraConnectModal
        open={ouraModalOpen}
        onClose={() => setOuraModalOpen(false)}
        status={ouraStatus}
        metricsRow={ouraMetricsRow}
        loading={ouraLoading}
        busy={ouraBusy}
        error={ouraError}
        onConnect={handleOuraConnect}
        onSync={handleOuraSync}
        onDisconnect={handleOuraDisconnect}
      />
      <ScaleConnectModal
        open={scaleModalOpen}
        onClose={() => setScaleModalOpen(false)}
        available={scale.available}
        scanning={scale.scanning}
        connecting={scale.connecting}
        connected={scale.isLinked}
        bleConnected={scale.connected}
        reconnecting={scale.reconnecting}
        devices={scale.devices}
        lastMeasurement={scale.lastMeasurement}
        error={scale.error}
        profile={scale.profile}
        onScan={scale.scan}
        onConnect={scale.connect}
        onPickAndConnect={scale.pickAndConnect}
        onReconnect={scale.reconnect}
        onForceReconnect={scale.forceReconnect}
        onDisconnect={scale.disconnect}
        onSaveProfile={saveScaleProfile}
        isMobile={platform.isMobile}
        isWeb={platform.isWeb}
        backgroundCapture={scale.backgroundCapture}
        debug={scale.debug}
      />
    </div>
  );
}
