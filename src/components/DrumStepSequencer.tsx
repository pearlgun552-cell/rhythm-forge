import { memo } from 'react';
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
        <p className="drum-step-help">每小节循环 16 步；鼓点和旋律共用同一个 AudioContext 调度时钟。</p>
      </div>
    </section>
  );
});
