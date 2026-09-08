import type { TimeSignature } from '../types/music';

export const DEFAULT_TIME_SIGNATURE: TimeSignature = { numerator: 4, denominator: 4 };
export const DEFAULT_PROJECT_LENGTH_BEATS = 128;
export const GRID_BEATS = 0.25;

export function beatsPerBar(timeSignature: TimeSignature): number {
  return timeSignature.numerator * (4 / timeSignature.denominator);
}

export function barsForBeats(beats: number, timeSignature: TimeSignature): number {
  return Math.max(1, Math.ceil(beats / beatsPerBar(timeSignature)));
}

export function snapBeat(value: number, subdivision: number): number {
  return Math.round(value / subdivision) * subdivision;
}
