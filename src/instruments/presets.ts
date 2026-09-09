import type { ADSREnvelope, Instrument, OscillatorWaveform } from '../types/music';
import type { MessageKey } from '../i18n/messages';

// Default ADSR shown whenever a waveform preset is picked. The oscillator
// picker derives a "custom" state when the current envelope no longer matches
// the default for the selected waveform.
export const OSCILLATOR_ENVELOPES: Record<OscillatorWaveform, ADSREnvelope> = {
  sine: { attack: 0.4, decay: 0.45, sustain: 0.7, release: 0.9 },
  square: { attack: 0.01, decay: 0.1, sustain: 0.66, release: 0.12 },
  sawtooth: { attack: 0.02, decay: 0.16, sustain: 0.58, release: 0.24 },
  triangle: { attack: 0.05, decay: 0.22, sustain: 0.6, release: 0.3 },
};

export interface BuiltinSound {
  id: string;
  nameKey: MessageKey;
  instrument: Instrument;
}

// The built-in sampled grand piano is not part of the user synth library; it
// is always listed under the "sampled" group in the sound menu.
export const GRAND_PIANO_PRESET: BuiltinSound = {
  id: 'piano-grand',
  nameKey: 'preset.grandPiano',
  instrument: {
    type: 'sampled-piano',
    oscillator: 'sine',
    adsr: { attack: 0.005, decay: 0.2, sustain: 0.9, release: 0.6 },
    volume: 0.7,
  },
};

export function envelopeEquals(a: ADSREnvelope, b: ADSREnvelope): boolean {
  return Math.abs(a.attack - b.attack) < 0.0001
    && Math.abs(a.decay - b.decay) < 0.0001
    && Math.abs(a.sustain - b.sustain) < 0.0001
    && Math.abs(a.release - b.release) < 0.0001;
}
