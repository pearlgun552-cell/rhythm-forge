import type { Note, Project, Track } from '../types/music';

export const MIN_NOTE_BEATS = 1 / 96;
export function clampNumber(value: number, min: number, max: number, fallback = min): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
}
export const beatsToSeconds = (beats: number, bpm: number): number => beats * 60 / bpm;
export const secondsToBeats = (seconds: number, bpm: number): number => seconds * bpm / 60;
export function quantizeBeat(beat: number, grid: number): number {
  return grid > 0 ? Math.round((beat + 1e-9) / grid) * grid : beat;
}
export function boundedNote(note: Note, end: number): Note {
  const start = clampNumber(note.start, 0, Math.max(0, end - MIN_NOTE_BEATS));
  return { ...note, start, pitch: Math.round(clampNumber(note.pitch, 0, 127)),
    duration: clampNumber(note.duration, MIN_NOTE_BEATS, end - start), velocity: clampNumber(note.velocity, 0, 1, 0.8) };
}
export type Loop = Pick<Project, 'loopEnabled' | 'loopStartBeat' | 'loopEndBeat' | 'projectLengthBeats'>;
export function positionAt(absoluteBeat: number, loop: Loop): number {
  if (!loop.loopEnabled || absoluteBeat < loop.loopEndBeat) return Math.min(absoluteBeat, loop.projectLengthBeats);
  const length = loop.loopEndBeat - loop.loopStartBeat;
  return length > 0 ? loop.loopStartBeat + ((absoluteBeat - loop.loopStartBeat) % length + length) % length : loop.loopStartBeat;
}
export interface ScheduleRange { from: number; to: number; absoluteFrom: number; }
// Half-open intervals. An event on a boundary belongs to exactly one range.
export function schedulerRanges(from: number, to: number, loop: Loop): ScheduleRange[] {
  const ranges: ScheduleRange[] = [];
  if (!(to > from)) return ranges;
  if (!loop.loopEnabled) return from < loop.projectLengthBeats
    ? [{ from, to: Math.min(to, loop.projectLengthBeats), absoluteFrom: from }] : [];
  if (loop.loopEndBeat <= loop.loopStartBeat) return ranges;
  let cursor = from;
  while (cursor < to - 1e-9) {
    const start = positionAt(cursor, loop);
    const length = Math.min(to - cursor, loop.loopEndBeat - start);
    if (length <= 1e-9) break;
    ranges.push({ from: start, to: start + length, absoluteFrom: cursor });
    cursor += length;
  }
  return ranges;
}
export function recordedSegments(start: number, end: number, loop: Loop, grid: number): Array<{ start: number; duration: number }> {
  return schedulerRanges(start, Math.max(start + MIN_NOTE_BEATS, end), loop).map(r => {
    const limit = loop.loopEnabled ? loop.loopEndBeat : loop.projectLengthBeats;
    const noteStart = clampNumber(quantizeBeat(r.from, grid), r.absoluteFrom >= loop.loopEndBeat ? loop.loopStartBeat : 0, limit - MIN_NOTE_BEATS);
    const noteEnd = clampNumber(quantizeBeat(r.to, grid), noteStart + MIN_NOTE_BEATS, limit);
    return { start: noteStart, duration: noteEnd - noteStart };
  });
}
export function audibleNotes(track: Track): Note[] {
  return track.notes.flatMap(note => {
    if (!note.clipId) return [note];
    const clip = track.clips?.find(c => c.id === note.clipId);
    if (!clip || note.start >= clip.startBeat + clip.durationBeats || note.start + note.duration <= clip.startBeat) return [];
    const start = Math.max(clip.startBeat, note.start);
    return [{ ...note, start, duration: Math.min(note.start + note.duration, clip.startBeat + clip.durationBeats) - start }];
  });
}

// Both real-time playback and offline export consume the same event ranges.
export function trackEvents(track: Track, project: Project, from: number, to: number, chase = false): Note[] {
  const notes = audibleNotes(track).filter(n => n.velocity > 0 && n.start < to && (n.start >= from || (chase && track.type !== 'drum' && n.start + n.duration > from)));
  if (track.type !== 'drum' || !track.drumPattern) return notes;
  const barBeats = project.timeSignature.numerator * 4 / project.timeSignature.denominator;
  const stepBeats = barBeats / track.drumPattern.stepCount;
  for (const [sound, steps] of Object.entries(track.drumPattern.steps)) {
    for (let bar = Math.floor(from / barBeats); bar * barBeats < to; bar++) {
      steps.forEach((enabled, step) => {
        const start = bar * barBeats + step * stepBeats;
        if (enabled && start >= from && start < to && start < project.projectLengthBeats) notes.push({ id: `${track.id}-${bar}-${sound}-${step}`, start, duration: stepBeats, pitch: 36, velocity: .86, drumSound: sound as NonNullable<Note['drumSound']> });
      });
    }
  }
  return notes;
}
