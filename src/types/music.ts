export type OscillatorWaveform = 'sine' | 'square' | 'sawtooth' | 'triangle';
export type InstrumentType = 'poly-synth' | 'sampled-piano';
export type InstrumentPreset = 'lead' | 'pluck' | 'bass' | 'pad' | 'soft-keys' | 'acoustic-pluck';
export type TrackType = 'instrument' | 'drum';
export type DrumSound = 'kick' | 'snare' | 'closed-hat' | 'open-hat' | 'clap';

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface ADSREnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface Instrument {
  type: InstrumentType;
  preset: InstrumentPreset;
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

export interface DrumPattern {
  stepCount: number;
  steps: Record<DrumSound, boolean[]>;
}

export interface Section {
  id: string;
  name: string;
  startBeat: number;
  durationBeats: number;
  keyOverride?: string;
}

export interface ReverbSettings {
  enabled: boolean;
  mix: number;
  decay: number;
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  instrument: Instrument;
  notes: Note[];
  drumPattern?: DrumPattern;
}

export interface Project {
  id: string;
  schemaVersion: number;
  name: string;
  bpm: number;
  key: string;
  timeSignature: TimeSignature;
  projectLengthBeats: number;
  tracks: Track[];
  sections: Section[];
  reverb: ReverbSettings;
  createdAt: string;
  updatedAt: string;
}
