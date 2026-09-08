import { audioEngine } from '../audio/AudioEngine';
import type { Project, Track } from '../types/music';
import { beatsPerBar } from '../utils/musicConstants';

export type TransportStatus = 'stopped' | 'playing' | 'paused';

export interface TransportSnapshot {
  status: TransportStatus;
  positionBeats: number;
}

type Listener = (snapshot: TransportSnapshot) => void;

const LOOKAHEAD_SECONDS = 0.12;
const SCHEDULER_INTERVAL_MS = 25;

export class Sequencer {
  private status: TransportStatus = 'stopped';
  private positionBeats = 0;
  private anchorTime = 0;
  private anchorBeat = 0;
  private scheduleCursorBeat = 0;
  private schedulerTimer: number | null = null;
  private animationFrame: number | null = null;
  private metronomeEnabled = false;
  private listeners = new Set<Listener>();

  constructor(private readonly getProject: () => Project) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  setMetronome(enabled: boolean): void {
    this.metronomeEnabled = enabled;
  }

  getCurrentBeat(): number {
    return this.currentAbsoluteBeat();
  }

  projectChanged(): void {
    if (this.status !== 'playing') return;
    this.positionBeats = Math.min(this.getProject().projectLengthBeats, this.currentAbsoluteBeat());
    this.anchorBeat = this.positionBeats;
    this.anchorTime = audioEngine.currentTime;
    this.scheduleCursorBeat = this.positionBeats;
    audioEngine.stopScheduled();
    this.scheduleAhead();
  }

  async play(): Promise<void> {
    const project = this.getProject();
    if (this.status === 'playing') return;
    if (this.positionBeats >= project.projectLengthBeats) this.positionBeats = 0;
    await audioEngine.resume();
    audioEngine.syncProject(project);
    await audioEngine.prepareInstruments(project.tracks.filter((track) => track.type === 'instrument').map((track) => track.instrument));
    this.anchorTime = audioEngine.currentTime;
    this.anchorBeat = this.positionBeats;
    this.scheduleCursorBeat = this.positionBeats;
    this.status = 'playing';
    this.scheduleAhead();
    this.schedulerTimer = window.setInterval(() => this.scheduleAhead(), SCHEDULER_INTERVAL_MS);
    this.tickUi();
    this.emit();
  }

  pause(): void {
    if (this.status !== 'playing') return;
    this.positionBeats = Math.min(this.getProject().projectLengthBeats, this.currentAbsoluteBeat());
    this.clearTimers();
    audioEngine.stopAll();
    this.status = 'paused';
    this.emit();
  }

  stop(): void {
    this.clearTimers();
    audioEngine.stopAll();
    this.status = 'stopped';
    this.positionBeats = 0;
    this.anchorBeat = 0;
    this.scheduleCursorBeat = 0;
    this.emit();
  }

  private currentAbsoluteBeat(): number {
    if (this.status !== 'playing') return this.positionBeats;
    const bpm = this.getProject().bpm;
    return this.anchorBeat + (audioEngine.currentTime - this.anchorTime) * (bpm / 60);
  }

  private scheduleAhead(): void {
    if (this.status !== 'playing') return;
    const project = this.getProject();
    const beatsPerSecond = project.bpm / 60;
    const rangeStart = this.scheduleCursorBeat;
    const rangeEnd = Math.min(
      project.projectLengthBeats,
      Math.max(rangeStart, this.currentAbsoluteBeat() + LOOKAHEAD_SECONDS * beatsPerSecond),
    );
    const anySolo = project.tracks.some((track) => track.solo);

    project.tracks.forEach((track) => {
      if (track.mute || (anySolo && !track.solo)) return;
      if (track.type === 'drum') this.scheduleDrumTrack(track, rangeStart, rangeEnd, project, beatsPerSecond);
      else this.scheduleInstrumentTrack(track, rangeStart, rangeEnd, project, beatsPerSecond);
    });

    if (this.metronomeEnabled) {
      const firstBeat = Math.ceil(rangeStart);
      for (let beat = firstBeat; beat < rangeEnd; beat += 1) {
        const time = this.anchorTime + (beat - this.anchorBeat) / beatsPerSecond;
        audioEngine.scheduleMetronome(Math.max(audioEngine.currentTime, time), beat % beatsPerBar(project.timeSignature) === 0);
      }
    }
    this.scheduleCursorBeat = rangeEnd;
  }

  private scheduleInstrumentTrack(track: Track, rangeStart: number, rangeEnd: number, project: Project, beatsPerSecond: number): void {
    track.notes.forEach((note) => {
      const absoluteStart = note.start;
      if (absoluteStart < rangeStart || absoluteStart >= rangeEnd) return;
      const startTime = this.anchorTime + (absoluteStart - this.anchorBeat) / beatsPerSecond;
      audioEngine.scheduleNote(
        note.pitch,
        Math.max(audioEngine.currentTime, startTime),
        note.duration / beatsPerSecond,
        track.instrument,
        { velocity: note.velocity, trackVolume: track.volume, pan: track.pan, trackId: track.id },
      );
    });
  }

  private scheduleDrumTrack(track: Track, rangeStart: number, rangeEnd: number, project: Project, beatsPerSecond: number): void {
    const pattern = track.drumPattern;
    if (!pattern) return;
    const barBeats = beatsPerBar(project.timeSignature);
    const stepBeats = barBeats / pattern.stepCount;
    const firstBar = Math.max(0, Math.floor(rangeStart / barBeats) - 1);
    const lastBar = Math.ceil(rangeEnd / barBeats) + 1;
    (Object.keys(pattern.steps) as Array<keyof typeof pattern.steps>).forEach((sound) => {
      pattern.steps[sound].forEach((enabled, step) => {
        if (!enabled) return;
        for (let bar = firstBar; bar <= lastBar; bar += 1) {
          const absoluteStart = bar * barBeats + step * stepBeats;
          if (absoluteStart < rangeStart || absoluteStart >= rangeEnd || absoluteStart >= project.projectLengthBeats) continue;
          const startTime = this.anchorTime + (absoluteStart - this.anchorBeat) / beatsPerSecond;
          audioEngine.scheduleDrum(sound, Math.max(audioEngine.currentTime, startTime), track.id, 0.86);
        }
      });
    });
  }

  private tickUi = (): void => {
    if (this.status !== 'playing') return;
    const project = this.getProject();
    this.positionBeats = Math.min(project.projectLengthBeats, this.currentAbsoluteBeat());
    if (this.positionBeats >= project.projectLengthBeats) {
      this.clearTimers();
      this.status = 'stopped';
      this.emit();
      return;
    }
    this.emit();
    this.animationFrame = requestAnimationFrame(this.tickUi);
  };

  private clearTimers(): void {
    if (this.schedulerTimer !== null) window.clearInterval(this.schedulerTimer);
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.schedulerTimer = null;
    this.animationFrame = null;
  }

  private snapshot(): TransportSnapshot {
    return { status: this.status, positionBeats: this.positionBeats };
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
