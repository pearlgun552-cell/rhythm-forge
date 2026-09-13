import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorTabs } from './components/EditorTabs';
import { InstrumentPanel } from './components/InstrumentPanel';
import { TrackList } from './components/TrackList';
import { TransportBar } from './components/TransportBar';
import { useComputerKeyboard } from './instruments/useComputerKeyboard';
import { audioEngine } from './audio/AudioEngine';
import { sequencer } from './sequencer/transport';
import { useTransport } from './sequencer/useTransport';
import { languageStore, useLanguage } from './i18n';
import { projectStore, useProjectStore } from './store/projectStore';
import { exportProjectAsMp3, exportProjectAsWav, saveProjectFile } from './utils/projectFiles';

function isEditingText(): boolean {
  const element = document.activeElement;
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}

export default function App() {
  const { project, selectedTrackId, selectedNoteId, selectedNoteIds, isDirty } = useProjectStore();
  const transport = useTransport();
  const { t } = useLanguage();
  const [metronome, setMetronome] = useState(false);
  const [octave, setOctave] = useState(4);
  const [isRecording, setIsRecording] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const fileBusy = useRef(false);
  const [keyboardMode, setKeyboardMode] = useState<'chromatic' | 'scale'>('chromatic');
  const importInputRef = useRef<HTMLInputElement>(null);
  const selectedTrack = useMemo(
    () => project.tracks.find((track) => track.id === selectedTrackId),
    [project.tracks, selectedTrackId],
  );
  const changeOctave = useCallback((value: number) => setOctave(value), []);
  const { activePitches, finishRecording } = useComputerKeyboard(selectedTrack, octave, changeOctave, isRecording, keyboardMode);

  const pauseTransport = useCallback(() => {
    finishRecording();
    setIsRecording(false);
    sequencer.pause();
  }, [finishRecording]);

  const stopTransport = useCallback(() => {
    finishRecording();
    setIsRecording(false);
    sequencer.stop();
  }, [finishRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      finishRecording();
      setIsRecording(false);
      return;
    }
    void sequencer.play().then(() => { if (sequencer.getStatus() === 'playing') setIsRecording(true); }).catch(error => setNotice(String(error)));
  }, [finishRecording, isRecording]);

  const confirmReplace = useCallback(() => !projectStore.getSnapshot().isDirty || window.confirm('Discard unsaved changes? / 放弃尚未保存的修改？'), []);
  const saveProject = useCallback(async (saveAs = false): Promise<boolean> => {
    if (fileBusy.current) return false;
    fileBusy.current = true; setBusy(true);
    const snapshot = projectStore.getSnapshot().project;
    try {
      if (window.rhythmForge?.saveProject) {
        const path = await window.rhythmForge.saveProject(JSON.stringify(snapshot, null, 2), snapshot.name, saveAs);
        if (!path) return false;
        projectStore.markSaved(snapshot); setNotice(`Saved · ${path}`);
      } else {
        if (saveAs) saveProjectFile(snapshot);
        if (!projectStore.save()) throw new Error('Local save failed; use Export JSON to save a file.');
        setNotice(saveAs ? 'JSON downloaded; local recovery saved.' : 'Saved locally · Save As downloads JSON.');
      }
      return true;
    } catch (error) { setNotice(`Save failed: ${String(error)}`); return false; }
    finally { fileBusy.current = false; setBusy(false); }
  }, []);
  const newProject = useCallback(() => {
    if (fileBusy.current || !confirmReplace()) return;
    stopTransport(); projectStore.newProject(); window.rhythmForge?.newProject(); setNotice('New project');
  }, [confirmReplace, stopTransport]);
  const openProject = useCallback(async () => {
    if (fileBusy.current || !confirmReplace()) return;
    if (!window.rhythmForge?.openProject) { importInputRef.current?.click(); return; }
    fileBusy.current = true; setBusy(true);
    try {
      const result = await window.rhythmForge.openProject();
      if (!result) return;
      stopTransport();
      if (!projectStore.importJson(result.content)) throw new Error('Invalid project JSON');
      setNotice(`Opened · ${result.path}`);
    } catch (error) { setNotice(`Open failed: ${String(error)}`); }
    finally { fileBusy.current = false; setBusy(false); }
  }, [confirmReplace, stopTransport]);
  const exportAudio = useCallback(async (format: 'wav' | 'mp3') => {
    if (fileBusy.current) return;
    fileBusy.current = true; setBusy(true); setNotice(`Rendering ${format.toUpperCase()}…`);
    try {
      await (format === 'wav' ? exportProjectAsWav : exportProjectAsMp3)(projectStore.getSnapshot().project);
      setNotice(`${format.toUpperCase()} export ready`);
    } catch (error) { setNotice(`Export failed: ${String(error)}`); }
    finally { fileBusy.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isEditingText()) {
        event.preventDefault();
        projectStore.deleteSelectedNotes();
      }
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyC' && !isEditingText()) {
        event.preventDefault();
        projectStore.copySelectedNotes();
      }
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyV' && !isEditingText()) {
        event.preventDefault();
        projectStore.pasteNotes();
      }
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyD' && !isEditingText()) {
        event.preventDefault();
        projectStore.duplicateSelectedNotes();
      }
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyS' && !isEditingText()) {
        event.preventDefault();
        void saveProject(event.shiftKey);
      }
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ' && !isEditingText()) {
        event.preventDefault();
        if (event.shiftKey) projectStore.redo(); else projectStore.undo();
      }
      if (event.ctrlKey && event.code === 'KeyY' && !isEditingText()) {
        event.preventDefault();
        projectStore.redo();
      }
      if (event.code === 'Space' && !isEditingText()) {
        event.preventDefault();
        if (transport.status === 'playing') pauseTransport();
        else void sequencer.play();
      }
      if (event.code === 'KeyR' && !isEditingText() && !event.repeat) {
        event.preventDefault();
        toggleRecording();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pauseTransport, toggleRecording, transport.status, saveProject]);

  useEffect(() => {
    audioEngine.syncProject(project);
    sequencer.projectChanged(isRecording);
  }, [project, isRecording]);

  useEffect(() => {
    void audioEngine.reloadPiano().catch(error => setNotice(`Piano load failed: ${String(error)}`));
  }, [project.importedSample]);

  useEffect(() => () => {
    finishRecording();
    sequencer.stop();
  }, [finishRecording]);

  useEffect(() => {
    const bridge = window.rhythmForge;
    if (!bridge) return;
    const offLanguage = bridge.onLanguageChange((language) => languageStore.setLanguage(language));
    const offSave = bridge.onSaveProject(() => { void saveProject(); });
    const offExport = bridge.onExportMp3(() => { void exportAudio('mp3'); });
    const offCommand = bridge.onProjectCommand?.(command => {
      if (command === 'new') newProject();
      if (command === 'open') void openProject();
      if (command === 'save' || command === 'save-as') void saveProject(command === 'save-as');
      if (command === 'save-close') void saveProject().then(saved => { if (saved) { bridge.setDirty(false); bridge.closeSaved(); } });
      if (command === 'wav') void exportAudio('wav');
      if (command === 'undo') { if (isEditingText()) document.execCommand('undo'); else projectStore.undo(); }
      if (command === 'redo') { if (isEditingText()) document.execCommand('redo'); else projectStore.redo(); }
    });
    // Tell the main process the persisted language so the View menu radio
    // reflects the current selection on startup.
    bridge.setLanguage(languageStore.getLanguage());
    return () => {
      offLanguage();
      offSave();
      offExport(); offCommand?.();
    };
  }, [saveProject, openProject, newProject, exportAudio]);

  useEffect(() => { window.rhythmForge?.setDirty?.(isDirty); }, [isDirty]);
  useEffect(() => { if (transport.status === 'stopped') setIsRecording(false); }, [transport.status]);

  const toggleMetronome = (enabled: boolean) => {
    setMetronome(enabled);
    sequencer.setMetronome(enabled);
  };

  const changeBpm = (bpm: number) => {
    projectStore.setBpm(bpm);
  };

  const seekTransport = useCallback((beat: number) => sequencer.seek(beat), []);

  const deleteTrack = useCallback((trackId: string) => {
    if (transport.status !== 'stopped') sequencer.stop();
    else audioEngine.stopAll();
    projectStore.deleteTrack(trackId);
  }, [transport.status]);

  const exportProject = useCallback(() => saveProjectFile(projectStore.getSnapshot().project), []);
  const importProject = useCallback(async (file: File) => {
    try {
      const raw = await file.text();
      stopTransport();
      if (!projectStore.importJson(raw)) throw new Error('Invalid or unsupported project JSON.');
      window.rhythmForge?.newProject(); setNotice(`Opened · ${file.name}`);
    } catch (error) { setNotice(String(error)); }
    finally { if (importInputRef.current) importInputRef.current.value = ''; }
  }, [stopTransport]);

  return (
    <div className="app-shell">
      <TransportBar
        project={project}
        status={transport.status}
        positionBeats={transport.positionBeats}
        metronome={metronome}
        isRecording={isRecording}
        isDirty={isDirty}
        onNameChange={(name) => projectStore.setProjectName(name)}
        onBpmChange={changeBpm}
        onProjectLengthChange={(beats) => projectStore.setProjectLengthBeats(beats)}
        onKeyChange={(key) => projectStore.setKey(key)}
        onPlay={() => { void sequencer.play().catch(error => setNotice(String(error))); }}
        onPause={pauseTransport}
        onStop={stopTransport}
        onSeek={seekTransport}
        onRecord={toggleRecording}
        onMetronomeChange={toggleMetronome}
        onSave={() => { void saveProject(); }}
        onNew={newProject}
        onSaveAs={() => { void saveProject(true); }}
        busy={busy}
        onExport={exportProject}
        onImport={() => { void openProject(); }}
        onUndo={() => projectStore.undo()}
        onRedo={() => projectStore.redo()}
        canUndo={projectStore.canUndo()}
        canRedo={projectStore.canRedo()}
        onLoopChange={(enabled) => projectStore.setLoop({ loopEnabled: enabled })}
        onLoopStartChange={(beat) => projectStore.setLoop({ loopStartBeat: beat })}
        onLoopEndChange={(beat) => projectStore.setLoop({ loopEndBeat: beat })}
      />
      <input
        ref={importInputRef}
        className="project-import-input"
        type="file"
        accept="application/json,.json"
        aria-label="Import Project JSON"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importProject(file);
        }}
      />
      <main className="studio-layout">
        <TrackList
          tracks={project.tracks}
          selectedTrackId={selectedTrackId}
          onDeleteTrack={deleteTrack}
        />
        <EditorTabs
          project={project}
          tracks={project.tracks}
          selectedTrack={selectedTrack}
          selectedTrackId={selectedTrackId}
          selectedNoteId={selectedNoteId}
          selectedNoteIds={selectedNoteIds}
          activePitches={activePitches}
          positionBeats={transport.positionBeats}
          onSeek={seekTransport}
        />
        <InstrumentPanel
          track={selectedTrack}
          synths={project.synths}
          project={project}
          octave={octave}
          activePitches={activePitches}
          onOctaveChange={changeOctave}
          onExportMp3={() => { void exportAudio('mp3'); }}
          onExportWav={() => { void exportAudio('wav'); }}
          keyboardKey={project.sections.find(section => transport.positionBeats >= section.startBeat && transport.positionBeats < section.startBeat + section.durationBeats)?.keyOverride || project.key}
          exportBusy={busy}
          keyboardMode={keyboardMode}
          onKeyboardModeChange={setKeyboardMode}
        />
      </main>
      <footer className="status-bar">
        <span className={isRecording ? 'recording-status active' : 'recording-status'}><i /> {isRecording ? t('app.recording') : t('app.audioClock')}</span>
        <span>{project.tracks.length} {project.tracks.length === 1 ? t('app.track') : t('app.tracks')}</span>
        <span>{t('app.localFirst')}</span>
        <span className="status-tip" role="status">{notice || t('app.statusTip')}</span>
      </footer>
    </div>
  );
}
