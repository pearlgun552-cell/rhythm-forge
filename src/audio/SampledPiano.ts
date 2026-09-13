import type { Instrument } from '../types/music';
import { sampleStore } from '../store/sampleStore';
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

// Built-in samples already shipped with the app. User imports remain rooted at C4.
const PIANO_SAMPLES: PianoSample[] = Array.from({ length: 7 }, (_, i) => ({ file: `C${i + 1}.mp3`, pitch: (i + 2) * 12 })).concat(Array.from({ length: 6 }, (_, i) => ({ file: `Fs${i + 1}.mp3`, pitch: (i + 2) * 12 + 6 })));

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
  private buffers = new Map<number, AudioBuffer>();
  private generation = 0;
  private readonly liveVoices = new Map<string, PianoVoice>();
  private readonly scheduledVoices = new Set<PianoVoice>();
  private loadPromise: Promise<void> | null = null;

  constructor(private readonly context: BaseAudioContext, private readonly destination: AudioNode) {}

  load(): Promise<void> {
    if (this.buffers.size) return Promise.resolve();
    if (!this.loadPromise) {
      const generation = this.generation;
      this.loadPromise = (async () => {
        const imported = sampleStore.getImported();
        const entries: Array<[number, AudioBuffer]> = imported
          ? [[60, await this.context.decodeAudioData(imported.data.slice(0))]]
          : await Promise.all(PIANO_SAMPLES.map(async sample => {
            const url = new URL(`samples/piano/${sample.file}`, document.baseURI).href;
            const data = await loadArrayBuffer(url);
            return [sample.pitch, await this.context.decodeAudioData(data.slice(0))] as [number, AudioBuffer];
          }));
        if (generation === this.generation) this.buffers = new Map(entries);
      })().catch((error: unknown) => { if (generation === this.generation) this.loadPromise = null; throw error; });
    }
    return this.loadPromise;
  }

  reset(): void {
    this.stopAll(); this.generation++; this.buffers.clear(); this.loadPromise = null;
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
    const rootPitch = [...this.buffers.keys()].sort((a, b) => Math.abs(a - pitch) - Math.abs(b - pitch))[0];
    if (rootPitch === undefined) return null;
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
