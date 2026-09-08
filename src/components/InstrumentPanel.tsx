import { useState } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import { COMPUTER_KEY_LABELS, noteName } from '../instruments/keyboardMap';
import { projectStore } from '../store/projectStore';
import type { InstrumentType, OscillatorWaveform, Track } from '../types/music';

interface InstrumentPanelProps {
  track: Track | undefined;
  octave: number;
  activePitches: Set<number>;
  onOctaveChange: (octave: number) => void;
}

const WAVEFORMS: OscillatorWaveform[] = ['sine', 'square', 'sawtooth', 'triangle'];
const OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function InstrumentPanel({ track, octave, activePitches, onOctaveChange }: InstrumentPanelProps) {
  const [pianoLoadState, setPianoLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  if (!track) return <aside className="instrument-panel panel">No track selected</aside>;
  const { instrument } = track;

  const selectInstrument = (type: InstrumentType) => {
    projectStore.updateInstrument(track.id, { type });
    if (type !== 'sampled-piano') return;
    setPianoLoadState('loading');
    const pianoInstrument = { ...instrument, type };
    void audioEngine.resume()
      .then(() => audioEngine.prepareInstrument(pianoInstrument))
      .then(() => setPianoLoadState('ready'))
      .catch(() => setPianoLoadState('error'));
  };

  return (
    <aside className="instrument-panel panel">
      <div className="panel-heading instrument-heading">
        <div><span>INSTRUMENT</span><h2>{instrument.type === 'sampled-piano' ? 'Grand Piano' : 'Poly Synth'}</h2></div>
        <span className="engine-badge"><i /> {instrument.type === 'sampled-piano' ? 'SAMPLED' : 'READY'}</span>
      </div>

      <section className="instrument-section">
        <label className="control-label">SOUND ENGINE</label>
        <div className="instrument-type-grid">
          <button className={instrument.type === 'poly-synth' ? 'selected' : ''} onClick={() => selectInstrument('poly-synth')}>
            <b>⌁</b><span>Poly Synth</span><small>Electronic</small>
          </button>
          <button className={instrument.type === 'sampled-piano' ? 'selected' : ''} onClick={() => selectInstrument('sampled-piano')}>
            <b>♬</b><span>Grand Piano</span><small>Yamaha C5</small>
          </button>
        </div>
      </section>

      {instrument.type === 'poly-synth' ? <>
        <section className="instrument-section">
          <label className="control-label">OSCILLATOR</label>
          <div className="waveform-grid">
            {WAVEFORMS.map((waveform) => (
              <button
                className={instrument.oscillator === waveform ? 'selected' : ''}
                key={waveform}
                onClick={() => projectStore.updateInstrument(track.id, { oscillator: waveform })}
              >
                <span>{waveform === 'sine' ? '∿' : waveform === 'square' ? '⊓' : waveform === 'sawtooth' ? '⩘' : '⋀'}</span>
                {waveform}
              </button>
            ))}
          </div>
        </section>

        <section className="instrument-section">
          <label className="control-label">ENVELOPE · ADSR</label>
          <div className="envelope-visual" aria-hidden="true"><i /><i /><i /><i /></div>
          {([
            ['attack', 0, 1, 0.01],
            ['decay', 0.01, 1, 0.01],
            ['sustain', 0.01, 1, 0.01],
            ['release', 0.01, 2, 0.01],
          ] as const).map(([name, min, max, step]) => (
            <label className="range-field" key={name}>
              <span>{name[0]?.toUpperCase()}</span>
              <input
                aria-label={name}
                type="range"
                min={min}
                max={max}
                step={step}
                value={instrument.adsr[name]}
                onChange={(event) => projectStore.updateAdsr(track.id, { [name]: Number(event.target.value) })}
              />
              <b>{instrument.adsr[name].toFixed(2)}</b>
            </label>
          ))}
          <label className="range-field synth-volume">
            <span>VOL</span>
            <input
              aria-label="synth volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={instrument.volume}
              onChange={(event) => projectStore.updateInstrument(track.id, { volume: Number(event.target.value) })}
            />
            <b>{Math.round(instrument.volume * 100)}%</b>
          </label>
        </section>
      </> : (
        <section className="instrument-section piano-sample-section">
          <div className="piano-sample-card">
            <span className="piano-icon">♬</span>
            <div><b>Salamander Grand</b><small>真实 Yamaha C5 钢琴采样 · 本地离线</small></div>
          </div>
          <p className={`sample-status ${pianoLoadState}`}>
            {pianoLoadState === 'loading' ? '正在载入本地采样…' : pianoLoadState === 'error' ? '采样载入失败，请重新选择钢琴' : '覆盖 C1–C7 · 相邻采样自动变调'}
          </p>
          <label className="range-field synth-volume">
            <span>VOL</span>
            <input
              aria-label="piano volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={instrument.volume}
              onChange={(event) => projectStore.updateInstrument(track.id, { volume: Number(event.target.value) })}
            />
            <b>{Math.round(instrument.volume * 100)}%</b>
          </label>
        </section>
      )}

      <section className="instrument-section keyboard-section">
        <div className="keyboard-header">
          <label className="control-label">COMPUTER KEYBOARD</label>
          <div className="octave-control">
            <button onClick={() => onOctaveChange(Math.max(1, octave - 1))} aria-label="Octave Down">−</button>
            <span>OCT {octave}</span>
            <button onClick={() => onOctaveChange(Math.min(7, octave + 1))} aria-label="Octave Up">＋</button>
          </div>
        </div>
        <div className="computer-keys">
          {OFFSETS.map((offset, index) => {
            const pitch = (octave + 1) * 12 + offset;
            return (
              <div className={activePitches.has(pitch) ? 'computer-key active' : 'computer-key'} key={pitch}>
                <b>{COMPUTER_KEY_LABELS[index]}</b><small>{noteName(pitch)}</small>
              </div>
            );
          })}
        </div>
        <p><kbd>Z</kbd>/<kbd>X</kbd> 切换八度 · 松开按键即 Note Off</p>
      </section>
    </aside>
  );
}
