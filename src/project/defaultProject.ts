import type { ADSREnvelope, Instrument, Project, SynthPreset, Track } from '../types/music';
import { createId } from '../utils/id';

export const defaultADSR: ADSREnvelope = { attack: 0.02, decay: 0.16, sustain: 0.58, release: 0.24 };

export const defaultInstrument: Instrument = {
  type: 'poly-synth',
  oscillator: 'sawtooth',
  adsr: structuredClone(defaultADSR),
  volume: 0.72,
};

export function createSynth(name = 'My Synth'): SynthPreset {
  return {
    id: createId('synth'),
    name,
    oscillator: 'sawtooth',
    adsr: structuredClone(defaultADSR),
    volume: 0.72,
  };
}

export function createTrack(name = 'Lead'): Track {
  return {
    id: createId('track'),
    name,
    type: 'instrument',
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    instrument: structuredClone(defaultInstrument),
    notes: [],
  };
}

export function createDefaultProject(): Project {
  const now = new Date().toISOString();
  const synth = createSynth('我的合成器');
  const track = createTrack('Lead');
  track.instrument = { ...defaultInstrument, presetId: synth.id };
  return {
    id: createId('project'),
    name: 'New Rhythm Project',
    bpm: 174,
    key: 'C minor',
    tracks: [track],
    synths: [synth],
    createdAt: now,
    updatedAt: now,
  };
}
