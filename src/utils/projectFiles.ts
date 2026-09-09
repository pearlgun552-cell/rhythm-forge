import { PolySynth } from '../audio/PolySynth';
import { SampledPiano } from '../audio/SampledPiano';
import type { Project } from '../types/music';
import { LOOP_BEATS } from './musicConstants';

const SAMPLE_RATE = 44100;
const TAIL_SECONDS = 1.5;
const START_PAD_SECONDS = 0.05;
const MP3_KILOBITS = 192;

// Downloads the current project as a portable JSON file.
export function saveProjectFile(project: Project): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, `${sanitizeFileName(project.name || 'project')}.json`);
}

// Renders the arrangement into an OfflineAudioContext and encodes it to MP3.
export async function exportProjectAsMp3(project: Project): Promise<void> {
  const beatsPerSecond = project.bpm / 60;
  const loopSeconds = LOOP_BEATS / beatsPerSecond;
  const length = Math.ceil((loopSeconds + TAIL_SECONDS) * SAMPLE_RATE);
  const offline = new OfflineAudioContext(2, length, SAMPLE_RATE);

  const master = offline.createGain();
  master.gain.value = 0.85;
  master.connect(offline.destination);

  const anySolo = project.tracks.some((track) => track.solo);
  const activeTracks = project.tracks.filter((track) => !track.mute && (!anySolo || track.solo));

  // Load the sampled source once, before scheduling, so it is decoded at
  // render time. PolySynth needs no external source.
  let piano: SampledPiano | null = null;
  if (activeTracks.some((track) => track.instrument.type === 'sampled-piano')) {
    piano = new SampledPiano(offline as unknown as AudioContext, master);
    await piano.load();
  }

  activeTracks.forEach((track) => {
    const synth = track.instrument.type === 'sampled-piano'
      ? (piano as SampledPiano)
      : new PolySynth(offline as unknown as AudioContext, master);
    track.notes.forEach((note) => {
      synth.scheduleNote(
        note.pitch,
        START_PAD_SECONDS + note.start / beatsPerSecond,
        note.duration / beatsPerSecond,
        track.instrument,
        { velocity: note.velocity, trackVolume: track.volume, pan: track.pan },
      );
    });
  });

  const rendered = await offline.startRendering();
  const mp3 = await encodeAudioBufferToMp3(rendered);
  downloadBlob(mp3, `${sanitizeFileName(project.name || 'rhythm-forge')}.mp3`);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'project';
}

async function encodeAudioBufferToMp3(buffer: AudioBuffer): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const left = new Int16Array(buffer.length);
  const right = new Int16Array(buffer.length);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  for (let i = 0; i < buffer.length; i += 1) {
    left[i] = floatToInt16(ch0[i] ?? 0);
    right[i] = floatToInt16(ch1[i] ?? 0);
  }

  const encoder = new Mp3Encoder(2, buffer.sampleRate, MP3_KILOBITS);
  const chunks: Uint8Array[] = [];
  const blockSize = 1152;
  for (let i = 0; i < left.length; i += blockSize) {
    const sliceLeft = left.subarray(i, i + blockSize);
    const sliceRight = right.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(sliceLeft, sliceRight);
    if (encoded.length) chunks.push(encoded);
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(tail);

  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
}

function floatToInt16(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
