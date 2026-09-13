import { createDefaultProject } from '../src/project/defaultProject';
import { renderProject, encodeAudioBufferToWav, encodeAudioBufferToMp3 } from '../src/utils/projectFiles';
import { normalizeProject, ProjectStore } from '../src/store/projectStore';
import { AudioEngine } from '../src/audio/AudioEngine';
import { sampleStore, encodeSample, decodeSample } from '../src/store/sampleStore';
import { audibleNotes } from '../src/utils/musicMath';
import type { Project } from '../src/types/music';

const results = document.querySelector('#results')!;
function stats(buffer: AudioBuffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => {
    const data = buffer.getChannelData(c); let power = 0, peak = 0; let nonFinite = 0;
    for (const value of data) { if (!Number.isFinite(value)) nonFinite++; power += value * value; peak = Math.max(peak, Math.abs(value)); }
    return { rms: Math.sqrt(power / data.length), peak, nonFinite };
  });
  return { seconds: buffer.duration, sampleRate: buffer.sampleRate, frames: buffer.length, channels };
}
const small = () => { const p = createDefaultProject(); p.bpm = 120; p.projectLengthBeats = 4; p.loopEndBeat = 4; p.tracks[0]!.instrument.oscillator = 'sine'; p.tracks[0]!.notes = [{ id: 'test', pitch: 60, start: 0, duration: 1, velocity: .8 }]; return p; };
async function post(path: string, body: Blob | string) { const response = await fetch(`http://127.0.0.1:5174/${path}`, { method: 'POST', body }); if (!response.ok) throw new Error(`Artifact write failed: ${response.status}`); }
(document.querySelector('#run') as HTMLButtonElement).onclick = async event => {
  (event.currentTarget as HTMLButtonElement).disabled = true;
  const checks: Array<{ name: string; passed: boolean }> = [];
  function check(name: string, passed: boolean) { checks.push({ name, passed }); results.textContent += `\n${passed ? 'PASS' : 'FAIL'} ${name}`; if (!passed) throw new Error(name); }
  try {
    results.textContent = 'Rendering fixtures…';
    const dry = await renderProject(small()); const dryStats = stats(dry);
    check('Stereo synth export is finite and audible', dry.numberOfChannels === 2 && dryStats.channels.every(c => c.rms > .001 && c.nonFinite === 0));
    let p = small(); p.tracks[0]!.mute = true;
    check('Mute exports silence', stats(await renderProject(p)).channels.every(c => c.peak < .000001));
    p = small(); p.tracks[0]!.volume = 0;
    check('Volume zero exports silence', stats(await renderProject(p)).channels.every(c => c.peak < .000001));
    p = small(); p.tracks[0]!.pan = -1;
    const left = stats(await renderProject(p));
    check('Pan left controls stereo channels', left.channels[0]!.rms > .001 && left.channels[1]!.rms < .000001);
    p = small(); p.tracks.push({ ...structuredClone(p.tracks[0]!), id: 'solo', notes: [], solo: true });
    check('Solo excludes other tracks', stats(await renderProject(p)).channels.every(c => c.peak < .000001));
    p = small(); p.reverb.enabled = true; p.reverb.mix = .5; p.reverb.decay = 2.8;
    const wet = await renderProject(p);
    check('Master reverb produces an audible tail', wet.getChannelData(0).slice(44100, 70000).some(v => Math.abs(v) > .00001));
    p = small(); p.tracks[0]!.type = 'drum'; p.tracks[0]!.notes = []; p.tracks[0]!.drumPattern = { stepCount: 4, steps: { kick: [true, false, false, false], snare: [false, true, false, false], 'closed-hat': [], 'open-hat': [], clap: [] } };
    check('Drum sequencer is included in offline output', stats(await renderProject(p)).channels[0]!.rms > .001);
    p = small(); p.tracks[0]!.instrument.type = 'sampled-piano'; p.tracks[0]!.notes[0]!.pitch = 88;
    check('Bundled piano samples load and render', stats(await renderProject(p)).channels[0]!.rms > .001);
    const fixture = encodeAudioBufferToWav(dry);
    const imported = { data: await fixture.arrayBuffer(), name: 'test-sample.wav', mimeType: 'audio/wav' };
    const restored = decodeSample(encodeSample(imported))!;
    check('Imported sample serialization preserves audio bytes', restored.data.byteLength === imported.data.byteLength && new Uint8Array(restored.data).every((v, i) => v === new Uint8Array(imported.data)[i]));
    sampleStore.setImported(restored);
    check('Custom sample reload produces audio', stats(await renderProject(p)).channels[0]!.rms > .00001);
    sampleStore.setImported(null);
    // Same engine used by live keyboard; test stopAll after a held live voice.
    const context = new AudioContext(); await context.resume();
    const engine = new AudioEngine(context); engine.syncProject(small());
    engine.noteOn('held', 60, small().tracks[0]!.instrument); engine.stopAll();
    check('Held live synth can be stopped', (engine as any).synth.liveVoices.size === 0);
    await context.close();
    results.textContent += '\nLoading full Altale reconstruction…';
    const raw = await (await fetch('/examples/altale-imitation.json')).text();
    const project = normalizeProject(JSON.parse(raw)) as Project;
    check('Altale project opens', !!project);
    const store = new ProjectStore(project);
    check('Save and reopen preserve all Altale notes', store.importJson(store.exportJson()) && store.getSnapshot().project.tracks.reduce((n, t) => n + t.notes.length, 0) === project.tracks.reduce((n, t) => n + t.notes.length, 0));
    check('Every pitched note is audible within its clip', project.tracks.filter(t => t.type === 'instrument').every(t => audibleNotes(t).length === t.notes.length));
    const rendered = await renderProject(project); const fullStats = stats(rendered);
    check('Full export includes the end of the arrangement', rendered.duration >= project.projectLengthBeats * 60 / project.bpm);
    check('Full export is finite and does not clip', fullStats.channels.every(c => c.nonFinite === 0 && c.peak < 1));
    results.textContent += `\nWAV: ${rendered.duration.toFixed(2)}s, peak ${Math.max(...fullStats.channels.map(c => c.peak)).toFixed(3)}. Encoding MP3…`;
    await post('wav', encodeAudioBufferToWav(rendered));
    await post('mp3', await encodeAudioBufferToMp3(rendered));
    await post('report', JSON.stringify({ checks, fullStats, noteCount: project.tracks.reduce((n, t) => n + t.notes.length, 0), version: '0.2.1', timestamp: new Date().toISOString() }, null, 2));
    results.textContent += '\nCOMPLETE: WAV, MP3 and report saved in release/acceptance.';
  } catch (error) { results.textContent += `\nERROR ${String(error)}`; await post('report', JSON.stringify({ checks, error: String(error) }, null, 2)); }
};
