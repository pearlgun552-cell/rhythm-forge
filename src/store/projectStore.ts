import { sampleStore, encodeSample, decodeSample, type ImportedSample } from './sampleStore';
import { useSyncExternalStore } from 'react';
import { boundedNote, clampNumber, MIN_NOTE_BEATS } from '../utils/musicMath';
import { createId } from '../utils/id';
import { applyPreset, createDefaultProject, createDrumPattern, createSynth, createTrack } from '../project/defaultProject';
import type { DrumPattern, DrumSound, Instrument, Note, Project, Section, SynthPreset, Track, MidiClip } from '../types/music';
import { DEFAULT_PROJECT_LENGTH_BEATS, DEFAULT_TIME_SIGNATURE, snapBeat } from '../utils/musicConstants';

export interface ProjectState {
  project: Project;
  selectedTrackId: string;
  selectedNoteId: string | null;
  selectedNoteIds: string[];
  isDirty: boolean;
  gridSnap: number;
  selectedClipId?: string | null;
}

type Listener = () => void;
const STORAGE_KEY = 'rhythm-forge-project-v3';
const LEGACY_STORAGE_KEYS = ['rhythm-forge-project-v2'];

function clamp(value: number, min: number, max: number): number {
  return clampNumber(value, min, max);
}

function normalizeDrumPattern(pattern?: Partial<DrumPattern>): DrumPattern {
  const sounds: DrumSound[] = ['kick', 'snare', 'closed-hat', 'open-hat', 'clap'];
  const stepCount = clamp(Math.round(pattern?.stepCount ?? 16), 1, 64);
  return {
    stepCount,
    steps: Object.fromEntries(sounds.map((sound) => [
      sound,
      Array.from({ length: stepCount }, (_, index) => Boolean(pattern?.steps?.[sound]?.[index])),
    ])) as DrumPattern['steps'],
  };
}

