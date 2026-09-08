import type { DrumSound, Instrument, Project, ReverbSettings, Track } from '../types/music';
import { PolySynth, type VoiceOptions } from './PolySynth';
import { SampledPiano } from './SampledPiano';

interface TrackChannel {
  input: GainNode;
  panner: StereoPannerNode;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private mixBus: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private reverbInput: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private synth: PolySynth | null = null;
  private piano: SampledPiano | null = null;
  private readonly channels = new Map<string, TrackChannel>();
  private readonly scheduledPercussion = new Set<AudioScheduledSourceNode>();
  private lastReverb: ReverbSettings = { enabled: false, mix: 0.22, decay: 1.8 };

  async resume(): Promise<void> {
    this.ensureContext();
    if (this.context?.state === 'suspended') await this.context.resume();
  }

  get currentTime(): number {
    this.ensureContext();
    return this.context?.currentTime ?? 0;
  }

  syncProject(project: Project): void {
    this.ensureContext();
    const anySolo = project.tracks.some((track) => track.solo);
    const activeIds = new Set(project.tracks.map((track) => track.id));
    project.tracks.forEach((track) => {
      this.ensureTrackChannel(track.id);
      this.updateTrackChannel(track, anySolo);
    });
    [...this.channels.keys()].forEach((trackId) => {
      if (!activeIds.has(trackId)) this.removeTrackChannel(trackId);
    });
    this.setReverb(project.reverb);
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

  noteOn(voiceId: string, pitch: number, instrument: Instrument, options: VoiceOptions = {}): void {
    this.ensureContext();
    const output = options.output ?? this.getTrackOutput(options.trackId);
    const voiceOptions = { ...options, output, trackVolume: options.trackId ? 1 : options.trackVolume, pan: options.trackId ? 0 : options.pan };
    if (instrument.type === 'sampled-piano') this.piano?.noteOn(voiceId, pitch, instrument, voiceOptions);
    else this.synth?.noteOn(voiceId, pitch, instrument, voiceOptions);
  }

  noteOff(voiceId: string, release: number): void {
    this.synth?.noteOff(voiceId, release);
    this.piano?.noteOff(voiceId, release);
  }

  scheduleNote(
    pitch: number,
    startTime: number,
    durationSeconds: number,
    instrument: Instrument,
    options: VoiceOptions = {},
  ): void {
    this.ensureContext();
    const output = options.output ?? this.getTrackOutput(options.trackId);
    const voiceOptions = { ...options, output, trackVolume: options.trackId ? 1 : options.trackVolume, pan: options.trackId ? 0 : options.pan };
    if (instrument.type === 'sampled-piano') this.piano?.scheduleNote(pitch, startTime, durationSeconds, instrument, voiceOptions);
    else this.synth?.scheduleNote(pitch, startTime, durationSeconds, instrument, voiceOptions);
  }

  scheduleDrum(sound: DrumSound, startTime: number, trackId: string, velocity = 0.85): void {
    this.ensureContext();
    if (!this.context) return;
    const output = this.getTrackOutput(trackId);
    const gain = this.context.createGain();
    const oscillator = this.context.createOscillator();
    const now = startTime;
    const level = Math.max(0.01, velocity * 0.5);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (sound === 'kick' ? 0.42 : sound === 'open-hat' ? 0.32 : 0.16));

    if (sound === 'kick') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(150, now);
      oscillator.frequency.exponentialRampToValueAtTime(48, now + 0.12);
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(now);
      oscillator.stop(now + 0.44);
      this.trackScheduledSource(oscillator);
      return;
    }

