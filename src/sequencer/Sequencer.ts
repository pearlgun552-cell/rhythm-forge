import { audioEngine } from '../audio/AudioEngine';
import type { Project } from '../types/music';
import { beatsPerBar } from '../utils/musicConstants';
import { positionAt, schedulerRanges, trackEvents } from '../utils/musicMath';

export type TransportStatus = 'stopped' | 'playing' | 'paused';
export interface TransportSnapshot { status: TransportStatus; positionBeats: number; }
type Listener = (snapshot: TransportSnapshot) => void;
type AudioPort = Pick<typeof audioEngine, 'currentTime' | 'resume' | 'syncProject' | 'prepareInstruments' | 'stopScheduled' | 'stopAll' | 'scheduleNote' | 'scheduleDrum' | 'scheduleMetronome'>;
const LOOKAHEAD_SECONDS = 0.12;

export class Sequencer {
  private status: TransportStatus = 'stopped';
  private positionBeats = 0;
  private anchorTime = 0;
  private anchorBeat = 0;
  private scheduleCursorBeat = 0;
  private clockProject: Project;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private metronomeEnabled = false;
  private listeners = new Set<Listener>();
  private discontinuityListeners = new Set<() => void>();
  private playRequest = 0;
  private starting = false;
  private chase = false;

