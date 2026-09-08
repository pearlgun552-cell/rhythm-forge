export type OscillatorWaveform = 'sine' | 'square' | 'sawtooth' | 'triangle';
export type InstrumentType = 'poly-synth' | 'sampled-piano';

export interface ADSREnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface Instrument {
  type: InstrumentType;
  oscillator: OscillatorWaveform;
  adsr: ADSREnvelope;
  volume: number;
}

export interface Note {
  id: string;
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
}

export interface Track {
  id: string;
  name: string;
  type: 'instrument';
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  instrument: Instrument;
  notes: Note[];
}

export interface Project {
  id: string;
  name: string;
  bpm: number;
  key: string;
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
}
