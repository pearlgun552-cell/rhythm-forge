const ROOT_PITCHES: Record<string, number> = {
  C: 0, 'C#': 1, 'C♯': 1, Db: 1, 'D♭': 1, D: 2, 'D#': 3, 'D♯': 3, Eb: 3, 'E♭': 3, E: 4, F: 5, 'F#': 6, 'F♯': 6, Gb: 6, 'G♭': 6, G: 7, 'G#': 8, 'G♯': 8, Ab: 8, 'A♭': 8,
  A: 9, 'A#': 10, 'A♯': 10, Bb: 10, 'B♭': 10, B: 11,
};

export function rootPitchForKey(key: string): number {
  const match = key.match(/^[A-G](?:#|♯|b|♭)?/);
  return ROOT_PITCHES[match?.[0] ?? 'C'] ?? 0;
}

export function scalePitchClasses(key: string): Set<number> {
  const intervals = /minor/i.test(key) ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const root = rootPitchForKey(key);
  return new Set(intervals.map((interval) => (root + interval) % 12));
}
