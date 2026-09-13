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
  presetId?: string;
  oscCustom?: boolean;
  customOscillator?: OscillatorWaveform;
  customAdsr?: ADSREnvelope;
}

export interface SynthPreset {
  id: string;
  name: string;
  oscillator: OscillatorWaveform;
  adsr: ADSREnvelope;
  volume: number;
  oscCustom?: boolean;
  customOscillator?: OscillatorWaveform;
  customAdsr?: ADSREnvelope;
}

export interface MidiClip {
  id: string;
  name: string;
  startBeat: number;
  durationBeats: number;
}

export interface Note {
  clipId?: string;
  drumSound?: DrumSound;
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
  clips?: MidiClip[];
}

export interface Project {
  importedSample?: { name: string; mimeType: string; base64: string };
  id: string;
  schemaVersion: number;
  name: string;
  bpm: number;
  key: string;
  timeSignature: TimeSignature;
  projectLengthBeats: number;
  loopEnabled: boolean;
  loopStartBeat: number;
  loopEndBeat: number;
  tracks: Track[];
  synths: SynthPreset[];
  sections: Section[];
  reverb: ReverbSettings;
  createdAt: string;
  updatedAt: string;
}