    const buffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * 0.35), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    const noise = this.context.createBufferSource();
    noise.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = sound === 'snare' || sound === 'clap' ? 'bandpass' : 'highpass';
    filter.frequency.value = sound === 'snare' ? 1800 : 5000;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    noise.start(now);
    noise.stop(now + (sound === 'open-hat' ? 0.34 : 0.18));
    this.trackScheduledSource(noise);
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
    this.trackScheduledSource(oscillator);
  }

  setReverb(settings: ReverbSettings): void {
    this.ensureContext();
    if (!this.context || !this.dryGain || !this.reverbGain || !this.reverbInput) return;
    const next = {
      enabled: settings.enabled,
      mix: Math.min(1, Math.max(0, settings.mix)),
      decay: Math.min(8, Math.max(0.1, settings.decay)),
    };
    const previousDecay = this.lastReverb.decay;
    this.lastReverb = next;
    this.dryGain.gain.setTargetAtTime(next.enabled ? 1 - next.mix * 0.35 : 1, this.context.currentTime, 0.015);
    this.reverbGain.gain.setTargetAtTime(next.enabled ? next.mix : 0, this.context.currentTime, 0.015);
    if (Math.abs(next.decay - previousDecay) > 0.01 || !this.reverbInput.buffer) {
      this.reverbInput.buffer = this.createImpulse(next.decay);
    }
  }

  updateTrackChannel(track: Pick<Track, 'id' | 'volume' | 'pan' | 'mute' | 'solo'>, anySolo = false): void {
    this.ensureContext();
    const channel = this.channels.get(track.id);
    if (!channel || !this.context) return;
    const audible = track.mute || (anySolo && !track.solo) ? 0 : Math.max(0, Math.min(1, track.volume));
    channel.input.gain.setTargetAtTime(audible, this.context.currentTime, 0.012);
    channel.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, track.pan)), this.context.currentTime, 0.012);
  }

  removeTrackChannel(trackId: string): void {
    const channel = this.channels.get(trackId);
    if (!channel) return;
    channel.input.disconnect();
    channel.panner.disconnect();
    this.channels.delete(trackId);
  }

  stopScheduled(): void {
    this.synth?.stopScheduled();
    this.piano?.stopScheduled();
    this.stopScheduledPercussion();
  }

  stopAll(): void {
    this.synth?.stopAll();
    this.piano?.stopAll();
    this.stopScheduledPercussion();
  }

  private trackScheduledSource(source: AudioScheduledSourceNode): void {
    this.scheduledPercussion.add(source);
    source.addEventListener('ended', () => this.scheduledPercussion.delete(source), { once: true });
  }

  private stopScheduledPercussion(): void {
    const when = this.context?.currentTime ?? 0;
    this.scheduledPercussion.forEach((source) => {
      try {
        source.stop(when);
      } catch {
        // Source may already have ended.
      }
    });
    this.scheduledPercussion.clear();
  }

  private getTrackOutput(trackId?: string): AudioNode {
    this.ensureContext();
    if (trackId) return this.ensureTrackChannel(trackId).panner;
    return this.mixBus ?? this.master!;
  }

  private ensureTrackChannel(trackId: string): TrackChannel {
    this.ensureContext();
    const existing = this.channels.get(trackId);
    if (existing) return existing;
    const input = this.context!.createGain();
    const panner = this.context!.createStereoPanner();
    input.gain.value = 0.8;
    panner.pan.value = 0;
    input.connect(panner);
    panner.connect(this.mixBus!);
    const channel = { input, panner };
    this.channels.set(trackId, channel);
    return channel;
  }

  private createImpulse(decay: number): AudioBuffer {
    const context = this.context!;
    const length = Math.max(1, Math.floor(context.sampleRate * decay));
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        const envelope = (1 - index / length) ** 2;
        data[index] = (Math.random() * 2 - 1) * envelope;
      }
    }
    return buffer;
  }

  private ensureContext(): void {
    if (this.context) return;
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    this.mixBus = this.context.createGain();
    this.dryGain = this.context.createGain();
    this.reverbInput = this.context.createConvolver();
    this.reverbGain = this.context.createGain();
    this.master.gain.value = 0.8;
    this.mixBus.connect(this.dryGain);
    this.dryGain.connect(this.master);
    this.mixBus.connect(this.reverbInput);
    this.reverbInput.connect(this.reverbGain);
    this.reverbGain.connect(this.master);
    this.master.connect(this.context.destination);
    this.synth = new PolySynth(this.context, this.mixBus);
    this.piano = new SampledPiano(this.context, this.mixBus);
    this.reverbInput.buffer = this.createImpulse(this.lastReverb.decay);
    this.setReverb(this.lastReverb);
  }
}

export const audioEngine = new AudioEngine();
