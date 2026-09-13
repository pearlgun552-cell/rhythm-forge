import { rootPitchForKey } from '../utils/musicTheory';
export const COMPUTER_KEY_OFFSETS: Record<string, number> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
};

export const COMPUTER_KEY_LABELS = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K'];

const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
} as const;

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export const keyRootPitch = rootPitchForKey;

export function scaleKeyboardOffsets(key: string): number[] {
  const minor = /minor/i.test(key);
  const intervals = minor ? SCALE_INTERVALS.minor : SCALE_INTERVALS.major;
  return COMPUTER_KEY_LABELS.map((_, index) => intervals[index % intervals.length]! + 12 * Math.floor(index / intervals.length));
}

export function pitchForCode(code: string, octave: number, mode: 'chromatic' | 'scale' = 'chromatic', key = 'C major'): number | null {
  const offset = COMPUTER_KEY_OFFSETS[code];
  if (offset === undefined) return null;
  if (mode === 'chromatic') return (octave + 1) * 12 + offset;
  const scaleOffset = scaleKeyboardOffsets(key)[Object.values(COMPUTER_KEY_OFFSETS).indexOf(offset)];
  const pitch = scaleOffset === undefined ? -1 : (octave + 1) * 12 + keyRootPitch(key) + scaleOffset;
  return pitch >= 0 && pitch <= 127 ? pitch : null;
}

export function noteName(pitch: number): string {
  const name = NOTE_NAMES[pitch % 12] ?? 'C';
  return `${name}${Math.floor(pitch / 12) - 1}`;
}

export function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitch % 12);
}
