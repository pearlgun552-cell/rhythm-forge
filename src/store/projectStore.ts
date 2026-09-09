import { useSyncExternalStore } from 'react';
import { createDefaultProject, createSynth, createTrack } from '../project/defaultProject';
import type { Instrument, Note, Project, SynthPreset, Track } from '../types/music';

interface ProjectState {
  project: Project;
  selectedTrackId: string;
  selectedNoteId: string | null;
  isDirty: boolean;
}

type Listener = () => void;
const STORAGE_KEY = 'rhythm-forge-project-v2';

class ProjectStore {
  private state: ProjectState;
  private listeners = new Set<Listener>();

  constructor() {
    const project = this.loadSavedProject() ?? createDefaultProject();
    this.state = {
      project,
      selectedTrackId: project.tracks[0]?.id ?? '',
      selectedNoteId: null,
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
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const project = JSON.parse(raw) as Project;
      if (!project.id || !project.name || !Array.isArray(project.tracks) || project.tracks.length === 0) return null;
      if (!Array.isArray(project.synths) || project.synths.length === 0) {
        project.synths = [createSynth('我的合成器')];
      }
      return project;
    } catch {
      return null;
    }
  }

  private updateProject(updater: (project: Project) => Project): void {
    const project = updater(this.state.project);
    this.commit({
      ...this.state,
      project: { ...project, updatedAt: new Date().toISOString() },
      isDirty: true,
    });
  }

  setProjectName(name: string): void {
    this.updateProject((project) => ({ ...project, name }));
  }

  setBpm(bpm: number): void {
    this.updateProject((project) => ({ ...project, bpm: Math.max(40, Math.min(300, bpm)) }));
  }

  setKey(key: string): void {
    this.updateProject((project) => ({ ...project, key }));
  }

  selectTrack(trackId: string): void {
    if (!this.state.project.tracks.some((track) => track.id === trackId)) return;
    this.commit({ ...this.state, selectedTrackId: trackId, selectedNoteId: null });
  }

  addTrack(): void {
    const track = createTrack(`Lead ${this.state.project.tracks.length + 1}`);
    const firstSynth = this.state.project.synths[0];
    if (firstSynth) {
      track.instrument = {
        ...track.instrument,
        type: 'poly-synth',
        presetId: firstSynth.id,
        oscillator: firstSynth.oscillator,
        adsr: firstSynth.adsr,
        volume: firstSynth.volume,
      };
    }
    const project = {
      ...this.state.project,
      tracks: [...this.state.project.tracks, track],
      updatedAt: new Date().toISOString(),
    };
    this.commit({ ...this.state, project, selectedTrackId: track.id, selectedNoteId: null, isDirty: true });
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

  addSynth(name: string): SynthPreset {
    const synth = createSynth(name);
    this.updateProject((project) => ({ ...project, synths: [...project.synths, synth] }));
    return synth;
  }

  updateSynth(synthId: string, changes: Partial<Omit<SynthPreset, 'id'>>): void {
    this.updateProject((project) => ({
      ...project,
      synths: project.synths.map((synth) => (synth.id === synthId ? { ...synth, ...changes } : synth)),
    }));
  }

  // Edits a synth patch and every track currently using it, so the saved patch
  // and its live instruments stay in sync.
  updateSynthParamsForTracks(synthId: string, changes: Partial<Omit<SynthPreset, 'id'>>): void {
    this.updateProject((project) => ({
      ...project,
      synths: project.synths.map((synth) => (synth.id === synthId ? { ...synth, ...changes } : synth)),
      tracks: project.tracks.map((track) => (track.instrument.presetId === synthId
        ? { ...track, instrument: { ...track.instrument, ...changes } }
        : track)),
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
    this.commit({ ...this.state, selectedNoteId: note.id });
  }

  selectNote(noteId: string | null): void {
    this.commit({ ...this.state, selectedNoteId: noteId });
  }

  deleteSelectedNote(): void {
    const { selectedNoteId, selectedTrackId } = this.state;
    if (!selectedNoteId) return;
    this.updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) => track.id === selectedTrackId
        ? { ...track, notes: track.notes.filter((note) => note.id !== selectedNoteId) }
        : track),
    }));
    this.commit({ ...this.state, selectedNoteId: null });
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
