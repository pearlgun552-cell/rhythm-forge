import type { Instrument, Project, Track } from '../types/music';
import { createId } from '../utils/id';

export const defaultInstrument: Instrument = {
  type: 'poly-synth',
  oscillator: 'sawtooth',
  adsr: { attack: 0.02, decay: 0.16, sustain: 0.58, release: 0.24 },
  volume: 0.72,
};

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
  return {
    id: createId('project'),
    name: 'New Rhythm Project',
    bpm: 174,
    key: 'C minor',
    tracks: [createTrack('Lead')],
    createdAt: now,
    updatedAt: now,
  };
}
