import type { DrumPattern, Instrument, InstrumentPreset, Project, Track, TrackType } from '../types/music';
import { createId } from '../utils/id';
import { DEFAULT_PROJECT_LENGTH_BEATS } from '../utils/musicConstants';

export const defaultInstrument: Instrument = {
  type: 'poly-synth',
  preset: 'lead',
  oscillator: 'sawtooth',
  adsr: { attack: 0.02, decay: 0.16, sustain: 0.58, release: 0.24 },
  volume: 0.72,
};

export function createDrumPattern(): DrumPattern {
  const sounds = ['kick', 'snare', 'closed-hat', 'open-hat', 'clap'] as const;
  return {
    stepCount: 16,
    steps: Object.fromEntries(sounds.map((sound) => [sound, Array.from({ length: 16 }, () => false)])) as DrumPattern['steps'],
  };
}

export function createTrack(name = 'Lead', type: TrackType = 'instrument', preset: InstrumentPreset = 'lead'): Track {
  const instrument = structuredClone(defaultInstrument);
  applyPreset(instrument, preset);
  return {
    id: createId('track'),
    name,
    type,
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    instrument,
    notes: [],
    ...(type === 'drum' ? { drumPattern: createDrumPattern() } : {}),
  };
}

export function applyPreset(instrument: Instrument, preset: InstrumentPreset): Instrument {
  const presets: Record<InstrumentPreset, Pick<Instrument, 'oscillator' | 'adsr' | 'volume'>> = {
    lead: { oscillator: 'sawtooth', adsr: { attack: 0.02, decay: 0.16, sustain: 0.58, release: 0.24 }, volume: 0.72 },
    pluck: { oscillator: 'triangle', adsr: { attack: 0.005, decay: 0.24, sustain: 0.18, release: 0.18 }, volume: 0.7 },
    bass: { oscillator: 'square', adsr: { attack: 0.01, decay: 0.18, sustain: 0.62, release: 0.16 }, volume: 0.78 },
    pad: { oscillator: 'sine', adsr: { attack: 0.32, decay: 0.4, sustain: 0.7, release: 0.72 }, volume: 0.62 },
    'soft-keys': { oscillator: 'triangle', adsr: { attack: 0.04, decay: 0.3, sustain: 0.42, release: 0.38 }, volume: 0.68 },
    'acoustic-pluck': { oscillator: 'triangle', adsr: { attack: 0.003, decay: 0.3, sustain: 0.08, release: 0.16 }, volume: 0.65 },
  };
  const selected = presets[preset];
  instrument.preset = preset;
  instrument.oscillator = selected.oscillator;
  instrument.adsr = { ...selected.adsr };
  instrument.volume = selected.volume;
  return instrument;
}

export function createDefaultProject(): Project {
  const now = new Date().toISOString();
  return {
    id: createId('project'),
    schemaVersion: 2,
    name: 'New Rhythm Project',
    bpm: 174,
    key: 'C minor',
    timeSignature: { numerator: 4, denominator: 4 },
    projectLengthBeats: DEFAULT_PROJECT_LENGTH_BEATS,
    tracks: [createTrack('Lead')],
    sections: [],
    reverb: { enabled: false, mix: 0.22, decay: 1.8 },
    createdAt: now,
    updatedAt: now,
  };
}
