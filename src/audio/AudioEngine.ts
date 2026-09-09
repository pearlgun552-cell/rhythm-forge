import type { Instrument } from '../types/music';
import { PolySynth, type VoiceOptions } from './PolySynth';
import { SampledPiano } from './SampledPiano';

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private synth: PolySynth | null = null;
  private piano: SampledPiano | null = null;

  async resume(): Promise<void> {
    this.ensureContext();
    if (this.context?.state === 'suspended') await this.context.resume();
  }

  get currentTime(): number {
    this.ensureContext();
    return this.context?.currentTime ?? 0;
  }

  async prepareInstrument(instrument: Instrument): Promise<void> {
    this.ensureContext();
    if (instrument.type === 'sampled-piano') await this.piano?.load();
  }

  async prepareInstruments(instruments: Instrument[]): Promise<void> {
    if (instruments.some((instrument) => instrument.type === 'sampled-piano')) {
      this.ensureContext();
      await this.piano?.load();
    }
  }

  // Re-decodes the sampled piano using the current sample source. Used after
  // the user imports or removes a sample so live playback picks it up.
  async reloadPiano(): Promise<void> {
    this.ensureContext();
    this.piano?.reset();
    await this.piano?.load();
  }

  noteOn(voiceId: string, pitch: number, instrument: Instrument, options?: VoiceOptions): void {
    this.ensureContext();
    if (instrument.type === 'sampled-piano') this.piano?.noteOn(voiceId, pitch, instrument, options);
    else this.synth?.noteOn(voiceId, pitch, instrument, options);
  }

  noteOff(voiceId: string, release: number): void {
    this.synth?.noteOff(voiceId, release);
    this.piano?.noteOff(voiceId, release);
  }

  scheduleNote(pitch: number, startTime: number, durationSeconds: number, instrument: Instrument, options?: VoiceOptions): void {
    this.ensureContext();
    if (instrument.type === 'sampled-piano') this.piano?.scheduleNote(pitch, startTime, durationSeconds, instrument, options);
    else this.synth?.scheduleNote(pitch, startTime, durationSeconds, instrument, options);
  }

  scheduleMetronome(time: number, accented: boolean): void {
    this.ensureContext();
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = accented ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(accented ? 0.14 : 0.08, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(time);
    oscillator.stop(time + 0.05);
  }

  stopAll(): void {
    this.synth?.stopAll();
    this.piano?.stopAll();
  }

  private ensureContext(): void {
    if (this.context) return;
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.context.destination);
    this.synth = new PolySynth(this.context, this.master);
    this.piano = new SampledPiano(this.context, this.master);
  }
}

export const audioEngine = new AudioEngine();
