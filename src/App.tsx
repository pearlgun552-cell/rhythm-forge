import { useCallback, useEffect, useMemo, useState } from 'react';
import { EditorTabs } from './components/EditorTabs';
import { InstrumentPanel } from './components/InstrumentPanel';
import { TrackList } from './components/TrackList';
import { TransportBar } from './components/TransportBar';
import { useComputerKeyboard } from './instruments/useComputerKeyboard';
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
  const { project, selectedTrackId, selectedNoteId, isDirty } = useProjectStore();
  const transport = useTransport();
  const { t } = useLanguage();
  const [metronome, setMetronome] = useState(false);
  const [octave, setOctave] = useState(4);
  const [isRecording, setIsRecording] = useState(false);
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
        projectStore.deleteSelectedNote();
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
        onKeyChange={(key) => projectStore.setKey(key)}
        onPlay={() => void sequencer.play()}
        onPause={pauseTransport}
        onStop={stopTransport}
        onRecord={toggleRecording}
        onMetronomeChange={toggleMetronome}
        onSave={() => projectStore.save()}
      />
      <main className="studio-layout">
        <TrackList tracks={project.tracks} selectedTrackId={selectedTrackId} />
        <EditorTabs
          tracks={project.tracks}
          selectedTrack={selectedTrack}
          selectedTrackId={selectedTrackId}
          selectedNoteId={selectedNoteId}
          activePitches={activePitches}
          positionBeats={transport.positionBeats}
        />
        <InstrumentPanel
          track={selectedTrack}
          synths={project.synths}
          octave={octave}
          activePitches={activePitches}
          onOctaveChange={changeOctave}
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
