import { useCallback, useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import { sequencer } from '../sequencer/transport';
import { projectStore } from '../store/projectStore';
import type { Track } from '../types/music';
import { createId } from '../utils/id';
import { GRID_BEATS, LOOP_BEATS } from '../utils/musicConstants';
import { pitchForCode } from './keyboardMap';

interface ActiveKey {
  pitch: number;
  release: number;
}

interface PendingRecording {
  pitch: number;
  startBeat: number;
  trackId: string;
}

export interface ComputerKeyboardState {
  activePitches: Set<number>;
  finishRecording: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function quantize(value: number): number {
  return Math.round(value / GRID_BEATS) * GRID_BEATS;
}

function normalizeLoopBeat(beat: number): number {
  return ((beat % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS;
}

export function useComputerKeyboard(
  track: Track | undefined,
  octave: number,
  setOctave: (value: number) => void,
  isRecording: boolean,
): ComputerKeyboardState {
  const [activePitches, setActivePitches] = useState<Set<number>>(new Set());
  const activeCodes = useRef(new Map<string, ActiveKey>());
  const pendingRecordings = useRef(new Map<string, PendingRecording>());
  const trackRef = useRef(track);
  const octaveRef = useRef(octave);
  const recordingRef = useRef(isRecording);
  const setOctaveRef = useRef(setOctave);

  trackRef.current = track;
  octaveRef.current = octave;
  recordingRef.current = isRecording;
  setOctaveRef.current = setOctave;

  const commitRecording = useCallback((recording: PendingRecording, endBeat: number) => {
    const start = normalizeLoopBeat(quantize(recording.startBeat));
    const playedDuration = Math.max(GRID_BEATS, quantize(endBeat - recording.startBeat));
    const duration = Math.min(playedDuration, LOOP_BEATS - start);
    projectStore.addNote(recording.trackId, {
      id: createId('note'),
      pitch: recording.pitch,
      start,
      duration,
      velocity: 0.9,
    });
  }, []);

  const finishRecording = useCallback(() => {
    const endBeat = sequencer.getCurrentBeat();
    pendingRecordings.current.forEach((recording) => commitRecording(recording, endBeat));
    pendingRecordings.current.clear();
  }, [commitRecording]);

  useEffect(() => {
    const releaseAll = () => {
      const endBeat = sequencer.getCurrentBeat();
      activeCodes.current.forEach((activeKey, code) => {
        audioEngine.noteOff(`keyboard-${code}`, activeKey.release);
        const recording = pendingRecordings.current.get(code);
        if (recording) commitRecording(recording, endBeat);
      });
      activeCodes.current.clear();
      pendingRecordings.current.clear();
      setActivePitches(new Set());
    };

    const onKeyDown = async (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === 'KeyZ' || event.code === 'KeyX') {
        if (event.repeat) return;
        event.preventDefault();
        releaseAll();
        setOctaveRef.current(Math.max(1, Math.min(7, octaveRef.current + (event.code === 'KeyX' ? 1 : -1))));
        return;
      }
      const currentTrack = trackRef.current;
      const pitch = pitchForCode(event.code, octaveRef.current);
      if (pitch === null || !currentTrack || event.repeat || activeCodes.current.has(event.code)) return;
      event.preventDefault();
      activeCodes.current.set(event.code, { pitch, release: currentTrack.instrument.adsr.release });
      setActivePitches(new Set(Array.from(activeCodes.current.values(), (activeKey) => activeKey.pitch)));
      await audioEngine.resume();
      await audioEngine.prepareInstrument(currentTrack.instrument);
      if (!activeCodes.current.has(event.code)) return;
      if (recordingRef.current) {
        pendingRecordings.current.set(event.code, {
          pitch,
          startBeat: sequencer.getCurrentBeat(),
          trackId: currentTrack.id,
        });
      }
      audioEngine.noteOn(`keyboard-${event.code}`, pitch, currentTrack.instrument, {
        velocity: 0.9,
        trackVolume: currentTrack.volume,
        pan: currentTrack.pan,
      });
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const activeKey = activeCodes.current.get(event.code);
      if (!activeKey) return;
      event.preventDefault();
      audioEngine.noteOff(`keyboard-${event.code}`, activeKey.release);
      activeCodes.current.delete(event.code);
      setActivePitches(new Set(Array.from(activeCodes.current.values(), (key) => key.pitch)));
      const recording = pendingRecordings.current.get(event.code);
      if (recording) {
        commitRecording(recording, sequencer.getCurrentBeat());
        pendingRecordings.current.delete(event.code);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    return () => {
      releaseAll();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
    };
  }, [commitRecording]);

  useEffect(() => {
    if (!isRecording) finishRecording();
  }, [finishRecording, isRecording]);

  return { activePitches, finishRecording };
}
