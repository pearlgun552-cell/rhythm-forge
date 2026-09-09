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
import { exportProjectAsMp3, saveProjectFile } from './utils/projectFiles';

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
  const importInputRef = useRef<HTMLInputElement>(null);
  const selectedTrack = useMemo(
    () => project.tracks.find((track) => track.id === selectedTrackId),
    [project.tracks, selectedTrackId],
  );
  const changeOctave = useCallback((value: number) => setOctave(value), []);
  const { activePitches, finishRecording } = useComputerKeyboard(selectedTrack, octave, changeOctave, isRecording);

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
    setIsRecording(true);
    void sequencer.play();
  }, [finishRecording, isRecording]);

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
        projectStore.save();
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
  }, [pauseTransport, toggleRecording, transport.status]);

  useEffect(() => {
    audioEngine.syncProject(project);
    sequencer.projectChanged();
  }, [project]);

  useEffect(() => () => {
    finishRecording();
    sequencer.stop();
  }, [finishRecording]);

  useEffect(() => {
    const bridge = window.rhythmForge;
    if (!bridge) return;
    const offLanguage = bridge.onLanguageChange((language) => languageStore.setLanguage(language));
    const offSave = bridge.onSaveProject(() => saveProjectFile(projectStore.getSnapshot().project));
    const offExport = bridge.onExportMp3(() => { void exportProjectAsMp3(projectStore.getSnapshot().project); });
    // Tell the main process the persisted language so the View menu radio
    // reflects the current selection on startup.
    bridge.setLanguage(languageStore.getLanguage());
    return () => {
      offLanguage();
      offSave();
      offExport();
    };
  }, []);

  const toggleMetronome = (enabled: boolean) => {
    setMetronome(enabled);
    sequencer.setMetronome(enabled);
  };

  const changeBpm = (bpm: number) => {
    if (transport.status !== 'stopped') stopTransport();
    projectStore.setBpm(bpm);
  };

  const deleteTrack = useCallback((trackId: string) => {
    if (transport.status !== 'stopped') sequencer.stop();
    else audioEngine.stopAll();
    projectStore.deleteTrack(trackId);
  }, [transport.status]);

  const exportProject = useCallback(() => {
    const blob = new Blob([projectStore.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${project.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'rhythm-project'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [project.name]);

  const importProject = useCallback(async (file: File) => {
    if (isDirty && !window.confirm('Replace the current unsaved project with this file?')) {
      if (importInputRef.current) importInputRef.current.value = '';
      return;
    }
    const imported = projectStore.importJson(await file.text());
    if (!imported) window.alert('This project file is invalid or unsupported.');
    if (importInputRef.current) importInputRef.current.value = '';
  }, [isDirty]);

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
        onPlay={() => void sequencer.play()}
        onPause={pauseTransport}
        onStop={stopTransport}
        onRecord={toggleRecording}
        onMetronomeChange={toggleMetronome}
        onSave={() => projectStore.save()}
        onExport={exportProject}
        onImport={() => importInputRef.current?.click()}
        onUndo={() => projectStore.undo()}
        onRedo={() => projectStore.redo()}
        canUndo={projectStore.canUndo()}
        canRedo={projectStore.canRedo()}
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
        />
        <InstrumentPanel
          track={selectedTrack}
          synths={project.synths}
          project={project}
          octave={octave}
          activePitches={activePitches}
          onOctaveChange={changeOctave}
          onExportMp3={() => { void exportProjectAsMp3(projectStore.getSnapshot().project); }}
        />
      </main>
      <footer className="status-bar">
        <span className={isRecording ? 'recording-status active' : 'recording-status'}><i /> {isRecording ? t('app.recording') : t('app.audioClock')}</span>
        <span>{project.tracks.length} {project.tracks.length === 1 ? t('app.track') : t('app.tracks')}</span>
        <span>{t('app.localFirst')}</span>
        <span className="status-tip">{t('app.statusTip')}</span>
      </footer>
    </div>
  );
}
