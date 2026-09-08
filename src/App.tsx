import { useCallback, useEffect, useMemo, useState } from 'react';
import { Arrangement } from './components/Arrangement';
import { InstrumentPanel } from './components/InstrumentPanel';
import { TrackList } from './components/TrackList';
import { TransportBar } from './components/TransportBar';
import { useComputerKeyboard } from './instruments/useComputerKeyboard';
import { PianoRoll } from './piano-roll/PianoRoll';
import { audioEngine } from './audio/AudioEngine';
import { sequencer } from './sequencer/transport';
import { useTransport } from './sequencer/useTransport';
import { projectStore, useProjectStore } from './store/projectStore';

function isEditingText(): boolean {
  const element = document.activeElement;
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}

export default function App() {
  const { project, selectedTrackId, selectedNoteId, selectedNoteIds, isDirty } = useProjectStore();
  const transport = useTransport();
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
      />
      <main className="studio-layout">
        <TrackList
          tracks={project.tracks}
          selectedTrackId={selectedTrackId}
          onDeleteTrack={deleteTrack}
        />
        <div className="editor-column">
          <Arrangement project={project} tracks={project.tracks} selectedTrackId={selectedTrackId} />
          <PianoRoll
            track={selectedTrack}
            selectedNoteId={selectedNoteId}
            selectedNoteIds={selectedNoteIds}
            activePitches={activePitches}
          />
        </div>
        <InstrumentPanel
          track={selectedTrack}
          project={project}
          octave={octave}
          activePitches={activePitches}
          onOctaveChange={changeOctave}
        />
      </main>
      <footer className="status-bar">
        <span className={isRecording ? 'recording-status active' : 'recording-status'}><i /> {isRecording ? 'RECORDING' : 'AUDIO CLOCK'}</span>
        <span>{project.tracks.length} TRACK{project.tracks.length === 1 ? '' : 'S'}</span>
        <span>LOCAL FIRST</span>
        <span className="status-tip">R / ● records keyboard to selected track · A–K play · Z/X octave</span>
      </footer>
    </div>
  );
}
