import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './hooks/useAuth';
import { useAppState } from './hooks/useAppState';
import { filterRegularProjects } from './utils/lifeline';
import { mergeLiveProjectActivity } from './utils/lifelineDays';
import { getSupabaseConfigError, isSupabaseConfigured } from './lib/supabase';
import { Sidebar } from './components/Sidebar';
import { ProjectsCanvas } from './components/ProjectsCanvas';
import { LifelineWorkspace } from './components/brain/LifelineWorkspace';
import { CurrentFocusPanel } from './components/CurrentFocusPanel';
import { DoNotStartYet } from './components/DoNotStartYet';
import { StageDetails } from './components/StageDetails';
import { WorkspaceView } from './components/WorkspaceView';
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
import { useHealthLifelineSync } from './hooks/useHealthLifelineSync';
import { useSelfHubLiveCapture } from './hooks/useSelfHubLiveCapture';
import { buildSelfHubView } from './utils/selfHubData';
import { useHealthData } from './hooks/useHealthData';
import { useScale, saveScaleProfile } from './hooks/useScale';
import { ScaleConnectModal } from './components/ScaleConnectModal';
import { CamerasConnectModal } from './components/CamerasConnectModal';
import { CamerasView } from './components/CamerasView';
import { PersonalBrandView } from './components/brand/PersonalBrandView';
import { NutritionView } from './components/nutrition/NutritionView';
import { PathView } from './components/path/PathView';
import { loadPathBundle, readPathBundleLocal } from './lib/path/store';
import { pathTabFromPathname } from './utils/appNavigation';
import { MobileBottomNav } from './components/MobileBottomNav';
import { platform } from './platform';
import { useMobilePinchZoom } from './hooks/useMobilePinchZoom';
import { useCameras } from './hooks/useCameras';
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
  const [pathBundle, setPathBundle] = useState(() => readPathBundleLocal());
  const [pathTab, setPathTab] = useState(() => pathTabFromPathname(window.location.pathname) || 'goals');

  const {
    loading,
    workspaceReady,
    retryLoadWorkspace,
    syncing,
    hasUnsavedChanges,
    flushSaveNow,
    syncError,
    syncConflict,
    reloadFromCloud,
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
    lifelineRoutineTemplates,
    updateLifelineRoutineTemplates,
    selectedStageId,
    focusMode,
    activeView,
    setProjectTitle,
    setProjectBrief,
    setSelectedStageId,
    setFocusMode,
    setActiveView,
    openStage,
    openProjectCanvas,
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
    applyProjectsSpineMove,
    resizeProjectsSpine,
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
    applyBrainActions,
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

  useHealthLifelineSync({
    enabled: Boolean(user && lifelineProjectId),
    connected: Boolean(ouraStatus?.connected),
    lastSyncedAt: ouraStatus?.last_synced_at,
    updateLifelineDaysBatch,
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
  const [camerasModalOpen, setCamerasModalOpen] = useState(false);
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

  const cameras = useCameras({
    pollWhenActive: activeView === 'devices' || camerasModalOpen,
  });

  const hubProjectActivity = useMemo(
    () =>
      mergeLiveProjectActivity(projectActivity, {
        id: projectId,
        title: projectTitle,
        stages,
        notes,
        canvasTasks,
        canvasObstacles,
        canvasResources,
        canvasStickies,
        isLifeline,
      }),
    [projectActivity, projectId, projectTitle, stages, notes, canvasTasks, canvasObstacles, canvasResources, canvasStickies, isLifeline],
  );

  const hubView = useMemo(
    () =>
      buildSelfHubView({
        selfData,
        displayName: selfDisplayName,
        ouraStatus,
        scaleConnected: scale.isLinked,
        stages,
        ouraRow: ouraMetricsRow,
        projectActivity: hubProjectActivity,
        selfHubDays,
        isLifeline,
        lifelineDays,
        pathBundle,
      }),
    [
      selfData,
      selfDisplayName,
      ouraStatus,
      scale.isLinked,
      stages,
      ouraMetricsRow,
      hubProjectActivity,
      selfHubDays,
      isLifeline,
      lifelineDays,
      pathBundle,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    loadPathBundle()
      .then((bundle) => {
        if (!cancelled) setPathBundle(bundle);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeView]);

  useSelfHubLiveCapture({
    enabled: Boolean(user),
    activeView,
    selfData,
    hubView,
    projectActivity: hubProjectActivity,
    healthMetrics,
    ouraRow: ouraMetricsRow,
    onCapture: captureSelfHubLiveDay,
  });

  const pinchZoomEnabled =
    platform.isMobile && !canvasFullscreen && activeView !== 'projects';
  const pinchRef = useMobilePinchZoom(pinchZoomEnabled);

  const handleNavigate = (view) => {
    setFocusMode(false);
    const keepsLifelineProject =
      view === 'self' || view === 'path' || view === 'brand' || view === 'settings' || view === 'devices';
    if (isLifeline && !keepsLifelineProject) {
      const regular = filterRegularProjects(projectList);
      const target = regular.find((p) => p.id === projectId && !p.isLifeline) || regular[0];
      if (target && target.id !== projectId) {
        switchProject(target.id).then(() => setActiveView(view));
        return;
      }
      if (!target && view === 'workspace') return;
    }
    setActiveView(view);
  };

  const openPath = (tab = 'goals') => {
    setPathTab(tab);
    handleNavigate('path');
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
    if (activeView === 'whiteboard') setActiveView('projects');
  }, [activeView, setActiveView]);

  useEffect(() => {
    if (isLifeline && activeView === 'workspace') setActiveView('projects');
  }, [isLifeline, activeView, setActiveView]);

  useEffect(() => {
    if (activeView !== 'projects') setCanvasFullscreen(false);
  }, [activeView]);

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

  const handleOpenBrainSource = useCallback(async (source) => {
    if (!source) return;
    if (source.kind === 'brand') {
      setActiveView('brand');
      return;
    }
    if (source.kind === 'self') {
      setActiveView('self');
      return;
    }
    if (source.kind === 'lifeline-day') {
      await openLifeline();
      return;
    }
    if (source.projectId) {
      await openProjectCanvas(source.projectId, source.stageId || null);
    }
  }, [openLifeline, openProjectCanvas, setActiveView]);

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

    if (selectedStage && activeView === 'projects') {
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
      case 'projects': {
        const canvas = (
          <ProjectsCanvas
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
            onApplyProjectsSpine={applyProjectsSpineMove}
            onResizeProjectsSpine={resizeProjectsSpine}
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
            projectId={projectId}
            lifelineAnchors={lifelineAnchors}
            onUpdateLifelineAnchor={setLifelineAnchorDate}
            onAssignLifelineToday={assignLifelineAnchorToday}
            onOpenLifelineProject={openProjectCanvas}
            lifelineDays={lifelineDays}
            selfHubDays={selfHubDays}
            onUpdateLifelineDay={updateLifelineDay}
            projectActivity={hubProjectActivity}
            onRefreshProjectActivity={refreshProjectActivity}
            lifelineFocusToken={lifelineFocusToken}
            syncing={syncing}
            hasUnsavedChanges={hasUnsavedChanges}
            onSave={flushSaveNow}
            syncError={syncError}
            syncConflict={syncConflict}
            onReloadCloud={reloadFromCloud}
            onOpenWorkspace={
              !isLifeline && !platform.isMobile ? () => handleNavigate('workspace') : undefined
            }
            pathBundle={pathBundle}
            onOpenPath={openPath}
          />
        );
        return (
          <LifelineWorkspace
            brainMode={brainMode}
            onBrainModeChange={setBrainMode}
            onApplyBrainActions={applyBrainActions}
            onOpenSource={handleOpenBrainSource}
            snapshotInput={{
              selfData,
              lifelineDays,
              selfHubDays,
              projectList,
              projectActivity: hubProjectActivity,
              currentProject: { id: projectId, title: projectTitle, isLifeline },
              stages,
              goals,
              notes,
              northStars: (pathBundle?.goals || [])
                .filter((goal) => goal.status !== 'Archived' && goal.title)
                .map((goal) => ({ title: goal.title })),
            }}
            contextExtras={{
              projectTitle,
              stageTitle: selectedStage?.title,
              openedFrom: isLifeline ? 'lifeline' : 'project',
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
            onBack={() => handleNavigate('projects')}
          />
        );
      case 'self':
        return (
          <SelfView
            onNavigateHome={() => setActiveView('projects')}
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
            projectActivity={hubProjectActivity}
            notes={notes}
            selfHubDays={selfHubDays}
            mapTheme={mapTheme}
            onMapThemeChange={updateMapTheme}
            isLifeline={isLifeline}
            routineTemplates={lifelineRoutineTemplates}
            onUpdateRoutineTemplates={updateLifelineRoutineTemplates}
            onRefreshProjectActivity={refreshProjectActivity}
            pathBundle={pathBundle}
            onOpenPath={openPath}
            onOpenPathWeek={() => openPath('week')}
          />
        );
      case 'path':
        return (
          <PathView
            projectList={projectList}
            projectId={projectId}
            projectTitle={projectTitle}
            stages={stages}
            canvasTasks={canvasTasks}
            projectActivity={hubProjectActivity}
            initialTab={pathTab}
            onCompleteLinkedTask={(linked) => {
              if (!linked?.taskId) return;
              for (const stage of stages || []) {
                const checkpoint = (stage.checkpoints || []).find((item) => item.id === linked.taskId);
                if (checkpoint) {
                  updateCheckpoint(stage.id, linked.taskId, { done: true });
                  return;
                }
              }
              if ((canvasTasks || []).some((task) => task.id === linked.taskId)) {
                updateCanvasTask(linked.taskId, { status: 'Done' });
              }
            }}
          />
        );
      case 'brand':
        return (
          <PersonalBrandView
            displayName={selfDisplayName}
            lifelineDays={lifelineDays}
            selfHubDays={selfHubDays}
            projectActivity={hubProjectActivity}
            projectList={projectList}
          />
        );
      case 'nutrition':
        return <NutritionView />;
      case 'devices':
        return (
          <CamerasView
            cameras={cameras.cameras}
            frames={cameras.frames}
            supported={cameras.supported}
            liveId={cameras.liveId}
            onSetLiveId={cameras.setLiveId}
            onOpenManage={() => setCamerasModalOpen(true)}
            onRefreshAll={cameras.refreshAll}
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
            onOpenCamerasModal={() => setCamerasModalOpen(true)}
            onOpenCamerasView={() => handleNavigate('devices')}
            camerasConnected={cameras.connected}
            cameraCount={cameras.cameras.length}
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
    <div className={`app ${focusMode ? 'app--focus' : ''} ${selectedStage ? 'app--detail' : ''} ${activeView === 'projects' && !selectedStage ? 'app--projects' : ''} ${activeView === 'self' ? 'app--self' : ''} ${activeView === 'path' ? 'app--path' : ''} ${activeView === 'brand' ? 'app--brand' : ''} ${activeView === 'nutrition' ? 'app--nutrition' : ''} ${activeView === 'settings' ? 'app--settings' : ''} ${activeView === 'devices' ? 'app--devices' : ''} ${canvasFullscreen ? 'app--canvas-fullscreen' : ''} ${sidebarCollapsed ? 'app--sidebar-collapsed' : ''} ${platform.isMobile ? 'app--mobile' : ''}`}>
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
          syncError={syncError}
          syncConflict={syncConflict}
          onReloadCloud={reloadFromCloud}
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
        isIosWeb={platform.isIosWeb}
        backgroundCapture={scale.backgroundCapture}
        phoneCapture={scale.phoneCapture}
        debug={scale.debug}
      />
      <CamerasConnectModal
        open={camerasModalOpen}
        onClose={() => setCamerasModalOpen(false)}
        cameras={cameras.cameras}
        frames={cameras.frames}
        supported={cameras.supported}
        testingId={cameras.testingId}
        onSave={cameras.saveCamera}
        onDelete={cameras.deleteCamera}
        onTest={cameras.testCamera}
        onOpenView={() => handleNavigate('devices')}
      />
    </div>
  );
}
