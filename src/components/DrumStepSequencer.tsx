import { memo, useState } from 'react';
import { projectStore } from '../store/projectStore';
import type { DrumSound, Track } from '../types/music';

const SOUNDS: Array<{ id: DrumSound; label: string }> = [
  { id: 'kick', label: 'Kick' },
  { id: 'snare', label: 'Snare' },
  { id: 'closed-hat', label: 'Closed Hat' },
  { id: 'open-hat', label: 'Open Hat' },
  { id: 'clap', label: 'Clap' },
];

export const DrumStepSequencer = memo(function DrumStepSequencer({ track }: { track: Track }) {
  const [page, setPage] = useState(0);
  const hits = track.notes.filter(n => n.drumSound);
  const pattern = track.drumPattern;
  if (!pattern) return null;
  return (
    <section className="piano-roll panel drum-step-panel">
      <div className="piano-roll-toolbar">
        <div><span>DRUM STEP SEQUENCER</span><h2>{track.name}</h2></div>
        <div className="roll-legend"><span>16 steps · 1 bar · follows Audio Clock</span><b>4/4</b></div>
      </div>
      <div className="drum-step-content">
        <div className="drum-step-ruler"><span />{Array.from({ length: pattern.stepCount }, (_, step) => <b key={step}>{step + 1}</b>)}</div>
        {SOUNDS.map((sound) => (
          <div className="drum-step-row" key={sound.id}>
            <strong>{sound.label}</strong>
            {pattern.steps[sound.id].map((enabled, step) => (
              <button
                key={step}
                className={enabled ? `drum-step active ${step % 4 === 0 ? 'beat' : ''}` : `drum-step ${step % 4 === 0 ? 'beat' : ''}`}
                aria-label={`${sound.label} step ${step + 1}`}
                aria-pressed={enabled}
                onClick={() => projectStore.toggleDrumStep(track.id, sound.id, step)}
              />
            ))}
          </div>
        ))}
        {hits.length > 0 && <div className="drum-hit-editor">
          <h3>Arrangement hits · {hits.length}</h3>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
          <button disabled={(page + 1) * 24 >= hits.length} onClick={() => setPage(p => p + 1)}>Next</button>
          {hits.slice(page * 24, (page + 1) * 24).map(note => <div className="drum-hit-row" key={note.id}>
            <select aria-label={`Drum sound ${note.id}`} value={note.drumSound} onChange={e => projectStore.updateNotes(track.id, { [note.id]: { drumSound: e.target.value as DrumSound } })}>{SOUNDS.map(sound => <option value={sound.id} key={sound.id}>{sound.label}</option>)}</select>
            <label>BEAT <input type="number" step=".125" value={note.start} onChange={e => projectStore.updateNotes(track.id, { [note.id]: { start: Number(e.target.value) } })} /></label>
            <label>VEL <input type="number" min="0" max="1" step=".05" value={note.velocity} onChange={e => projectStore.setNoteVelocities(track.id, { [note.id]: Number(e.target.value) })} /></label>
            <button onClick={() => { projectStore.selectTrack(track.id); projectStore.setSelectedNotes([note.id]); projectStore.deleteSelectedNotes(); }}>Delete hit</button>
          </div>)}
        </div>}
        <p className="drum-step-help">每小节循环 16 步；鼓点和旋律共用同一个 AudioContext 调度时钟。</p>
      </div>
    </section>
  );
});