  constructor(private readonly getProject: () => Project, private readonly audio: AudioPort = audioEngine) { this.clockProject = getProject(); }
  subscribe(listener: Listener): () => void { this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener); }
  // Called before seek/stop/configuration changes, while the recording clock is still valid.
  onDiscontinuity(listener: () => void): () => void { this.discontinuityListeners.add(listener); return () => this.discontinuityListeners.delete(listener); }
  private finishNotes(): void { this.discontinuityListeners.forEach(listener => listener()); }
  setMetronome(enabled: boolean): void { this.metronomeEnabled = enabled; }
  getCurrentBeat(): number { return this.status === 'playing' ? this.anchorBeat + (this.audio.currentTime - this.anchorTime) * this.clockProject.bpm / 60 : this.positionBeats; }
  getStatus(): TransportStatus { return this.status; }
  getPositionBeat(): number { return positionAt(this.getCurrentBeat(), this.clockProject); }

  seek(beat: number): void {
    this.finishNotes();
    const project = this.getProject();
    this.clockProject = project;
    const start = project.loopEnabled ? project.loopStartBeat : 0;
    const end = project.loopEnabled ? project.loopEndBeat : project.projectLengthBeats;
    this.positionBeats = Math.max(start, Math.min(end, Number.isFinite(beat) ? beat : start));
    if (project.loopEnabled && this.positionBeats >= end) this.positionBeats = start;
    this.anchorBeat = this.positionBeats;
    this.anchorTime = this.audio.currentTime;
    this.scheduleCursorBeat = this.anchorBeat;
    this.audio.stopScheduled();
    this.chase = true;
    this.pump(); this.emit();
  }

  projectChanged(recording = false): void {
    const next = this.getProject();
    const previous = this.clockProject;
    const timing = next.bpm !== previous.bpm || next.loopEnabled !== previous.loopEnabled || next.loopStartBeat !== previous.loopStartBeat || next.loopEndBeat !== previous.loopEndBeat || next.projectLengthBeats !== previous.projectLengthBeats;
    const noteChange = next.tracks.length !== previous.tracks.length || next.tracks.some((track, i) => track.notes !== previous.tracks[i]?.notes || track.clips !== previous.tracks[i]?.clips || track.drumPattern !== previous.tracks[i]?.drumPattern || track.mute !== previous.tracks[i]?.mute || track.solo !== previous.tracks[i]?.solo || track.instrument !== previous.tracks[i]?.instrument);
    if (timing) {
      this.finishNotes();
      const position = this.getPositionBeat();
      this.clockProject = next;
      this.positionBeats = positionAt(position, next);
      this.anchorBeat = this.positionBeats;
      this.anchorTime = this.audio.currentTime;
    } else this.clockProject = next;
    if (this.status === 'playing' && (timing || (noteChange && !recording))) {
      this.audio.stopScheduled();
      this.scheduleCursorBeat = this.getCurrentBeat();
      this.chase = true;
      this.pump();
    }
  }

  async play(): Promise<void> {
    if (this.status === 'playing' || this.starting) return;
    const request = ++this.playRequest;
    this.starting = true;
    try {
      await this.audio.resume();
      const project = this.getProject();
      await this.audio.prepareInstruments(project.tracks.filter(t => t.type === 'instrument').map(t => t.instrument));
      if (request !== this.playRequest) return;
      this.clockProject = this.getProject(); this.audio.syncProject(this.clockProject);
      const end = this.clockProject.loopEnabled ? this.clockProject.loopEndBeat : this.clockProject.projectLengthBeats;
      if (this.positionBeats >= end || (this.clockProject.loopEnabled && this.positionBeats < this.clockProject.loopStartBeat)) this.positionBeats = this.clockProject.loopEnabled ? this.clockProject.loopStartBeat : 0;
      this.anchorTime = this.audio.currentTime;
      this.anchorBeat = this.positionBeats;
      this.scheduleCursorBeat = this.positionBeats;
      this.status = 'playing'; this.chase = true;
      this.pump();
      this.schedulerTimer = setInterval(() => this.pump(), 25);
      this.emit();
    } finally { if (request === this.playRequest) this.starting = false; }
  }
  pause(): void {
    ++this.playRequest; this.starting = false;
    if (this.status !== 'playing') return;
    this.finishNotes(); this.positionBeats = this.getPositionBeat();
    this.clearTimer(); this.audio.stopAll(); this.status = 'paused'; this.emit();
  }
  stop(): void {
    ++this.playRequest; this.starting = false;
    this.finishNotes(); this.clearTimer(); this.audio.stopAll();
    this.status = 'stopped'; this.positionBeats = 0; this.anchorBeat = 0; this.scheduleCursorBeat = 0; this.emit();
  }

  // One monotonic audio clock; scheduling wraps ranges without moving that clock early.
  pump(): void {
    if (this.status !== 'playing') return;
    const project = this.clockProject;
    const current = this.getCurrentBeat();
    const bps = project.bpm / 60;
    if (!project.loopEnabled && current >= project.projectLengthBeats) {
      this.finishNotes(); this.positionBeats = project.projectLengthBeats;
      this.clearTimer(); this.status = 'stopped'; this.emit(); return;
    }
    if (current - this.scheduleCursorBeat > LOOKAHEAD_SECONDS * bps * 2) { this.scheduleCursorBeat = current; this.chase = true; }
    const until = current + LOOKAHEAD_SECONDS * bps;
    const anySolo = project.tracks.some(t => t.solo);
    for (const range of schedulerRanges(this.scheduleCursorBeat, until, project)) {
      const timeAt = (beat: number) => this.anchorTime + (range.absoluteFrom + beat - range.from - this.anchorBeat) / bps;
      for (const track of project.tracks) {
        if (track.mute || (anySolo && !track.solo)) continue;
        for (const note of trackEvents(track, project, range.from, range.to, this.chase)) {
          const start = Math.max(note.start, range.from);
          const end = Math.min(note.start + note.duration, project.loopEnabled ? project.loopEndBeat : project.projectLengthBeats);
          const time = Math.max(this.audio.currentTime, timeAt(start));
          if (track.type === 'drum' && note.drumSound) this.audio.scheduleDrum(note.drumSound, time, track.id, note.velocity);
          else this.audio.scheduleNote(note.pitch, time, Math.max(0.001, (end - start) / bps), track.instrument, { velocity: note.velocity, trackId: track.id });
        }
      }
      if (this.metronomeEnabled) for (let beat = Math.ceil(range.from); beat < range.to; beat++) this.audio.scheduleMetronome(Math.max(this.audio.currentTime, timeAt(beat)), beat % beatsPerBar(project.timeSignature) === 0);
      this.chase = false;
    }
    this.scheduleCursorBeat = Math.max(this.scheduleCursorBeat, until);
    this.positionBeats = positionAt(current, project); this.emit();
  }
  private clearTimer(): void { if (this.schedulerTimer !== null) clearInterval(this.schedulerTimer); this.schedulerTimer = null; }
  private snapshot(): TransportSnapshot { return { status: this.status, positionBeats: this.positionBeats }; }
  private emit(): void { const snapshot = this.snapshot(); this.listeners.forEach(listener => listener(snapshot)); }
}
