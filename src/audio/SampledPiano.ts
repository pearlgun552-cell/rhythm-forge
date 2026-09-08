import type { Instrument } from '../types/music';
import type { VoiceOptions } from './PolySynth';

interface PianoVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: StereoPannerNode;
}

interface PianoSample {
  file: string;
  pitch: number;
}

const PIANO_SAMPLES: PianoSample[] = [
  { file: 'C1.mp3', pitch: 24 },
  { file: 'Fs1.mp3', pitch: 30 },
  { file: 'C2.mp3', pitch: 36 },
  { file: 'Fs2.mp3', pitch: 42 },
  { file: 'C3.mp3', pitch: 48 },
  { file: 'Fs3.mp3', pitch: 54 },
  { file: 'C4.mp3', pitch: 60 },
  { file: 'Fs4.mp3', pitch: 66 },
  { file: 'C5.mp3', pitch: 72 },
  { file: 'Fs5.mp3', pitch: 78 },
  { file: 'C6.mp3', pitch: 84 },
  { file: 'Fs6.mp3', pitch: 90 },
  { file: 'C7.mp3', pitch: 96 },
];

function loadArrayBuffer(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.onload = () => {
      if ((request.status >= 200 && request.status < 300) || (request.status === 0 && request.response)) {
        resolve(request.response as ArrayBuffer);
      } else {
        reject(new Error(`Unable to load piano sample: ${url}`));
      }
    };
    request.onerror = () => reject(new Error(`Unable to load piano sample: ${url}`));
    request.send();
  });
}

export class SampledPiano {
  private readonly buffers = new Map<number, AudioBuffer>();
  private readonly liveVoices = new Map<string, PianoVoice>();
  private readonly scheduledVoices = new Set<PianoVoice>();
  private loadPromise: Promise<void> | null = null;

  constructor(private readonly context: AudioContext, private readonly destination: AudioNode) {}

  load(): Promise<void> {
    if (this.buffers.size === PIANO_SAMPLES.length) return Promise.resolve();
    if (!this.loadPromise) {
      this.loadPromise = Promise.all(PIANO_SAMPLES.map(async ({ file, pitch }) => {
        const url = new URL(`samples/piano/${file}`, document.baseURI).href;
        const data = await loadArrayBuffer(url);
        this.buffers.set(pitch, await this.context.decodeAudioData(data.slice(0)));
      })).then(() => undefined).catch((error: unknown) => {
        this.loadPromise = null;
        throw error;
      });
    }
    return this.loadPromise;
  }

  noteOn(voiceId: string, pitch: number, instrument: Instrument, options: VoiceOptions = {}): void {
    if (this.liveVoices.has(voiceId)) return;
    const voice = this.createVoice(pitch, instrument, options);
    if (!voice) return;
    const now = this.context.currentTime;
    const peak = this.peakLevel(instrument, options);
    voice.gain.gain.setValueAtTime(0.0001, now);
    voice.gain.gain.linearRampToValueAtTime(peak, now + 0.008);
    voice.source.start(now);
    this.liveVoices.set(voiceId, voice);
    voice.source.addEventListener('ended', () => {
      if (this.liveVoices.get(voiceId) === voice) this.liveVoices.delete(voiceId);
    }, { once: true });
  }

  noteOff(voiceId: string, release: number): void {
    const voice = this.liveVoices.get(voiceId);
    if (!voice) return;
    const now = this.context.currentTime;
    const releaseSeconds = Math.max(0.08, release);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, releaseSeconds / 4);
    this.safeStop(voice.source, now + releaseSeconds + 0.08);
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
    if (!voice) return;
    const peak = this.peakLevel(instrument, options);
    const noteEnd = startTime + Math.max(0.03, durationSeconds);
    const releaseSeconds = Math.max(0.12, instrument.adsr.release);
    const stopTime = noteEnd + releaseSeconds;
    voice.gain.gain.setValueAtTime(0.0001, startTime);
    voice.gain.gain.linearRampToValueAtTime(peak, Math.min(noteEnd, startTime + 0.008));
    voice.gain.gain.setValueAtTime(peak, noteEnd);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);
    voice.source.start(startTime);
    this.safeStop(voice.source, stopTime + 0.03);
    this.scheduledVoices.add(voice);
    voice.source.addEventListener('ended', () => this.scheduledVoices.delete(voice), { once: true });
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

  private createVoice(pitch: number, instrument: Instrument, options: VoiceOptions): PianoVoice | null {
    const rootPitch = this.nearestSamplePitch(pitch);
    const buffer = this.buffers.get(rootPitch);
    if (!buffer) return null;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = 2 ** ((pitch - rootPitch) / 12);
    panner.pan.value = options.pan ?? 0;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(options.output ?? this.destination);
    return { source, gain, panner };
  }

  private nearestSamplePitch(pitch: number): number {
    return PIANO_SAMPLES.reduce((nearest, sample) => (
      Math.abs(sample.pitch - pitch) < Math.abs(nearest - pitch) ? sample.pitch : nearest
    ), 24);
  }

  private peakLevel(instrument: Instrument, options: VoiceOptions): number {
    return Math.max(0.0001, (options.velocity ?? 0.8) * (options.trackVolume ?? 1) * instrument.volume * 0.72);
  }

  private stopVoiceImmediately(voice: PianoVoice, when: number): void {
    voice.gain.gain.cancelScheduledValues(when);
    voice.gain.gain.setValueAtTime(0.0001, when);
    this.safeStop(voice.source, when + 0.01);
  }

  private safeStop(source: AudioBufferSourceNode, when: number): void {
    try {
      source.stop(when);
    } catch {
      // The sample may already have ended naturally.
    }
  }
}
