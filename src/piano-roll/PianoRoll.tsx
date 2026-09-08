import { useRef } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import { isBlackKey, noteName } from '../instruments/keyboardMap';
import { projectStore } from '../store/projectStore';
import type { Track } from '../types/music';
import { createId } from '../utils/id';
import { GRID_BEATS, LOOP_BEATS } from '../utils/musicConstants';

const PITCH_MIN = 48;
const PITCH_MAX = 83;
const ROW_HEIGHT = 26;
const BEAT_WIDTH = 72;
const GRID_WIDTH = LOOP_BEATS * BEAT_WIDTH;
const PITCHES = Array.from({ length: PITCH_MAX - PITCH_MIN + 1 }, (_, index) => PITCH_MAX - index);

interface PianoRollProps {
  track: Track | undefined;
  selectedNoteId: string | null;
  activePitches: Set<number>;
  positionBeats: number;
}

export function PianoRoll({ track, selectedNoteId, activePitches, positionBeats }: PianoRollProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const createNote = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!track || event.button !== 0 || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const rawBeat = (event.clientX - rect.left) / BEAT_WIDTH;
    const row = Math.floor((event.clientY - rect.top) / ROW_HEIGHT);
    const pitch = PITCH_MAX - row;
    const start = Math.min(LOOP_BEATS - GRID_BEATS, Math.max(0, Math.floor(rawBeat / GRID_BEATS) * GRID_BEATS));
    if (pitch < PITCH_MIN || pitch > PITCH_MAX) return;
    projectStore.addNote(track.id, {
      id: createId('note'),
      pitch,
      start,
      duration: Math.min(0.5, LOOP_BEATS - start),
      velocity: 0.85,
    });
    void audioEngine.resume().then(() => audioEngine.prepareInstrument(track.instrument)).then(() => {
      audioEngine.scheduleNote(pitch, audioEngine.currentTime, 0.18, track.instrument, {
        velocity: 0.85,
        trackVolume: track.volume,
        pan: track.pan,
      });
    });
  };

  return (
    <section className="piano-roll panel">
      <div className="piano-roll-toolbar">
        <div><span>PIANO ROLL</span><h2>{track?.name ?? 'No Track'}</h2></div>
        <div className="roll-legend"><span><i className="legend-note" /> Click to create</span><span>Delete removes selected</span><b>1/16 GRID · 16 BARS</b></div>
      </div>
      <div className="roll-scroll">
        <div className="piano-column">
          <div className="piano-ruler-spacer" />
          {PITCHES.map((pitch) => (
            <div className={`${isBlackKey(pitch) ? 'piano-key black' : 'piano-key'} ${activePitches.has(pitch) ? 'active' : ''}`} key={pitch}>
              <span>{noteName(pitch)}</span>
            </div>
          ))}
        </div>
        <div className="roll-content" style={{ width: GRID_WIDTH }}>
          <div className="beat-ruler">
            {Array.from({ length: LOOP_BEATS }, (_, beat) => <span key={beat} style={{ width: BEAT_WIDTH }}>{Math.floor(beat / 4) + 1}.{beat % 4 + 1}</span>)}
          </div>
          <div
            ref={gridRef}
            className="note-grid"
            style={{ width: GRID_WIDTH, height: PITCHES.length * ROW_HEIGHT }}
            onMouseDown={createNote}
          >
            <div className="roll-playhead" style={{ left: positionBeats * BEAT_WIDTH }} />
            {track?.notes.map((note) => (
              <button
                key={note.id}
                className={note.id === selectedNoteId ? 'piano-note selected' : 'piano-note'}
                style={{
                  left: note.start * BEAT_WIDTH + 1,
                  top: (PITCH_MAX - note.pitch) * ROW_HEIGHT + 2,
                  width: Math.max(12, note.duration * BEAT_WIDTH - 2),
                  height: ROW_HEIGHT - 4,
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  projectStore.selectNote(note.id);
                }}
                aria-label={`${noteName(note.pitch)} at beat ${note.start + 1}`}
              >
                {noteName(note.pitch)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
