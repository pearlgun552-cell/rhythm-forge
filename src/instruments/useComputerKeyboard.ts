import { useCallback, useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import { sequencer } from '../sequencer/transport';
import { projectStore } from '../store/projectStore';
import type { Track } from '../types/music';
import { createId } from '../utils/id';
import { recordedSegments, type Loop } from '../utils/musicMath';
import { pitchForCode } from './keyboardMap';

interface ActiveKey { pitch: number; release: number; }
interface PendingRecording { pitch: number; startBeat: number; trackId: string; loop: Loop; grid: number; clipId: string | null; }
export interface ComputerKeyboardState { activePitches: Set<number>; finishRecording: () => void; }
export function useComputerKeyboard(track: Track | undefined, octave: number, setOctave: (value: number) => void, isRecording: boolean, keyboardMode: 'chromatic' | 'scale' = 'chromatic'): ComputerKeyboardState {
  const [activePitches, setActivePitches] = useState<Set<number>>(new Set());
  const activeCodes = useRef(new Map<string, ActiveKey>());
  const pending = useRef(new Map<string, PendingRecording>());
  const settings = useRef({ track, octave, setOctave, isRecording, keyboardMode });
  settings.current = { track, octave, setOctave, isRecording, keyboardMode };
  const commitRecording = useCallback((recording: PendingRecording, endBeat: number) => {
    const segments = recordedSegments(recording.startBeat, endBeat, recording.loop, recording.grid);
    projectStore.addNotes(recording.trackId, segments.map(segment => ({ ...segment, id: createId('note'), pitch: recording.pitch, velocity: .9 })), recording.clipId);
  }, []);
  const finishRecording = useCallback(() => {
    const end = sequencer.getCurrentBeat();
    const recordings = [...pending.current.values()];
    pending.current.clear();
    recordings.forEach(recording => commitRecording(recording, end));
  }, [commitRecording]);
  const releaseAll = useCallback(() => {
    finishRecording();
    activeCodes.current.forEach((key, code) => audioEngine.noteOff(`keyboard-${code}`, key.release));
    activeCodes.current.clear(); setActivePitches(new Set());
  }, [finishRecording]);
  useEffect(() => {
    const onKeyDown = async (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]') || event.metaKey || event.ctrlKey || event.altKey) return;
      const current = settings.current;
      if (event.code === 'KeyZ' || event.code === 'KeyX') {
        if (event.repeat) return;
        event.preventDefault(); releaseAll();
        current.setOctave(Math.max(1, Math.min(7, current.octave + (event.code === 'KeyX' ? 1 : -1)))); return;
      }
      const { project, gridSnap, selectedClipId } = projectStore.getSnapshot();
      const position = sequencer.getPositionBeat();
      const section = project.sections.find(s => position >= s.startBeat && position < s.startBeat + s.durationBeats);
      const pitch = pitchForCode(event.code, current.octave, current.keyboardMode, section?.keyOverride || project.key);
      if (pitch === null || !current.track || current.track.type !== 'instrument' || event.repeat || activeCodes.current.has(event.code)) return;
      event.preventDefault();
      const active = { pitch, release: current.track.instrument.adsr.release };
      activeCodes.current.set(event.code, active);
      setActivePitches(new Set([...activeCodes.current.values()].map(key => key.pitch)));
      if (current.isRecording) pending.current.set(event.code, { pitch, startBeat: sequencer.getCurrentBeat(), trackId: current.track.id, loop: { ...project }, grid: gridSnap, clipId: selectedClipId ?? null });
      try {
        await audioEngine.resume(); await audioEngine.prepareInstrument(current.track.instrument);
        if (activeCodes.current.get(event.code) !== active) return;
        audioEngine.noteOn(`keyboard-${event.code}`, pitch, current.track.instrument, { velocity: .9, trackId: current.track.id });
      } catch (error) { console.error('Keyboard instrument failed', error); releaseAll(); }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const active = activeCodes.current.get(event.code);
      if (!active) return;
      event.preventDefault(); audioEngine.noteOff(`keyboard-${event.code}`, active.release); activeCodes.current.delete(event.code);
      setActivePitches(new Set([...activeCodes.current.values()].map(key => key.pitch)));
      const recording = pending.current.get(event.code);
      pending.current.delete(event.code);
      if (recording) commitRecording(recording, sequencer.getCurrentBeat());
    };
    const off = sequencer.onDiscontinuity(releaseAll);
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', releaseAll);
    return () => { releaseAll(); off(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', releaseAll); };
  }, [commitRecording, releaseAll]);
  useEffect(() => { releaseAll(); }, [track?.id, octave, keyboardMode, releaseAll]);
  useEffect(() => { if (!isRecording) finishRecording(); }, [isRecording, finishRecording]);
  return { activePitches, finishRecording };
}
