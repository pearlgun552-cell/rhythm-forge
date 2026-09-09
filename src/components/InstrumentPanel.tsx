import { useRef, useState, useEffect } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import { COMPUTER_KEY_LABELS, noteName } from '../instruments/keyboardMap';
import { GRAND_PIANO_PRESET, OSCILLATOR_ENVELOPES, envelopeEquals } from '../instruments/presets';
import { useLanguage, type MessageKey } from '../i18n';
import { projectStore } from '../store/projectStore';
import { sampleStore, useImportedSample } from '../store/sampleStore';
import type { ADSREnvelope, OscillatorWaveform, SynthPreset, Track } from '../types/music';

interface InstrumentPanelProps {
  track: Track | undefined;
  synths: SynthPreset[];
  octave: number;
  activePitches: Set<number>;
  onOctaveChange: (octave: number) => void;
}

const WAVEFORMS: OscillatorWaveform[] = ['sine', 'square', 'sawtooth', 'triangle'];
const WAVEFORM_GLYPHS: Record<OscillatorWaveform, string> = {
  sine: '∿',
  square: '⊓',
  sawtooth: '⩘',
  triangle: '⋀',
};
const OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const ADSR_ROWS = [
  ['attack', 0, 1, 0.01],
  ['decay', 0.01, 1, 0.01],
  ['sustain', 0.01, 1, 0.01],
  ['release', 0.01, 2, 0.01],
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function isCustomOscillatorState(instrument: { oscillator: OscillatorWaveform; adsr: ADSREnvelope; oscCustom?: boolean }): boolean {
  return instrument.oscCustom === true || !envelopeEquals(instrument.adsr, OSCILLATOR_ENVELOPES[instrument.oscillator]);
}

export function InstrumentPanel({ track, synths, octave, activePitches, onOctaveChange }: InstrumentPanelProps) {
  const [pianoLoadState, setPianoLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [soundMenuOpen, setSoundMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'rename'; synth: SynthPreset } | null>(null);
  const [dialogName, setDialogName] = useState('');
  const importedSample = useImportedSample();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const soundMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!soundMenuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (soundMenuRef.current && !soundMenuRef.current.contains(event.target as Node)) {
        setSoundMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [soundMenuOpen]);

  if (!track) return <aside className="instrument-panel panel">{t('instrument.noTrack')}</aside>;
  const { instrument } = track;

  const isSynth = instrument.type === 'poly-synth';
  const currentPatchId = isSynth ? instrument.presetId : null;
  const currentPatch = synths.find((synth) => synth.id === currentPatchId);
  const isGrandPiano = instrument.type === 'sampled-piano' && instrument.presetId === GRAND_PIANO_PRESET.id;
  const isCustomOscillator = isSynth && isCustomOscillatorState(instrument);
  const currentSoundName = isSynth
    ? (currentPatch?.name ?? synths[0]?.name ?? t('synth.unnamed'))
    : t('preset.grandPiano');

  const oscLabel = (waveform: OscillatorWaveform): string => t(`osc.${waveform}` as MessageKey);

  // Edits the currently selected synth patch and every track using it. If the
  // track is not linked to a synth (e.g. older saved data), fall back to just
  // updating the track instrument.
  const updatePolySynthParam = (changes: Partial<Pick<SynthPreset, 'oscillator' | 'adsr' | 'volume' | 'oscCustom' | 'customOscillator' | 'customAdsr'>>) => {
    if (currentPatchId && synths.some((synth) => synth.id === currentPatchId)) {
      projectStore.updateSynthParamsForTracks(currentPatchId, changes);
    } else {
      projectStore.updateInstrument(track.id, changes);
    }
  };

  const selectSynth = (synth: SynthPreset) => {
    projectStore.updateInstrument(track.id, {
      type: 'poly-synth',
      oscillator: synth.oscillator,
      adsr: synth.adsr,
      volume: synth.volume,
      presetId: synth.id,
      oscCustom: synth.oscCustom,
      customOscillator: synth.customOscillator,
      customAdsr: synth.customAdsr,
    });
    setPianoLoadState('idle');
    setSoundMenuOpen(false);
  };

  const selectGrandPiano = () => {
    const next = { ...GRAND_PIANO_PRESET.instrument, presetId: GRAND_PIANO_PRESET.id };
    projectStore.updateInstrument(track.id, next);
    setSoundMenuOpen(false);
    setPianoLoadState('loading');
    void audioEngine.resume()
      .then(() => audioEngine.prepareInstrument(next))
      .then(() => setPianoLoadState('ready'))
      .catch(() => setPianoLoadState('error'));
  };

  const applyOscillatorPreset = (waveform: OscillatorWaveform) => {
    const leavingCustom = isCustomOscillator;
    const changes: Partial<Pick<SynthPreset, 'oscillator' | 'adsr' | 'oscCustom' | 'customOscillator' | 'customAdsr'>> = {
      oscillator: waveform,
      adsr: OSCILLATOR_ENVELOPES[waveform],
      oscCustom: false,
    };
    if (leavingCustom) {
      changes.customOscillator = instrument.oscillator;
      changes.customAdsr = instrument.adsr;
    }
    updatePolySynthParam(changes);
  };

  const updateEnvelopeParam = (name: keyof ADSREnvelope, value: number) => {
    const adsr = { ...instrument.adsr, [name]: value };
    updatePolySynthParam({ adsr, oscCustom: true, customOscillator: instrument.oscillator, customAdsr: adsr });
  };

  const selectCustomOscillator = () => {
    const changes: Partial<Pick<SynthPreset, 'oscCustom' | 'oscillator' | 'adsr'>> = { oscCustom: true };
    if (instrument.customOscillator) changes.oscillator = instrument.customOscillator;
    if (instrument.customAdsr) changes.adsr = instrument.customAdsr;
    updatePolySynthParam(changes);
  };

  const openNewSynthDialog = () => {
    setDialog({ mode: 'new' });
    setDialogName('');
    setSoundMenuOpen(false);
  };

  const openRenameSynthDialog = (synth: SynthPreset) => {
    setDialog({ mode: 'rename', synth });
    setDialogName(synth.name);
    setSoundMenuOpen(false);
  };

  const closeDialog = () => setDialog(null);

  const confirmDialog = () => {
    const name = dialogName.trim() || t('synth.unnamed');
    if (dialog?.mode === 'new') {
      const synth = projectStore.addSynth(name);
      projectStore.updateInstrument(track.id, {
        type: 'poly-synth',
        oscillator: synth.oscillator,
        adsr: synth.adsr,
        volume: synth.volume,
        presetId: synth.id,
        oscCustom: synth.oscCustom,
        customOscillator: synth.customOscillator,
        customAdsr: synth.customAdsr,
      });
      setPianoLoadState('idle');
    } else if (dialog?.mode === 'rename') {
      projectStore.updateSynth(dialog.synth.id, { name });
    }
    setDialog(null);
  };

  const handleImportSample = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    setSoundMenuOpen(false);
    setPianoLoadState('loading');
    const data = await file.arrayBuffer();
    sampleStore.setImported({ data, name: file.name, mimeType: file.type });
    const next = { ...GRAND_PIANO_PRESET.instrument, presetId: GRAND_PIANO_PRESET.id };
    projectStore.updateInstrument(track.id, next);
    try {
      await audioEngine.resume();
      await audioEngine.reloadPiano();
      setPianoLoadState('ready');
    } catch {
      setPianoLoadState('error');
    }
  };

  const resetSample = async () => {
    setSoundMenuOpen(false);
    setPianoLoadState('loading');
    sampleStore.setImported(null);
    const next = { ...GRAND_PIANO_PRESET.instrument, presetId: GRAND_PIANO_PRESET.id };
    projectStore.updateInstrument(track.id, next);
    try {
      await audioEngine.resume();
      await audioEngine.reloadPiano();
      setPianoLoadState('ready');
    } catch {
      setPianoLoadState('error');
    }
  };

  return (
    <aside className="instrument-panel panel">
      <div className="panel-heading instrument-heading">
        <div><span>{t('instrument.heading')}</span><h2>{isSynth ? t('instrument.polySynth') : t('instrument.grandPiano')}</h2></div>
        <span className="engine-badge"><i /> {isSynth ? t('instrument.readyBadge') : t('instrument.sampledBadge')}</span>
      </div>

      <section className="instrument-section sound-picker-section">
        <label className="control-label">{t('instrument.soundEngine')}</label>
        <div className="sound-picker" ref={soundMenuRef}>
          <button
            className="sound-picker-trigger"
            onClick={() => setSoundMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={soundMenuOpen}
          >
            <span className="sound-picker-icon" aria-hidden="true">{isSynth ? '⌁' : '♬'}</span>
            <span className="sound-picker-name">{currentSoundName}</span>
            <span className="sound-picker-caret" aria-hidden="true">▾</span>
          </button>

          {soundMenuOpen && (
            <div className="sound-menu" role="listbox" aria-label={t('instrument.soundEngine')}>
              <button className="sound-menu-import" onClick={() => fileInputRef.current?.click()}>
                <span aria-hidden="true">＋</span>{t('instrument.importSample')}
              </button>
              {importedSample && (
                <button className="sound-menu-import sound-menu-reset" onClick={resetSample}>
                  <span aria-hidden="true">⟲</span>{t('instrument.resetSample')}
                </button>
              )}

              <div className="sound-menu-group" role="group" aria-label={t('preset.groupSynth')}>
                <div className="sound-menu-group-label">{t('preset.groupSynth')}</div>
                <button className="sound-menu-item sound-menu-add" onClick={openNewSynthDialog}>
                  <span className="preset-indicator" aria-hidden="true">＋</span>
                  <span>{t('synth.add')}</span>
                </button>
                {synths.map((synth) => (
                  <button
                    className={currentPatchId === synth.id ? 'sound-menu-item selected' : 'sound-menu-item'}
                    key={synth.id}
                    onClick={() => selectSynth(synth)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openRenameSynthDialog(synth);
                    }}
                    title={t('synth.renameTitle')}
                    role="option"
                    aria-selected={currentPatchId === synth.id}
                  >
                    <span className="preset-indicator" aria-hidden="true">{currentPatchId === synth.id ? '✓' : ''}</span>
                    <span className="preset-name">{synth.name}</span>
                    <span className="preset-type" aria-hidden="true">{isCustomOscillatorState(synth) ? t('osc.custom') : oscLabel(synth.oscillator)}</span>
                  </button>
                ))}
              </div>

              <div className="sound-menu-group" role="group" aria-label={t('preset.groupSampled')}>
                <div className="sound-menu-group-label">{t('preset.groupSampled')}</div>
                <button
                  className={isGrandPiano ? 'sound-menu-item selected' : 'sound-menu-item'}
                  onClick={selectGrandPiano}
                  role="option"
                  aria-selected={isGrandPiano}
                >
                  <span className="preset-indicator" aria-hidden="true">{isGrandPiano ? '✓' : ''}</span>
                  <span>{t('preset.grandPiano')}</span>
                  <span className="preset-type" aria-hidden="true">{importedSample ? 'custom' : 'builtin'}</span>
                </button>
              </div>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={handleImportSample} />
        </div>
      </section>

      {isSynth ? <>
        <section className="instrument-section">
          <label className="control-label">{t('instrument.oscillator')}</label>
          <div className="waveform-grid">
            {WAVEFORMS.map((waveform) => (
              <button
                className={!isCustomOscillator && instrument.oscillator === waveform ? 'selected' : ''}
                key={waveform}
                onClick={() => applyOscillatorPreset(waveform)}
              >
                <span>{WAVEFORM_GLYPHS[waveform]}</span>
                {oscLabel(waveform)}
              </button>
            ))}
            <button className={isCustomOscillator ? 'selected' : ''} onClick={selectCustomOscillator}>
              <span>✎</span>{t('osc.custom')}
            </button>
          </div>
        </section>

        <section className="instrument-section">
          <label className="control-label">{t('instrument.envelope')}</label>
          <div className="envelope-visual" aria-hidden="true"><i /><i /><i /><i /></div>
          <div className="adsr-rows">
            {ADSR_ROWS.map(([name, min, max, step]) => (
              <div className="adsr-row" key={name}>
                <span className="adsr-label">{name[0]?.toUpperCase()}</span>
                <input
                  aria-label={name}
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={instrument.adsr[name]}
                  onChange={(event) => updateEnvelopeParam(name, Number(event.target.value))}
                />
                <input
                  aria-label={`${name} value`}
                  className="adsr-number"
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={Number(instrument.adsr[name].toFixed(2))}
                  onChange={(event) => updateEnvelopeParam(name, clamp(Number(event.target.value), min, max))}
                />
              </div>
            ))}
          </div>
          <label className="range-field synth-volume">
            <span>{t('instrument.volume')}</span>
            <input
              aria-label="synth volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={instrument.volume}
              onChange={(event) => updatePolySynthParam({ volume: Number(event.target.value) })}
            />
            <b>{Math.round(instrument.volume * 100)}%</b>
          </label>
        </section>
      </> : (
        <section className="instrument-section piano-sample-section">
          <div className="piano-sample-card">
            <span className="piano-icon">♬</span>
            <div>
              <b>{importedSample ? importedSample.name : 'Salamander Grand'}</b>
              <small>{importedSample ? (importedSample.mimeType || 'audio') : t('instrument.sampleBuiltinSub')}</small>
            </div>
          </div>
          <p className={`sample-status ${pianoLoadState}`}>
            {pianoLoadState === 'loading' ? t('instrument.sampleLoading') : pianoLoadState === 'error' ? t('instrument.sampleError') : t('instrument.sampleReady')}
          </p>
          <label className="range-field synth-volume">
            <span>{t('instrument.volume')}</span>
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
          <label className="control-label">{t('instrument.keyboard')}</label>
          <div className="octave-control">
            <button onClick={() => onOctaveChange(Math.max(1, octave - 1))} aria-label={t('instrument.octDown')}>−</button>
            <span>{t('instrument.octLabel')} {octave}</span>
            <button onClick={() => onOctaveChange(Math.min(7, octave + 1))} aria-label={t('instrument.octUp')}>＋</button>
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
        <p><kbd>Z</kbd>/<kbd>X</kbd> {t('instrument.keyboardTip')}</p>
      </section>

      {dialog && (
        <div className="modal-overlay" onClick={closeDialog}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>{dialog.mode === 'new' ? t('synth.newTitle') : t('synth.renameTitle')}</h3>
            <label className="modal-label" htmlFor="new-synth-name">{t('synth.nameLabel')}</label>
            <input
              id="new-synth-name"
              autoFocus
              value={dialogName}
              onChange={(event) => setDialogName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirmDialog();
                if (event.key === 'Escape') closeDialog();
              }}
            />
            <div className="modal-actions">
              <button onClick={closeDialog}>{t('synth.cancel')}</button>
              <button className="modal-confirm" onClick={confirmDialog}>{t('synth.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
