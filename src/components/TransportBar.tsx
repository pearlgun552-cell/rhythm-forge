import type { Project } from '../types/music';
import type { TransportStatus } from '../sequencer/Sequencer';
import { barsForBeats, beatsPerBar } from '../utils/musicConstants';
import { useLanguage } from '../i18n';

interface TransportBarProps {
  project: Project;
  status: TransportStatus;
  positionBeats: number;
  metronome: boolean;
  isRecording: boolean;
  isDirty: boolean;
  onNameChange: (name: string) => void;
  onBpmChange: (bpm: number) => void;
  onProjectLengthChange: (beats: number) => void;
  onKeyChange: (key: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRecord: () => void;
  onMetronomeChange: (enabled: boolean) => void;
  onSave: () => void;
  onNew: () => void;
  onSaveAs: () => void;
  busy: boolean;
  onExport: () => void;
  onImport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onLoopChange: (enabled: boolean) => void;
  onLoopStartChange: (beat: number) => void;
  onLoopEndChange: (beat: number) => void;
}

const KEYS = [
  'C major', 'G major', 'D major', 'A major', 'E major', 'B major', 'F# major', 'C# major',
  'F major', 'Bb major', 'Eb major', 'Ab major', 'Db major',
  'C minor', 'A minor', 'D minor', 'E minor', 'F# minor', 'B minor', 'G minor',
];

export function TransportBar(props: TransportBarProps) {
  const { t } = useLanguage();
  const beat = Math.floor(props.positionBeats);
  const barBeats = beatsPerBar(props.project.timeSignature);
  const barNumber = Math.floor(beat / barBeats) + 1;
  const beatNumber = (beat % barBeats) + 1;

  return (
    <header className="transport-bar">
      <div className="project-title-wrap">
        <span className="app-mark" aria-hidden="true"><i /><i /><i /></span>
        <div>
          <span className="app-name">RHYTHM FORGE</span>
          <input
            className="project-name-input"
            aria-label={t('transport.projectName')}
            value={props.project.name}
            onChange={(event) => props.onNameChange(event.target.value)}
          />
        </div>
      </div>

      <div className="transport-controls" aria-label={t('transport.transport')}>
        <button className={props.status === 'playing' ? 'icon-control active' : 'icon-control'} onClick={props.onPlay} aria-label={t('transport.play')}>▶</button>
        <button className={props.status === 'paused' ? 'icon-control active' : 'icon-control'} onClick={props.onPause} aria-label={t('transport.pause')}>Ⅱ</button>
        <button className="icon-control" onClick={props.onStop} aria-label={t('transport.stop')}>■</button>
        <button
          className={props.isRecording ? 'icon-control record-control active' : 'icon-control record-control'}
          onClick={props.onRecord}
          aria-label={props.isRecording ? t('transport.stopRecording') : t('transport.record')}
          aria-pressed={props.isRecording}
          title={t('transport.recordTooltip')}
        >
          ●
        </button>
        <div className="position-readout"><b>{String(barNumber).padStart(2, '0')}</b><span>:</span><b>{String(beatNumber).padStart(2, '0')}</b></div>
      </div>

      <div className="transport-settings">
        <label className="compact-field">{t('transport.bpm')}
          <input
            aria-label="BPM"
            type="number"
            min="40"
            max="300"
            value={props.project.bpm}
            onChange={(event) => props.onBpmChange(Number(event.target.value) || 174)}
          />
        </label>
        <span className="time-signature-readout">{props.project.timeSignature.numerator}/{props.project.timeSignature.denominator} · {props.project.bpm} BPM</span>
        <label className="compact-field">KEY
          <select aria-label="Key" value={props.project.key} onChange={(event) => props.onKeyChange(event.target.value)}>
            {[...new Set([...KEYS, props.project.key])].map((key) => <option key={key}>{key}</option>)}
          </select>
        </label>
        <label className="compact-field">LENGTH
          <select aria-label="Project Length" value={props.project.projectLengthBeats} onChange={(event) => props.onProjectLengthChange(Number(event.target.value))}>
            {[...new Set([16, 32, 64, 128, 256, 512, 1024, props.project.projectLengthBeats])].sort((a, b) => a - b).map((beats) => <option key={beats} value={beats}>{barsForBeats(beats, props.project.timeSignature)} bars</option>)}
          </select>
        </label>
        <button className={props.metronome ? 'text-control active' : 'text-control'} onClick={() => props.onMetronomeChange(!props.metronome)} aria-pressed={props.metronome}>
          <span aria-hidden="true">◉</span> {t('transport.metronome')}
        </button>
        <button className={props.project.loopEnabled ? 'text-control active' : 'text-control'} onClick={() => props.onLoopChange(!props.project.loopEnabled)} aria-pressed={props.project.loopEnabled}>LOOP</button>
        <label className="compact-field loop-field">FROM<input aria-label="Loop Start" type="number" min="0" max={props.project.loopEndBeat - 0.25} step="0.25" value={props.project.loopStartBeat} onChange={(event) => props.onLoopStartChange(Number(event.target.value))} /></label>
        <label className="compact-field loop-field">TO<input aria-label="Loop End" type="number" min={props.project.loopStartBeat + 0.25} max={props.project.projectLengthBeats} step="0.25" value={props.project.loopEndBeat} onChange={(event) => props.onLoopEndChange(Number(event.target.value))} /></label>
        <button className="text-control project-file-button" onClick={props.onNew} disabled={props.busy}>New</button>
        <button className="text-control project-file-button" onClick={props.onImport} disabled={props.busy}>Open</button>
        <button className="text-control project-file-button" onClick={props.onSaveAs} disabled={props.busy}>Save As</button>
        <button className="text-control project-file-button" onClick={props.onExport}>Export JSON</button>
        <button className="text-control project-file-button" onClick={props.onUndo} disabled={!props.canUndo} title="Undo (⌘Z)">↶</button>
        <button className="text-control project-file-button" onClick={props.onRedo} disabled={!props.canRedo} title="Redo (⇧⌘Z)">↷</button>
        <button className="save-button" onClick={props.onSave} disabled={props.busy}>Save <span>{props.isDirty ? '•' : '✓'}</span></button>
      </div>
    </header>
  );
}
