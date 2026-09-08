import type { Instrument } from '../types/music';

interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
  panner: StereoPannerNode;
}

export interface VoiceOptions {
  velocity?: number;
  trackVolume?: number;
  pan?: number;
  trackId?: string;
  output?: AudioNode;
}

const midiToFrequency = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);

export class PolySynth {
  private readonly output: GainNode;
  private readonly liveVoices = new Map<string, Voice>();
  private readonly scheduledVoices = new Set<Voice>();

  constructor(private readonly context: AudioContext, destination: AudioNode) {
    this.output = context.createGain();
    this.output.gain.value = 0.75;
    this.output.connect(destination);
  }

  noteOn(voiceId: string, pitch: number, instrument: Instrument, options: VoiceOptions = {}): void {
    if (this.liveVoices.has(voiceId)) return;
    const voice = this.createVoice(pitch, instrument, options);
    const now = this.context.currentTime;
    const peak = this.peakLevel(instrument, options);
    const { attack, decay, sustain } = instrument.adsr;
    voice.gain.gain.setValueAtTime(0.0001, now);
    voice.gain.gain.linearRampToValueAtTime(peak, now + Math.max(0.003, attack));
    voice.gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, peak * sustain),
      now + Math.max(0.006, attack + decay),
    );
    voice.oscillator.start(now);
    this.liveVoices.set(voiceId, voice);
  }

  noteOff(voiceId: string, release: number): void {
    const voice = this.liveVoices.get(voiceId);
    if (!voice) return;
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, Math.max(0.01, release / 4));
    this.safeStop(voice.oscillator, now + Math.max(0.04, release) + 0.08);
    this.liveVoices.delete(voiceId);
  }

  scheduleNote(
    pitch: number,
    startTime: number,
    durationSeconds: number,
    instrument: Instrument,
    options: VoiceOptions = {},
  ): void {
    const voice = this.createVoice(pitch, instrument, options);
    const peak = this.peakLevel(instrument, options);
    const { attack, decay, sustain, release } = instrument.adsr;
    const noteEnd = startTime + Math.max(0.02, durationSeconds);
    const attackEnd = Math.min(noteEnd, startTime + Math.max(0.003, attack));
    const decayEnd = Math.min(noteEnd, attackEnd + Math.max(0.003, decay));
    const stopTime = noteEnd + Math.max(0.04, release);
    voice.gain.gain.setValueAtTime(0.0001, startTime);
    voice.gain.gain.linearRampToValueAtTime(peak, attackEnd);
    voice.gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), decayEnd);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, peak * sustain), noteEnd);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);
    voice.oscillator.start(startTime);
    voice.oscillator.stop(stopTime + 0.02);
    this.scheduledVoices.add(voice);
    voice.oscillator.addEventListener('ended', () => this.scheduledVoices.delete(voice), { once: true });
  }

  stopAll(): void {
    const now = this.context.currentTime;
    this.liveVoices.forEach((voice) => this.stopVoiceImmediately(voice, now));
    this.scheduledVoices.forEach((voice) => this.stopVoiceImmediately(voice, now));
    this.liveVoices.clear();
    this.scheduledVoices.clear();
  }

  stopScheduled(): void {
    const now = this.context.currentTime;
    this.scheduledVoices.forEach((voice) => this.stopVoiceImmediately(voice, now));
    this.scheduledVoices.clear();
  }

  private createVoice(pitch: number, instrument: Instrument, options: VoiceOptions): Voice {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    oscillator.type = instrument.oscillator;
    oscillator.frequency.value = midiToFrequency(pitch);
    panner.pan.value = options.pan ?? 0;
    oscillator.connect(gain);
    gain.connect(panner);
    panner.connect(options.output ?? this.output);
    return { oscillator, gain, panner };
  }

  private peakLevel(instrument: Instrument, options: VoiceOptions): number {
    return Math.max(0.0001, (options.velocity ?? 0.8) * (options.trackVolume ?? 1) * instrument.volume * 0.28);
  }

  private stopVoiceImmediately(voice: Voice, when: number): void {
    voice.gain.gain.cancelScheduledValues(when);
    voice.gain.gain.setValueAtTime(0.0001, when);
    this.safeStop(voice.oscillator, when + 0.01);
  }

  private safeStop(oscillator: OscillatorNode, when: number): void {
    try {
      oscillator.stop(when);
    } catch {
      // The oscillator may already have stopped naturally.
    }
  }
}
