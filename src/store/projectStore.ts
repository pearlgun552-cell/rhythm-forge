import { useSyncExternalStore } from 'react';
import { applyPreset, createDefaultProject, createDrumPattern, createTrack } from '../project/defaultProject';
import type { DrumPattern, DrumSound, Instrument, Note, Project, Section, Track } from '../types/music';
import { DEFAULT_PROJECT_LENGTH_BEATS, DEFAULT_TIME_SIGNATURE, snapBeat } from '../utils/musicConstants';

export interface ProjectState {
  project: Project;
  selectedTrackId: string;
  selectedNoteId: string | null;
  selectedNoteIds: string[];
  isDirty: boolean;
}

type Listener = () => void;
const STORAGE_KEY = 'rhythm-forge-project-v3';
const LEGACY_STORAGE_KEYS = ['rhythm-forge-project-v2'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function normalizeProject(raw: Partial<Project>): Project | null {
  if (!raw.id || !raw.name || !Array.isArray(raw.tracks) || raw.tracks.length === 0) return null;
  const fallback = createDefaultProject();
  const fallbackTrack = fallback.tracks[0]!;
  const tracks = raw.tracks.map((rawTrack) => {
    const track = rawTrack as Partial<Track>;
    const instrument = { ...fallbackTrack.instrument, ...(track.instrument ?? {}) } as Instrument;
    instrument.adsr = { ...fallbackTrack.instrument.adsr, ...(track.instrument?.adsr ?? {}) };
    instrument.preset = instrument.preset ?? 'lead';
    const type = track.type === 'drum' ? 'drum' : 'instrument';
    return {
      ...createTrack(track.name || 'Track', type),
      ...track,
      type,
      volume: clamp(Number(track.volume ?? 0.8), 0, 1),
      pan: clamp(Number(track.pan ?? 0), -1, 1),
      instrument,
      notes: Array.isArray(track.notes) ? track.notes.map((note) => ({
        ...note,
        pitch: clamp(Math.round(Number(note.pitch ?? 60)), 0, 127),
        start: Math.max(0, Number(note.start ?? 0)),
        duration: Math.max(0.05, Number(note.duration ?? 0.25)),
        velocity: clamp(Number(note.velocity ?? 0.8), 0, 1),
      })) : [],
      ...(type === 'drum' ? { drumPattern: normalizeDrumPattern(track.drumPattern) } : {}),
    } as Track;
  });
  const projectLengthBeats = clamp(Number(raw.projectLengthBeats ?? DEFAULT_PROJECT_LENGTH_BEATS), 128, 512);
  return {
    ...fallback,
    ...raw,
    schemaVersion: 2,
    bpm: clamp(Number(raw.bpm ?? fallback.bpm), 40, 300),
    key: raw.key || fallback.key,
    timeSignature: {
      numerator: Number(raw.timeSignature?.numerator ?? DEFAULT_TIME_SIGNATURE.numerator),
      denominator: Number(raw.timeSignature?.denominator ?? DEFAULT_TIME_SIGNATURE.denominator),
    },
    projectLengthBeats,
    tracks,
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

class ProjectStore {
  private state: ProjectState;
  private listeners = new Set<Listener>();
  private clipboard: Note[] = [];

  constructor() {
    const project = this.loadSavedProject() ?? createDefaultProject();
    this.state = {
      project,
      selectedTrackId: project.tracks[0]?.id ?? '',
      selectedNoteId: null,
      selectedNoteIds: [],
      isDirty: false,
    };
  }

  getSnapshot = (): ProjectState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: ProjectState): void {
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
    this.commit({
      ...this.state,
      project: { ...project, updatedAt: new Date().toISOString() },
      isDirty: true,
    });
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
    this.updateProject((project) => ({ ...project, projectLengthBeats: clamp(projectLengthBeats, 128, 512) }));
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
    this.commit({ ...this.state, selectedTrackId: trackId, selectedNoteId: null, selectedNoteIds: [] });
  }

  addTrack(): void {
    const track = createTrack(`Lead ${this.state.project.tracks.filter((item) => item.type === 'instrument').length + 1}`);
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
    this.updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) => track.id === trackId
        ? { ...track, notes: [...track.notes, note].sort((a, b) => a.start - b.start || b.pitch - a.pitch) }
        : track),
    }));
    this.setSelectedNoteIds([note.id]);
  }

  updateNotes(trackId: string, changes: Record<string, Partial<Note>>): void {
    this.updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) => track.id === trackId
        ? {
          ...track,
          notes: track.notes.map((note) => changes[note.id] ? { ...note, ...changes[note.id] } : note)
            .sort((a, b) => a.start - b.start || b.pitch - a.pitch),
        }
        : track),
    }));
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
      id: `note-${Math.random().toString(36).slice(2)}`,
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
    const offset = Math.max(0.25, snapBeat(maxEnd - minStart + 0.25, 0.25));
    const pasted = notes.map((note) => ({
      ...note,
      id: `note-${Math.random().toString(36).slice(2)}`,
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

  save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state.project));
    this.commit({ ...this.state, isDirty: false });
  }
}

export const projectStore = new ProjectStore();

export function useProjectStore(): ProjectState {
  return useSyncExternalStore(projectStore.subscribe, projectStore.getSnapshot);
}
