import { useRef } from 'react';
import { projectStore, useProjectStore } from '../store/projectStore';
import type { MidiClip, Track } from '../types/music';
import { snapBeat } from '../utils/musicConstants';

export function MidiClips({ track, length, onSeek }: { track: Track; length: number; onSeek?: (beat: number) => void }) {
  const { selectedClipId } = useProjectStore();
  const lane = useRef<HTMLDivElement>(null);
  const drag = useRef<{ clip: MidiClip; x: number; width: number; resize: boolean; pointer: number } | null>(null);
  return <div ref={lane} className="clip midi-lane" onPointerDown={event => {
    if (event.target !== event.currentTarget) return;
    projectStore.selectTrack(track.id);
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek?.((event.clientX - rect.left) / rect.width * length);
  }} onDoubleClick={event => {
    if (event.target !== event.currentTarget || track.type !== 'instrument') return;
    const rect = event.currentTarget.getBoundingClientRect();
    projectStore.addClip(track.id, { startBeat: snapBeat((event.clientX - rect.left) / rect.width * length, 1) });
  }}>
    {track.notes.filter(n => !n.clipId).map(n => <i className="loose-note" key={n.id} style={{ left: `${n.start / length * 100}%`, width: `${Math.max(.15, n.duration / length * 100)}%` }} />)}
    {track.type === 'drum' && <i className="drum-clip" style={{ left: 0, width: '100%' }} />}
    {track.clips?.map(clip => <button key={clip.id} type="button" title={`${clip.name}: ${clip.startBeat}–${clip.startBeat + clip.durationBeats} beats`} aria-label={`MIDI clip ${clip.name}`} className={`midi-clip-block ${selectedClipId === clip.id ? 'selected' : ''}`} style={{ left: `${clip.startBeat / length * 100}%`, width: `${clip.durationBeats / length * 100}%` }} onPointerDown={event => {
      if (event.button !== 0) return;
      event.stopPropagation(); projectStore.selectClip(clip.id, track.id); projectStore.beginEdit();
      drag.current = { clip: { ...clip }, x: event.clientX, width: lane.current!.getBoundingClientRect().width, resize: (event.target as HTMLElement).classList.contains('clip-resize'), pointer: event.pointerId };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => {
      const d = drag.current;
      if (!d || d.pointer !== event.pointerId) return;
      const delta = snapBeat((event.clientX - d.x) / d.width * length, .25);
      projectStore.updateClip(track.id, clip.id, d.resize ? { durationBeats: d.clip.durationBeats + delta } : { startBeat: d.clip.startBeat + delta });
    }} onPointerUp={() => { drag.current = null; projectStore.endEdit(); }} onPointerCancel={() => { drag.current = null; projectStore.endEdit(); }}>
      <b>{clip.name}</b><span className="clip-resize" aria-label={`Resize clip ${clip.name}`} />
    </button>)}
  </div>;
}
