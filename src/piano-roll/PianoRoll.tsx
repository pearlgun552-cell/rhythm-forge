import { memo, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import { DrumStepSequencer } from '../components/DrumStepSequencer';
import { isBlackKey, noteName } from '../instruments/keyboardMap';
import { useTransport } from '../sequencer/useTransport';
import { projectStore, useProjectStore } from '../store/projectStore';
import type { Note, Section, Track } from '../types/music';
import { scalePitchClasses } from '../utils/musicTheory';
import { barsForBeats, beatsPerBar, snapBeat } from '../utils/musicConstants';
import { createId } from '../utils/id';

const PITCH_MIN = 0;
const PITCH_MAX = 127;
const ROW_HEIGHT = 26;
const BEAT_WIDTH = 72;
const PITCHES = Array.from({ length: PITCH_MAX - PITCH_MIN + 1 }, (_, index) => PITCH_MAX - index);
const SNAP_OPTIONS = [
  { label: 'Off', beats: 0 },
  { label: '1/32', beats: .125 },
  { label: '1/8T', beats: 1 / 3 },
  { label: '1/4', beats: 1 },
  { label: '1/8', beats: 0.5 },
  { label: '1/16', beats: 0.25 },
];

interface PianoRollProps {
  track: Track | undefined;
  selectedNoteId: string | null;
  selectedNoteIds: string[];
  activePitches: Set<number>;
}

interface MoveInteraction {
  kind: 'move' | 'resize' | 'box';
  startX: number;
  startY: number;
  pointerId: number;
  initialNotes: Note[];
  noteId?: string;
  moved: boolean;
}

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface VelocityInteraction {
  noteId: string;
  pointerId: number;
}

function RollPlayhead({ projectLengthBeats }: { projectLengthBeats: number }) {
  const { positionBeats } = useTransport();
  return <div className="roll-playhead" style={{ left: Math.min(projectLengthBeats, positionBeats) * BEAT_WIDTH }} />;
}

function ScaleGuide({ projectLengthBeats, keyName, sections }: { projectLengthBeats: number; keyName: string; sections: Section[] }) {
  const { positionBeats } = useTransport();
  const section = sections.find((item) => positionBeats >= item.startBeat && positionBeats < item.startBeat + item.durationBeats);
  const scale = scalePitchClasses(section?.keyOverride || keyName);
  return (
    <div className="scale-guide" style={{ width: projectLengthBeats * BEAT_WIDTH }} aria-hidden="true">
      {PITCHES.map((pitch) => <i className={scale.has(pitch % 12) ? 'scale-row in-scale' : 'scale-row out-of-scale'} key={pitch} />)}
    </div>
  );
}

export const PianoRoll = memo(function PianoRoll({ track, selectedNoteId, selectedNoteIds, activePitches }: PianoRollProps) {
  const { project, gridSnap: snapBeats, selectedClipId } = useProjectStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const clip = track?.clips?.find(c => c.id === selectedClipId);
  const visibleNotes = track?.notes.filter(n => !clip || n.clipId === clip.id) ?? [];
  useEffect(() => {
    if (scrollRef.current) {
      const pitch = visibleNotes.length ? Math.max(...visibleNotes.map(n => n.pitch)) : 77;
      scrollRef.current.scrollTop = Math.max(0, (PITCH_MAX - pitch - 2) * ROW_HEIGHT);
      scrollRef.current.scrollLeft = Math.max(0, (clip?.startBeat ?? 0) * BEAT_WIDTH - 40);
    }
  }, [track?.id, selectedClipId]);
  useEffect(() => () => projectStore.endEdit(), []);
  const gridRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<MoveInteraction | null>(null);
  const [noteLength, setNoteLength] = useState(0.5);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [velocityInteraction, setVelocityInteraction] = useState<VelocityInteraction | null>(null);
  const projectLengthBeats = project.projectLengthBeats;
  const gridWidth = projectLengthBeats * BEAT_WIDTH;
  const barBeats = beatsPerBar(project.timeSignature);
  const bars = barsForBeats(projectLengthBeats, project.timeSignature);

  if (track?.type === 'drum') return <DrumStepSequencer track={track} />;

  const noteAtPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const rawBeat = (event.clientX - rect.left) / BEAT_WIDTH;
    const row = Math.floor((event.clientY - rect.top) / ROW_HEIGHT);
    return {
      pitch: PITCH_MAX - row,
      start: Math.min(Math.max(0, projectLengthBeats - Math.max(.010416667, snapBeats)), Math.max(0, snapBeat(rawBeat, snapBeats))),
    };
  };

  const createNote = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!track || !gridRef.current) return;
    const point = noteAtPoint(event);
    if (!point || point.pitch < PITCH_MIN || point.pitch > PITCH_MAX || (clip && (point.start < clip.startBeat || point.start >= clip.startBeat + clip.durationBeats))) return;
    const duration = Math.min(noteLength, projectLengthBeats - point.start);
    projectStore.addNote(track.id, { id: createId('note'), pitch: point.pitch, start: point.start, duration: Math.max(0.05, duration), velocity: 0.85 });
    void audioEngine.resume().then(() => audioEngine.prepareInstrument(track.instrument)).then(() => {
      audioEngine.scheduleNote(point.pitch, audioEngine.currentTime, Math.min(0.22, duration * 0.4), track.instrument, {
        velocity: 0.85,
        trackVolume: track.volume,
        pan: track.pan,
        trackId: track.id,
      });
    });
  };

  const beginBox = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = { kind: 'box', startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, initialNotes: [], moved: false };
    setSelectionBox({ startX: event.clientX, startY: event.clientY, endX: event.clientX, endY: event.clientY });
    if (!event.shiftKey) projectStore.setSelectedNotes([]);
  };

  const beginMove = (event: ReactPointerEvent<HTMLButtonElement>, note: Note) => {
    if (event.button !== 0 || !track) return;
    event.stopPropagation();
    const ids = event.shiftKey
      ? (selectedNoteIds.includes(note.id) ? selectedNoteIds.filter((id) => id !== note.id) : [...selectedNoteIds, note.id])
      : (selectedNoteIds.includes(note.id) ? selectedNoteIds : [note.id]);
    projectStore.setSelectedNotes(ids);
    const initialNotes = track.notes.filter((item) => ids.includes(item.id)).map((item) => ({ ...item }));
    projectStore.beginEdit();
    interactionRef.current = { kind: 'move', startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, initialNotes, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>, note: Note) => {
    event.stopPropagation();
    const parent = event.currentTarget.parentElement;
    parent?.setPointerCapture(event.pointerId);
    projectStore.beginEdit();
    interactionRef.current = { kind: 'resize', startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, initialNotes: [{ ...note }], noteId: note.id, moved: false };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId || !track) return;
    const dx = event.clientX - interaction.startX;
    const dy = event.clientY - interaction.startY;
    interaction.moved = interaction.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2;
    if (interaction.kind === 'box') {
      setSelectionBox({ startX: interaction.startX, startY: interaction.startY, endX: event.clientX, endY: event.clientY });
      return;
    }
    if (!interaction.moved) return;
    if (interaction.kind === 'resize' && interaction.noteId) {
      const original = interaction.initialNotes[0];
      if (!original) return;
      const duration = Math.max(0.05, Math.min(projectLengthBeats - original.start, snapBeat(original.duration + dx / BEAT_WIDTH, snapBeats)));
      projectStore.updateNotes(track.id, { [original.id]: { duration } });
      return;
    }
    const deltaBeat = snapBeat(dx / BEAT_WIDTH, snapBeats);
    const deltaPitch = -Math.round(dy / ROW_HEIGHT);
    const minStartDelta = Math.max(...interaction.initialNotes.map((note) => -note.start));
    const maxPitchDelta = Math.min(...interaction.initialNotes.map((note) => PITCH_MAX - note.pitch));
    const minPitchDelta = Math.max(...interaction.initialNotes.map((note) => PITCH_MIN - note.pitch));
    const maxEndDelta = Math.min(...interaction.initialNotes.map(note => projectLengthBeats - note.start - note.duration));
    const clampedBeat = Math.min(maxEndDelta, Math.max(minStartDelta, deltaBeat));
    const clampedPitch = Math.min(maxPitchDelta, Math.max(minPitchDelta, deltaPitch));
    const changes = Object.fromEntries(interaction.initialNotes.map((note) => [note.id, {
      start: Math.min(projectLengthBeats - note.duration, Math.max(0, note.start + clampedBeat)),
      pitch: Math.min(PITCH_MAX, Math.max(PITCH_MIN, note.pitch + clampedPitch)),
    }]));
    projectStore.updateNotes(track.id, changes);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId || !track) return;
    if (interaction.kind === 'box' && interaction.moved && gridRef.current) {
      const rect = gridRef.current.getBoundingClientRect();
      const left = Math.min(interaction.startX, event.clientX) - rect.left;
      const right = Math.max(interaction.startX, event.clientX) - rect.left;
      const top = Math.min(interaction.startY, event.clientY) - rect.top;
      const bottom = Math.max(interaction.startY, event.clientY) - rect.top;
      const ids = visibleNotes.filter((note) => {
        const noteLeft = note.start * BEAT_WIDTH;
        const noteRight = noteLeft + note.duration * BEAT_WIDTH;
        const noteTop = (PITCH_MAX - note.pitch) * ROW_HEIGHT;
        return noteRight >= left && noteLeft <= right && noteTop + ROW_HEIGHT >= top && noteTop <= bottom;
      }).map((note) => note.id);
      projectStore.setSelectedNotes(event.shiftKey ? [...selectedNoteIds, ...ids] : ids);
    } else if (interaction.kind === 'box' && !interaction.moved) {
      createNote(event as ReactPointerEvent<HTMLDivElement>);
    }
    setSelectionBox(null);
    interactionRef.current = null;
    projectStore.endEdit();
  };

  const updateVelocityFromPointer = (event: ReactPointerEvent<HTMLDivElement>, noteId: string) => {
    const rect = event.currentTarget.closest('.velocity-lane')!.getBoundingClientRect();
    const velocity = Math.max(0.01, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    const ids = selectedNoteIds.includes(noteId) ? selectedNoteIds : [noteId];
    projectStore.setNoteVelocities(track?.id ?? '', Object.fromEntries(ids.map(id => [id, velocity])));
  };

  const beginVelocity = (event: ReactPointerEvent<HTMLDivElement>, note: Note) => {
    if (!track || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    projectStore.beginEdit();
    setVelocityInteraction({ noteId: note.id, pointerId: event.pointerId });
    updateVelocityFromPointer(event, note.id);
  };

  const moveVelocity = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!velocityInteraction || velocityInteraction.pointerId !== event.pointerId) return;
    updateVelocityFromPointer(event, velocityInteraction.noteId);
  };

  const endVelocity = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (velocityInteraction?.pointerId === event.pointerId) { setVelocityInteraction(null); projectStore.endEdit(); }
  };

  return (
    <section className="piano-roll panel">
      <div className="piano-roll-toolbar">
        <div><span>PIANO ROLL</span><h2>{clip?.name || track?.name || 'No Track'}</h2></div>
        <div className="roll-tools">
          {clip && <button className="quantize-button" onClick={() => projectStore.selectClip(null)}>All notes</button>}
          <label>SNAP <select aria-label="Grid Snap" value={snapBeats} onChange={(event) => projectStore.setGridSnap(Number(event.target.value))}>{SNAP_OPTIONS.map((option) => <option key={option.beats} value={option.beats}>{option.label}</option>)}</select></label>
          <label>LENGTH <select aria-label="Note Length" value={noteLength} onChange={(event) => setNoteLength(Number(event.target.value))}>{[0.25, 0.5, 1, 2, barBeats].map((length) => <option key={length} value={length}>{length === barBeats ? '1 Bar' : `${length} beat${length === 1 ? '' : 's'}`}</option>)}</select></label>
          <button className="quantize-button" type="button" onClick={() => projectStore.quantizeSelectedNotes(snapBeats)} disabled={selectedNoteIds.length === 0}>QUANTIZE</button>
          <span className="roll-legend"><i className="legend-note" /> Shift-click / drag select · drag note to move · edge to resize</span>
          <b>{bars} BARS · {project.timeSignature.numerator}/{project.timeSignature.denominator}</b>
        </div>
      </div>
      <div className="roll-scroll" ref={scrollRef}>
        <div className="piano-column">
          <div className="piano-ruler-spacer" />
          {PITCHES.map((pitch) => <div className={`${isBlackKey(pitch) ? 'piano-key black' : 'piano-key'} ${activePitches.has(pitch) ? 'active' : ''}`} key={pitch}><span>{noteName(pitch)}</span></div>)}
        </div>
        <div className="roll-content" style={{ width: gridWidth }}>
          <div className="beat-ruler">{Array.from({ length: bars }, (_, bar) => <span key={bar} style={{ width: barBeats * BEAT_WIDTH }}>{bar + 1}</span>)}</div>
          <div
            ref={gridRef}
            className="note-grid"
            style={{ width: gridWidth, height: PITCHES.length * ROW_HEIGHT }}
            onPointerDown={beginBox}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { interactionRef.current = null; setSelectionBox(null); projectStore.endEdit(); }}
          >
            <ScaleGuide projectLengthBeats={projectLengthBeats} keyName={project.key} sections={project.sections} />
            <RollPlayhead projectLengthBeats={projectLengthBeats} />
            {selectionBox && gridRef.current && <div className="selection-box" style={{ left: Math.min(selectionBox.startX, selectionBox.endX) - gridRef.current.getBoundingClientRect().left, top: Math.min(selectionBox.startY, selectionBox.endY) - gridRef.current.getBoundingClientRect().top, width: Math.abs(selectionBox.endX - selectionBox.startX), height: Math.abs(selectionBox.endY - selectionBox.startY) }} />}
            {visibleNotes.map((note) => (
              <button
                key={note.id}
                className={selectedNoteIds.includes(note.id) || note.id === selectedNoteId ? 'piano-note selected' : 'piano-note'}
                style={{ left: note.start * BEAT_WIDTH + 1, top: (PITCH_MAX - note.pitch) * ROW_HEIGHT + 2, width: Math.max(12, note.duration * BEAT_WIDTH - 2), height: ROW_HEIGHT - 4 }}
                onPointerDown={(event) => beginMove(event, note)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            onPointerCancel={() => { interactionRef.current = null; setSelectionBox(null); projectStore.endEdit(); }}
                aria-label={`${noteName(note.pitch)} at beat ${note.start}`}
              >
                {noteName(note.pitch)}
                <div className="note-resize-handle" onPointerDown={(event) => beginResize(event, note)} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
            onPointerCancel={() => { interactionRef.current = null; setSelectionBox(null); projectStore.endEdit(); }} aria-label={`Resize ${noteName(note.pitch)}`} />
              </button>
            ))}
          </div>
          <div className="velocity-lane" onPointerMove={moveVelocity} onPointerUp={endVelocity} onPointerCancel={endVelocity}>
            <div className="velocity-lane-label">VELOCITY</div>
            {visibleNotes.map((note) => (
              <div
                key={`velocity-${note.id}`}
                className={selectedNoteIds.includes(note.id) ? 'velocity-bar selected' : 'velocity-bar'}
                style={{ left: note.start * BEAT_WIDTH + 1, width: Math.max(8, note.duration * BEAT_WIDTH - 2), height: `${Math.max(4, note.velocity * 100)}%` }}
                onPointerDown={(event) => beginVelocity(event, note)}
                aria-label={`${noteName(note.pitch)} velocity ${Math.round(note.velocity * 100)}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});