export function normalizeProject(raw: Partial<Project>): Project | null {
  if (!raw || typeof raw !== 'object' || !raw.id || !raw.name || !Array.isArray(raw.tracks) || raw.tracks.length === 0 || raw.tracks.some(t => !t || typeof t !== 'object')) return null;
  if (Number(raw.schemaVersion) > 4) return null;
  const projectLengthBeats = clamp(Number(raw.projectLengthBeats ?? DEFAULT_PROJECT_LENGTH_BEATS), 4, 4096);
  if (raw.importedSample) { try { decodeSample(raw.importedSample); } catch { return null; } }
  const fallback = createDefaultProject();
  const fallbackTrack = fallback.tracks[0]!;
  const tracks = raw.tracks.map((rawTrack) => {
    const track = rawTrack as Partial<Track>;
    const instrument = { ...fallbackTrack.instrument, ...(track.instrument ?? {}) } as Instrument;
    instrument.adsr = { ...fallbackTrack.instrument.adsr, ...(track.instrument?.adsr ?? {}) };
    instrument.preset = instrument.preset ?? 'lead';
    instrument.type = instrument.type === 'sampled-piano' ? 'sampled-piano' : 'poly-synth';
    if (!['sine', 'square', 'sawtooth', 'triangle'].includes(instrument.oscillator)) instrument.oscillator = 'sawtooth';
    instrument.volume = clamp(Number(instrument.volume), 0, 1);
    for (const key of ['attack', 'decay', 'sustain', 'release'] as const) instrument.adsr[key] = clamp(Number(instrument.adsr[key]), 0, key === 'sustain' ? 1 : 8);
    const type = track.type === 'drum' ? 'drum' : 'instrument';
    return {
      ...createTrack(track.name || 'Track', type),
      ...track,
      type,
      volume: clamp(Number(track.volume ?? 0.8), 0, 1),
      pan: clamp(Number(track.pan ?? 0), -1, 1),
      instrument,
      clips: Array.isArray(track.clips) ? track.clips.filter(Boolean).map(clip => {
        const startBeat = clamp(Number(clip.startBeat), 0, projectLengthBeats - .25);
        return { ...clip, id: clip.id || createId('clip'), name: clip.name || 'MIDI Clip', startBeat, durationBeats: clamp(Number(clip.durationBeats) || 4, .25, projectLengthBeats - startBeat) };
      }) : [],
      notes: Array.isArray(track.notes) ? track.notes.filter(Boolean).map(note => ({
        ...note, id: note.id || createId('note'), pitch: Math.round(clamp(Number(note.pitch ?? 60), 0, 127)), start: clamp(Number(note.start), 0, 4096), duration: clamp(Number(note.duration ?? .25), MIN_NOTE_BEATS, 4096), velocity: clamp(Number(note.velocity ?? .8), 0, 1),
        clipId: track.clips?.some(c => c?.id === note.clipId) ? note.clipId : undefined,
      })) : [],
      ...(type === 'drum' ? { drumPattern: normalizeDrumPattern(track.drumPattern) } : {}),
    } as Track;
  });
  const loopStartBeat = clamp(Number(raw.loopStartBeat ?? 0), 0, projectLengthBeats - 0.25);
  const loopEndBeat = clamp(Number(raw.loopEndBeat ?? projectLengthBeats), loopStartBeat + 0.25, projectLengthBeats);
  const synths = Array.isArray(raw.synths) && raw.synths.length > 0
    ? raw.synths.map((rawSynth) => ({
      ...createSynth('My Synth'),
      ...(rawSynth as Partial<SynthPreset>),
      name: (rawSynth as Partial<SynthPreset>).name || 'My Synth',
      adsr: { ...fallback.synths[0]!.adsr, ...((rawSynth as Partial<SynthPreset>).adsr ?? {}) },
    }))
    : fallback.synths;
  return {
    ...fallback,
    ...raw,
    schemaVersion: Math.max(4, Number(raw.schemaVersion) || 0),
    bpm: clamp(Number(raw.bpm ?? fallback.bpm), 40, 300),
    key: raw.key || fallback.key,
    timeSignature: {
      numerator: Math.round(clamp(Number(raw.timeSignature?.numerator ?? DEFAULT_TIME_SIGNATURE.numerator), 1, 32)),
      denominator: [1, 2, 4, 8, 16, 32].includes(Number(raw.timeSignature?.denominator)) ? Number(raw.timeSignature?.denominator) : DEFAULT_TIME_SIGNATURE.denominator,
    },
    projectLengthBeats,
    loopEnabled: Boolean(raw.loopEnabled),
    loopStartBeat,
    loopEndBeat,
    tracks,
    synths,
    sections: Array.isArray(raw.sections) ? raw.sections.map((section) => ({
      ...section,
      id: section.id || `section-${Math.random().toString(36).slice(2)}`,
      name: section.name || 'Section',
      startBeat: clamp(Number(section.startBeat ?? 0), 0, projectLengthBeats),
      durationBeats: clamp(Number(section.durationBeats ?? 4), 0.25, projectLengthBeats),
    })) : [],
    reverb: {
      enabled: Boolean(raw.reverb?.enabled),
      mix: clamp(Number(raw.reverb?.mix ?? 0.22), 0, 1),
      decay: clamp(Number(raw.reverb?.decay ?? 1.8), 0.1, 8),
    },
  };
}

export class ProjectStore {
  private state: ProjectState;
  private listeners = new Set<Listener>();
  private clipboard: Note[] = [];
  private undoStack: ProjectState[] = [];
  private redoStack: ProjectState[] = [];
  private editing = false;
  private editRecorded = false;
  private savedContent = '';

  beginEdit(): void { if (!this.editing) { this.editing = true; this.editRecorded = false; } }
  endEdit(): void { this.editing = false; this.editRecorded = false; }
  private content(project: Project): string { return JSON.stringify({ ...project, updatedAt: '' }); }

  constructor(initial?: Project) {
    const project = initial ?? this.loadSavedProject() ?? createDefaultProject();
    this.savedContent = this.content(project);
    sampleStore.setImported(decodeSample(project.importedSample));
    this.state = {
      project,
      selectedTrackId: project.tracks[0]?.id ?? '',
      selectedNoteId: null,
      selectedNoteIds: [],
      isDirty: false,
      gridSnap: .25,
    };
  }

