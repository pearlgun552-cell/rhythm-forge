import { AudioEngine } from '../audio/AudioEngine';
import { trackEvents } from './musicMath';
import type { Project } from '../types/music';

const SAMPLE_RATE = 44100;
const TAIL_SECONDS = 1.5;
const MP3_KILOBITS = 192;

// Downloads the current project as a portable JSON file.
export function saveProjectFile(project: Project): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, `${sanitizeFileName(project.name || 'project')}.json`);
}

// Renders the arrangement into an OfflineAudioContext and encodes it to MP3.
export async function exportProjectAsMp3(project: Project): Promise<void> {
  const rendered = await renderProject(project);
  const mp3 = await encodeAudioBufferToMp3(rendered);
  downloadBlob(mp3, `${sanitizeFileName(project.name || 'rhythm-forge')}.mp3`);
}

export async function exportProjectAsWav(project: Project): Promise<void> {
  const rendered = await renderProject(project);
  const wav = encodeAudioBufferToWav(rendered);
  downloadBlob(wav, `${sanitizeFileName(project.name || 'rhythm-forge')}.wav`);
}

export async function renderProject(project: Project): Promise<AudioBuffer> {
  const tail = Math.max(TAIL_SECONDS, ...project.tracks.map(t => t.instrument.adsr.release), project.reverb.enabled ? project.reverb.decay : 0) + .1;
  const duration = project.projectLengthBeats * 60 / project.bpm;
  const offline = new OfflineAudioContext(2, Math.ceil((duration + tail) * SAMPLE_RATE), SAMPLE_RATE);
  const engine = new AudioEngine(offline);
  engine.syncProject(project);
  await engine.prepareInstruments(project.tracks.filter(t => t.type === 'instrument').map(t => t.instrument));
  const anySolo = project.tracks.some(t => t.solo);
  for (const track of project.tracks) {
    if (track.mute || (anySolo && !track.solo)) continue;
    for (const note of trackEvents(track, project, 0, project.projectLengthBeats)) {
      const time = note.start * 60 / project.bpm;
      if (track.type === 'drum' && note.drumSound) engine.scheduleDrum(note.drumSound, time, track.id, note.velocity);
      else engine.scheduleNote(note.pitch, time, Math.min(note.duration, project.projectLengthBeats - note.start) * 60 / project.bpm, track.instrument, { velocity: note.velocity, trackId: track.id });
    }
  }
  return offline.startRendering();
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'project';
}

export async function encodeAudioBufferToMp3(buffer: AudioBuffer): Promise<Blob> {
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

export function encodeAudioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = 2;
  const bytesPerSample = 2;
  const dataLength = buffer.length * channels * bytesPerSample;
  const bytes = new ArrayBuffer(44 + dataLength);
  const view = new DataView(bytes);
  const write = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, dataLength, true);
  const left = buffer.getChannelData(0); const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  let offset = 44;
  for (let index = 0; index < buffer.length; index += 1) { view.setInt16(offset, floatToInt16(left[index] ?? 0), true); offset += 2; view.setInt16(offset, floatToInt16(right[index] ?? 0), true); offset += 2; }
  return new Blob([bytes], { type: 'audio/wav' });
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
