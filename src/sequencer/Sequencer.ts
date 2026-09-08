import { audioEngine } from '../audio/AudioEngine';
import type { Project } from '../types/music';
import { LOOP_BEATS } from '../utils/musicConstants';

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

  async play(): Promise<void> {
    if (this.status === 'playing') return;
    await audioEngine.resume();
    await audioEngine.prepareInstruments(this.getProject().tracks.map((track) => track.instrument));
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
    this.positionBeats = this.currentAbsoluteBeat() % LOOP_BEATS;
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
    const rangeEnd = Math.max(rangeStart, this.currentAbsoluteBeat() + LOOKAHEAD_SECONDS * beatsPerSecond);
    const anySolo = project.tracks.some((track) => track.solo);

    project.tracks.forEach((track) => {
      if (track.mute || (anySolo && !track.solo)) return;
      const firstCycle = Math.floor(rangeStart / LOOP_BEATS) - 1;
      const lastCycle = Math.floor(rangeEnd / LOOP_BEATS) + 1;
      for (let cycle = firstCycle; cycle <= lastCycle; cycle += 1) {
        track.notes.forEach((note) => {
          const absoluteStart = cycle * LOOP_BEATS + note.start;
          if (absoluteStart < rangeStart || absoluteStart >= rangeEnd) return;
          const startTime = this.anchorTime + (absoluteStart - this.anchorBeat) / beatsPerSecond;
          audioEngine.scheduleNote(
            note.pitch,
            Math.max(audioEngine.currentTime, startTime),
            note.duration / beatsPerSecond,
            track.instrument,
            { velocity: note.velocity, trackVolume: track.volume, pan: track.pan },
          );
        });
      }
    });

    if (this.metronomeEnabled) {
      const firstBeat = Math.ceil(rangeStart);
      for (let beat = firstBeat; beat < rangeEnd; beat += 1) {
        const time = this.anchorTime + (beat - this.anchorBeat) / beatsPerSecond;
        audioEngine.scheduleMetronome(Math.max(audioEngine.currentTime, time), beat % 4 === 0);
      }
    }
    this.scheduleCursorBeat = rangeEnd;
  }

  private tickUi = (): void => {
    if (this.status !== 'playing') return;
    this.positionBeats = this.currentAbsoluteBeat() % LOOP_BEATS;
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