  getSnapshot = (): ProjectState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: ProjectState, record = true): void {
    if (record && next.project !== this.state.project) {
      if (!this.editing || !this.editRecorded) {
        this.undoStack.push(this.state);
        if (this.undoStack.length > 100) this.undoStack.shift();
        this.editRecorded = true;
      }
      this.redoStack = [];
    }
    if (next.project.importedSample !== this.state.project.importedSample) sampleStore.setImported(decodeSample(next.project.importedSample));
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  private loadSavedProject(): Project | null {
    try {
      const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const project = normalizeProject(JSON.parse(raw) as Partial<Project>);
        if (project) return project;
      }
    } catch {
      // Fall back to a clean project when local data is corrupt or unavailable.
    }
    return null;
  }

  private updateProject(updater: (project: Project) => Project): void {
    const project = updater(this.state.project);
    if (project === this.state.project) return;
    this.commit({
      ...this.state,
      project: { ...project, updatedAt: new Date().toISOString() },
      isDirty: true,
    });
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
  undo(): void {
    this.endEdit();
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.state);
    this.commit({ ...previous, isDirty: this.content(previous.project) !== this.savedContent }, false);
  }
  redo(): void {
    this.endEdit();
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.state);
    this.commit({ ...next, isDirty: this.content(next.project) !== this.savedContent }, false);
  }

  private selectedNotes(): Note[] {
    const track = this.state.project.tracks.find((item) => item.id === this.state.selectedTrackId);
    if (!track) return [];
    const ids = new Set(this.state.selectedNoteIds);
    return track.notes.filter((note) => ids.has(note.id));
  }

  private setSelectedNoteIds(ids: string[]): void {
    const unique = [...new Set(ids)];
    this.commit({
      ...this.state,
      selectedNoteIds: unique,
      selectedNoteId: unique[0] ?? null,
    });
  }

  setProjectName(name: string): void {
    this.updateProject((project) => ({ ...project, name }));
  }

  setBpm(bpm: number): void {
    this.updateProject((project) => ({ ...project, bpm: clamp(bpm, 40, 300) }));
  }

  setKey(key: string): void {
    this.updateProject((project) => ({ ...project, key }));
  }

  setTimeSignature(numerator: number, denominator: number): void {
    this.updateProject((project) => ({ ...project, timeSignature: { numerator, denominator } }));
  }

  setProjectLengthBeats(projectLengthBeats: number): void {
    this.updateProject((project) => {
      const length = clamp(projectLengthBeats, 4, 4096);
      return { ...project, projectLengthBeats: length, loopEndBeat: Math.min(project.loopEndBeat, length), loopStartBeat: Math.min(project.loopStartBeat, Math.max(0, length - 0.25)) };
    });
  }

  setLoop(changes: Partial<Pick<Project, 'loopEnabled' | 'loopStartBeat' | 'loopEndBeat'>>): void {
    this.updateProject((project) => {
      const start = clamp(Number(changes.loopStartBeat ?? project.loopStartBeat), 0, project.projectLengthBeats - 0.25);
      const end = clamp(Number(changes.loopEndBeat ?? project.loopEndBeat), start + 0.25, project.projectLengthBeats);
      return { ...project, loopEnabled: changes.loopEnabled ?? project.loopEnabled, loopStartBeat: start, loopEndBeat: end };
    });
  }

  setReverb(changes: Partial<Project['reverb']>): void {
    this.updateProject((project) => ({
      ...project,
      reverb: {
        ...project.reverb,
        ...changes,
        mix: clamp(Number(changes.mix ?? project.reverb.mix), 0, 1),
        decay: clamp(Number(changes.decay ?? project.reverb.decay), 0.1, 8),
      },
    }));
  }

  selectTrack(trackId: string): void {
    if (!this.state.project.tracks.some((track) => track.id === trackId)) return;
    this.commit({ ...this.state, selectedTrackId: trackId, selectedNoteId: null, selectedNoteIds: [], selectedClipId: null });
  }

  addTrack(): void {
    const track = createTrack(`Lead ${this.state.project.tracks.filter((item) => item.type === 'instrument').length + 1}`);
    const firstSynth = this.state.project.synths[0];
    if (firstSynth) {
      track.instrument = { ...track.instrument, presetId: firstSynth.id, oscillator: firstSynth.oscillator, adsr: { ...firstSynth.adsr }, volume: firstSynth.volume };
    }
    const project = {
      ...this.state.project,
      tracks: [...this.state.project.tracks, track],
      updatedAt: new Date().toISOString(),
    };
    this.commit({ ...this.state, project, selectedTrackId: track.id, selectedNoteId: null, selectedNoteIds: [], isDirty: true });
  }

  addDrumTrack(): void {
    const track = createTrack(`Drums ${this.state.project.tracks.filter((item) => item.type === 'drum').length + 1}`, 'drum');
    const project = { ...this.state.project, tracks: [...this.state.project.tracks, track], updatedAt: new Date().toISOString() };
    this.commit({ ...this.state, project, selectedTrackId: track.id, selectedNoteId: null, selectedNoteIds: [], isDirty: true });
  }

  addSynth(name: string): SynthPreset {
    const synth = createSynth(name);
    this.updateProject((project) => ({ ...project, synths: [...project.synths, synth] }));
    return synth;
  }

  updateSynth(synthId: string, changes: Partial<Omit<SynthPreset, 'id'>>): void {
    this.updateProject((project) => ({
      ...project,
      synths: project.synths.map((synth) => synth.id === synthId ? { ...synth, ...changes } : synth),
    }));
  }

  updateSynthParamsForTracks(synthId: string, changes: Partial<Omit<SynthPreset, 'id'>>): void {
    this.updateProject((project) => ({
      ...project,
      synths: project.synths.map((synth) => synth.id === synthId ? { ...synth, ...changes } : synth),
      tracks: project.tracks.map((track) => track.instrument.presetId === synthId
        ? { ...track, instrument: { ...track.instrument, ...changes } }
        : track),
    }));
  }

  deleteTrack(trackId: string): boolean {
    const tracks = this.state.project.tracks;
    if (tracks.length <= 1) return false;
    const index = tracks.findIndex((track) => track.id === trackId);
    if (index < 0) return false;
    const nextTracks = tracks.filter((track) => track.id !== trackId);
    const selectedTrackId = this.state.selectedTrackId === trackId
      ? (nextTracks[Math.max(0, index - 1)]?.id ?? nextTracks[0]!.id)
      : this.state.selectedTrackId;
    this.commit({
      ...this.state,
      project: { ...this.state.project, tracks: nextTracks, updatedAt: new Date().toISOString() },
      selectedTrackId,
      selectedNoteId: null,
      selectedNoteIds: [],
      isDirty: true,
    });
    return true;
  }

  updateTrack(trackId: string, changes: Partial<Omit<Track, 'id' | 'notes' | 'instrument'>>): void {
    this.updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) => track.id === trackId ? { ...track, ...changes } : track),
    }));
  }

  setImportedSample(sample: ImportedSample | null): void { this.updateProject(project => ({ ...project, importedSample: encodeSample(sample) })); }

  setGridSnap(grid: number): void { this.commit({ ...this.state, gridSnap: Math.max(0, grid) }, false); }

  addClip(trackId: string, changes: Partial<Omit<MidiClip, 'id'>> = {}): void {
    const track = this.state.project.tracks.find(t => t.id === trackId);
    if (!track || track.type !== 'instrument') return;
    const startBeat = clamp(changes.startBeat ?? 0, 0, this.state.project.projectLengthBeats - .25);
    const clip = { id: createId('clip'), name: changes.name || 'MIDI Clip', startBeat, durationBeats: clamp(changes.durationBeats ?? 4, .25, this.state.project.projectLengthBeats - startBeat) };
    this.updateProject(project => ({ ...project, tracks: project.tracks.map(t => t.id !== trackId ? t : { ...t, clips: [...(t.clips ?? []), clip], notes: t.notes.map(n => !n.clipId && n.start >= startBeat && n.start < startBeat + clip.durationBeats ? { ...n, clipId: clip.id } : n) }) }));
    this.selectClip(clip.id, trackId);
  }

  updateClip(trackId: string, clipId: string, changes: Partial<Omit<MidiClip, 'id'>>): void {
    this.updateProject(project => ({ ...project, tracks: project.tracks.map(track => {
      if (track.id !== trackId) return track;
      const original = track.clips?.find(c => c.id === clipId);
      if (!original) return track;
      const startBeat = clamp(changes.startBeat ?? original.startBeat, 0, project.projectLengthBeats - original.durationBeats);
      const clip = { ...original, ...changes, startBeat, durationBeats: clamp(changes.durationBeats ?? original.durationBeats, .25, project.projectLengthBeats - startBeat) };
      const delta = startBeat - original.startBeat;
      return { ...track, clips: track.clips!.map(c => c.id === clipId ? clip : c), notes: delta ? track.notes.map(n => n.clipId === clipId ? { ...n, start: n.start + delta } : n) : track.notes };
    }) }));
  }

  duplicateClip(trackId: string, clipId: string): void {
    const track = this.state.project.tracks.find(t => t.id === trackId);
    const source = track?.clips?.find(c => c.id === clipId);
    if (!source || !track) return;
    const startBeat = source.startBeat + source.durationBeats;
    if (startBeat + source.durationBeats > 4096) return;
    const clip = { ...source, id: createId('clip'), name: `${source.name} copy`, startBeat };
    const notes = track.notes.filter(n => n.clipId === clipId).map(n => ({ ...n, id: createId('note'), clipId: clip.id, start: n.start + source.durationBeats }));
    this.updateProject(project => ({ ...project, projectLengthBeats: Math.max(project.projectLengthBeats, startBeat + clip.durationBeats), tracks: project.tracks.map(t => t.id === trackId ? { ...t, clips: [...(t.clips ?? []), clip], notes: [...t.notes, ...notes] } : t) }));
    this.selectClip(clip.id, trackId);
  }

  deleteClip(trackId: string, clipId: string): void {
    this.updateProject(project => ({ ...project, tracks: project.tracks.map(t => t.id === trackId ? { ...t, clips: t.clips?.filter(c => c.id !== clipId), notes: t.notes.filter(n => n.clipId !== clipId) } : t) }));
    this.selectClip(null, trackId);
  }
  selectClip(clipId: string | null, trackId = this.state.selectedTrackId): void {
    const track = this.state.project.tracks.find(t => t.id === trackId);
    if (!track || (clipId && !track.clips?.some(c => c.id === clipId))) return;
    this.commit({ ...this.state, selectedTrackId: trackId, selectedClipId: clipId, selectedNoteId: null, selectedNoteIds: [] }, false);
  }

  updateInstrument(trackId: string, changes: Partial<Instrument>): void {
    this.updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) => track.id === trackId
        ? { ...track, instrument: { ...track.instrument, ...changes } }
        : track),
    }));
  }

  setInstrumentPreset(trackId: string, preset: Instrument['preset']): void {
    this.updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) => track.id === trackId
        ? { ...track, instrument: applyPreset({ ...track.instrument, adsr: { ...track.instrument.adsr } }, preset) }
        : track),
    }));
  }

  updateAdsr(trackId: string, changes: Partial<Instrument['adsr']>): void {
    this.updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) => track.id === trackId
        ? { ...track, instrument: { ...track.instrument, adsr: { ...track.instrument.adsr, ...changes } } }
        : track),
    }));
  }

  addNote(trackId: string, note: Note): void {
    this.addNotes(trackId, [note]);
  }

  addNotes(trackId: string, notes: Note[], clipId: string | null = this.state.selectedClipId ?? null): void {
    const track = this.state.project.tracks.find(t => t.id === trackId);
    if (!track || !notes.length) return;
    const clip = track.clips?.find(c => c.id === clipId);
    const added = notes.map(n => boundedNote({ ...n, ...(clip && n.start >= clip.startBeat && n.start < clip.startBeat + clip.durationBeats ? { clipId: clip.id } : { clipId: undefined }) }, this.state.project.projectLengthBeats));
    this.updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) => track.id === trackId
        ? { ...track, notes: [...track.notes, ...added].sort((a, b) => a.start - b.start || b.pitch - a.pitch) }
        : track),
    }));
    this.setSelectedNoteIds(added.map(n => n.id));
  }

  updateNotes(trackId: string, changes: Record<string, Partial<Note>>): void {
    this.updateProject(project => {
      let changed = false;
      const tracks = project.tracks.map(track => {
        if (track.id !== trackId) return track;
        const notes = track.notes.map(note => {
          if (!changes[note.id]) return note;
          const next = boundedNote({ ...note, ...changes[note.id], id: note.id }, project.projectLengthBeats);
          if (Object.keys(next).every(k => next[k as keyof Note] === note[k as keyof Note])) return note;
          changed = true;
          return next;
        });
        return changed ? { ...track, notes: notes.sort((a,b) => a.start - b.start || b.pitch - a.pitch) } : track;
      });
      return changed ? { ...project, tracks } : project;
    });
  }

  setNoteVelocities(trackId: string, changes: Record<string, number>): void {
    this.updateNotes(trackId, Object.fromEntries(Object.entries(changes).map(([id, velocity]) => [id, {
      velocity: clamp(Number(velocity), 0, 1),
    }])));
  }

  quantizeSelectedNotes(subdivision: number): void {
    const trackId = this.state.selectedTrackId;
    const ids = new Set(this.state.selectedNoteIds);
    if (ids.size === 0 || subdivision <= 0) return;
    const track = this.state.project.tracks.find((item) => item.id === trackId);
    if (!track) return;
    this.updateNotes(trackId, Object.fromEntries(track.notes.filter((note) => ids.has(note.id)).map((note) => [note.id, {
      start: snapBeat(note.start, subdivision),
    }])));
  }

  selectNote(noteId: string | null, additive = false): void {
    if (!noteId) {
      this.setSelectedNoteIds([]);
      return;
    }
    if (additive) {
      const ids = this.state.selectedNoteIds.includes(noteId)
        ? this.state.selectedNoteIds.filter((id) => id !== noteId)
        : [...this.state.selectedNoteIds, noteId];
      this.setSelectedNoteIds(ids);
      return;
    }
    this.setSelectedNoteIds([noteId]);
  }

  setSelectedNotes(noteIds: string[]): void {
    const validIds = new Set(this.state.project.tracks.find((track) => track.id === this.state.selectedTrackId)?.notes.map((note) => note.id));
    this.setSelectedNoteIds(noteIds.filter((id) => validIds.has(id)));
  }

  deleteSelectedNote(): void {
    this.deleteSelectedNotes();
  }

  deleteSelectedNotes(): void {
    const { selectedNoteIds, selectedTrackId } = this.state;
    if (selectedNoteIds.length === 0) return;
    const ids = new Set(selectedNoteIds);
    this.updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) => track.id === selectedTrackId
        ? { ...track, notes: track.notes.filter((note) => !ids.has(note.id)) }
        : track),
    }));
    this.setSelectedNoteIds([]);
  }

  copySelectedNotes(): void {
    this.clipboard = this.selectedNotes().map((note) => ({ ...note }));
  }

  pasteNotes(): void {
    if (this.clipboard.length === 0) return;
    const minStart = Math.min(...this.clipboard.map((note) => note.start));
    const offset = snapBeat(1, 0.25);
    const track = this.state.project.tracks.find((item) => item.id === this.state.selectedTrackId);
    if (!track) return;
    const pasted = this.clipboard.map((note) => ({
      ...note,
      id: createId('note'),
      clipId: undefined,
      start: clamp(note.start - minStart + minStart + offset, 0, Math.max(0, this.state.project.projectLengthBeats - note.duration)),
    }));
    this.updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((item) => item.id === track.id ? { ...item, notes: [...item.notes, ...pasted] } : item),
    }));
    this.setSelectedNoteIds(pasted.map((note) => note.id));
  }

  duplicateSelectedNotes(): void {
    const notes = this.selectedNotes();
    if (notes.length === 0) return;
    const minStart = Math.min(...notes.map((note) => note.start));
    const maxEnd = Math.max(...notes.map((note) => note.start + note.duration));
    const offset = Math.max(0.25, Math.ceil((maxEnd - minStart) / .25) * .25);
    const pasted = notes.map((note) => ({
      ...note,
      id: createId('note'),
      clipId: undefined,
      start: clamp(note.start + offset, 0, Math.max(0, this.state.project.projectLengthBeats - note.duration)),
    }));
    this.updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) => track.id === this.state.selectedTrackId ? { ...track, notes: [...track.notes, ...pasted] } : track),
    }));
    this.setSelectedNoteIds(pasted.map((note) => note.id));
  }

  toggleDrumStep(trackId: string, sound: DrumSound, step: number): void {
    this.updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) => {
        if (track.id !== trackId || track.type !== 'drum') return track;
        const pattern = normalizeDrumPattern(track.drumPattern);
        const steps = { ...pattern.steps, [sound]: [...pattern.steps[sound]] };
        steps[sound][step] = !steps[sound][step];
        return { ...track, drumPattern: { ...pattern, steps } };
      }),
    }));
  }

  addSection(name: string): void {
    const sectionNames = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Chorus', 'Outro'];
    const nextIndex = this.state.project.sections.length;
    const previous = this.state.project.sections[nextIndex - 1];
    const startBeat = previous ? previous.startBeat + previous.durationBeats : 0;
    const section: Section = {
      id: `section-${Math.random().toString(36).slice(2)}`,
      name: name || sectionNames[nextIndex % sectionNames.length] || 'Section',
      startBeat: Math.min(startBeat, this.state.project.projectLengthBeats - 4),
      durationBeats: Math.min(16, this.state.project.projectLengthBeats),
    };
    this.updateProject((project) => ({ ...project, sections: [...project.sections, section] }));
  }

  updateSection(sectionId: string, changes: Partial<Omit<Section, 'id'>>): void {
    this.updateProject((project) => ({
      ...project,
      sections: project.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const startBeat = clamp(Number(changes.startBeat ?? section.startBeat), 0, project.projectLengthBeats);
        return {
          ...section,
          ...changes,
          startBeat,
          durationBeats: clamp(Number(changes.durationBeats ?? section.durationBeats), 0.25, Math.max(0.25, project.projectLengthBeats - startBeat)),
        };
      }),
    }));
  }

  deleteSection(sectionId: string): void {
    this.updateProject((project) => ({ ...project, sections: project.sections.filter((section) => section.id !== sectionId) }));
  }

  save(): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state.project));
      this.markSaved();
      return true;
    } catch { return false; }
  }
  markSaved(project = this.state.project): void {
    this.endEdit();
    this.savedContent = this.content(project);
    this.commit({ ...this.state, isDirty: this.content(this.state.project) !== this.savedContent }, false);
  }
  newProject(): void {
    this.endEdit();
    const project = createDefaultProject();
    this.undoStack = []; this.redoStack = []; this.savedContent = this.content(project);
    this.commit({ project, gridSnap: .25, selectedTrackId: project.tracks[0]!.id, selectedNoteId: null, selectedNoteIds: [], isDirty: false }, false);
  }


  exportJson(): string {
    return JSON.stringify(this.state.project, null, 2);
  }

  importJson(raw: string): boolean {
    try {
      const project = normalizeProject(JSON.parse(raw) as Partial<Project>);
      if (!project) return false;
      this.endEdit(); this.undoStack = []; this.redoStack = []; this.savedContent = this.content(project);
      this.commit({
        gridSnap: .25,
        project: { ...project, updatedAt: new Date().toISOString() },
        selectedTrackId: project.tracks[0]?.id ?? '',
        selectedNoteId: null,
        selectedNoteIds: [],
        isDirty: false,
      }, false);
      return true;
    } catch {
      return false;
    }
  }
}

export const projectStore = new ProjectStore();

export function useProjectStore(): ProjectState {
  return useSyncExternalStore(projectStore.subscribe, projectStore.getSnapshot);
}
