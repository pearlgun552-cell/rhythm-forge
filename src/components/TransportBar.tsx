import type { Project } from '../types/music';
import type { TransportStatus } from '../sequencer/Sequencer';
import { barsForBeats, beatsPerBar } from '../utils/musicConstants';

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
}

const KEYS = [
  'C major', 'G major', 'D major', 'A major', 'E major', 'B major', 'F# major', 'C# major',
  'F major', 'Bb major', 'Eb major', 'Ab major', 'Db major',
  'C minor', 'A minor', 'D minor', 'E minor', 'F# minor', 'B minor', 'G minor',
];

export function TransportBar(props: TransportBarProps) {
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
            aria-label="Project Name"
            value={props.project.name}
            onChange={(event) => props.onNameChange(event.target.value)}
          />
        </div>
      </div>

      <div className="transport-controls" aria-label="Transport">
        <button className={props.status === 'playing' ? 'icon-control active' : 'icon-control'} onClick={props.onPlay} aria-label="Play">▶</button>
        <button className={props.status === 'paused' ? 'icon-control active' : 'icon-control'} onClick={props.onPause} aria-label="Pause">Ⅱ</button>
        <button className="icon-control" onClick={props.onStop} aria-label="Stop">■</button>
        <button
          className={props.isRecording ? 'icon-control record-control active' : 'icon-control record-control'}
          onClick={props.onRecord}
          aria-label={props.isRecording ? 'Stop Recording' : 'Record'}
          aria-pressed={props.isRecording}
          title="Record computer keyboard (R)"
        >
          ●
        </button>
        <div className="position-readout"><b>{String(barNumber).padStart(2, '0')}</b><span>:</span><b>{String(beatNumber).padStart(2, '0')}</b></div>
      </div>

      <div className="transport-settings">
        <label className="compact-field">BPM
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
            {KEYS.map((key) => <option key={key}>{key}</option>)}
          </select>
        </label>
        <label className="compact-field">LENGTH
          <select aria-label="Project Length" value={props.project.projectLengthBeats} onChange={(event) => props.onProjectLengthChange(Number(event.target.value))}>
            {[128, 256, 512].map((beats) => <option key={beats} value={beats}>{barsForBeats(beats, props.project.timeSignature)} bars</option>)}
          </select>
        </label>
        <button className={props.metronome ? 'text-control active' : 'text-control'} onClick={() => props.onMetronomeChange(!props.metronome)} aria-pressed={props.metronome}>
          <span aria-hidden="true">◉</span> Metronome
        </button>
        <button className="save-button" onClick={props.onSave}>Save <span>{props.isDirty ? '•' : '✓'}</span></button>
      </div>
    </header>
  );
}
