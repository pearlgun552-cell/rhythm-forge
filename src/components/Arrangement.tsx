import { memo } from 'react';
import { useTransport } from '../sequencer/useTransport';
import { MidiClips } from './MidiClips';
import { projectStore, useProjectStore } from '../store/projectStore';
import type { Project, Track } from '../types/music';
import { barsForBeats, beatsPerBar } from '../utils/musicConstants';

interface ArrangementProps {
  project: Project;
  tracks: Track[];
  selectedTrackId: string;
  onSeek?: (beat: number) => void;
}

const SECTION_KEYS = ['', 'A major', 'E major', 'F# minor', 'D major', 'C major', 'C minor'];

function ArrangementPlayhead({ project }: { project: Project }) {
  const { positionBeats } = useTransport();
  return <div className="arrangement-playhead" style={{ left: `calc(88px + (100% - 88px) * ${positionBeats / project.projectLengthBeats})` }} />;
}

export const Arrangement = memo(function Arrangement({ project, tracks, selectedTrackId, onSeek }: ArrangementProps) {
  const { selectedClipId } = useProjectStore();
  const selectedTrack = tracks.find(t => t.id === selectedTrackId);
  const selectedClip = selectedTrack?.clips?.find(c => c.id === selectedClipId);
  const bars = barsForBeats(project.projectLengthBeats, project.timeSignature);
  const barBeats = beatsPerBar(project.timeSignature);
  return (
    <section className="arrangement panel">
      <div className="arrangement-title">
        <div><span>ARRANGEMENT</span><strong>{bars} BARS · {project.timeSignature.numerator}/{project.timeSignature.denominator}</strong></div>
        <button className="section-add-button" onClick={() => projectStore.addSection('')} aria-label="Add Section">＋ Section</button>
      </div>
      <div className="clip-toolbar">
        <button disabled={selectedTrack?.type !== 'instrument'} onClick={() => projectStore.addClip(selectedTrackId)}>＋ MIDI Clip</button>
        {selectedClip && <>
          <input aria-label="Clip name" value={selectedClip.name} onChange={e => projectStore.updateClip(selectedTrackId, selectedClip.id, { name: e.target.value })} />
          <label>START <input aria-label="Clip start" type="number" step=".25" value={selectedClip.startBeat} onChange={e => projectStore.updateClip(selectedTrackId, selectedClip.id, { startBeat: Number(e.target.value) })} /></label>
          <label>LEN <input aria-label="Clip length" type="number" step=".25" value={selectedClip.durationBeats} onChange={e => projectStore.updateClip(selectedTrackId, selectedClip.id, { durationBeats: Number(e.target.value) })} /></label>
          <button onClick={() => projectStore.duplicateClip(selectedTrackId, selectedClip.id)}>Duplicate Clip</button>
          <button onClick={() => projectStore.deleteClip(selectedTrackId, selectedClip.id)}>Delete Clip</button>
        </>}
      </div>
      <div className="arrangement-timeline" style={{ minWidth: Math.max(600, project.projectLengthBeats * 6) }}>
      <div className="arrangement-ruler" onPointerDown={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek?.((event.clientX - rect.left) / rect.width * project.projectLengthBeats);
      }} style={{ gridTemplateColumns: `repeat(${bars}, 1fr)` }}>
        {Array.from({ length: bars }, (_, bar) => <i key={bar}>{bar + 1}</i>)}
      </div>
      <div className="section-lane" style={{ marginLeft: 88 }}>
        {project.sections.map((section) => (
          <div
            className="section-marker"
            key={section.id}
            style={{ left: `${(section.startBeat / project.projectLengthBeats) * 100}%`, width: `${Math.max(1, section.durationBeats / project.projectLengthBeats * 100)}%` }}
            title={`${section.name} · ${section.keyOverride || project.key}`}
          >
            <b>{section.name}</b><small>{section.keyOverride || project.key}</small>
          </div>
        ))}
      </div>
      <details className="section-editor-list"><summary>Sections · edit names, positions and keys</summary>
        {project.sections.map((section) => (
          <div className="section-editor-row" key={section.id}>
            <input
              aria-label={`Rename section ${section.name}`}
              value={section.name}
              onChange={(event) => projectStore.updateSection(section.id, { name: event.target.value })}
            />
            <label>START <input type="number" min="0" step="0.25" value={section.startBeat} onChange={(event) => projectStore.updateSection(section.id, { startBeat: Number(event.target.value) })} /></label>
            <label>LEN <input type="number" min="0.25" step="0.25" value={section.durationBeats} onChange={(event) => projectStore.updateSection(section.id, { durationBeats: Number(event.target.value) })} /></label>
            <select aria-label={`Key override for ${section.name}`} value={section.keyOverride ?? ''} onChange={(event) => projectStore.updateSection(section.id, { keyOverride: event.target.value || undefined })}>
              {[...new Set([...SECTION_KEYS, section.keyOverride || '', project.key])].map((key) => <option key={key} value={key}>{key || `Project · ${project.key}`}</option>)}
            </select>
            <button className="section-delete" onClick={() => projectStore.deleteSection(section.id)} aria-label={`Delete section ${section.name}`}>×</button>
          </div>
        ))}
      </details>
      <div className="arrangement-body" onPointerDown={(event) => {
        if (!onSeek || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, Math.min(project.projectLengthBeats, ((event.clientX - rect.left - 88) / Math.max(1, rect.width - 88)) * project.projectLengthBeats)));
      }}>
        <ArrangementPlayhead project={project} />
        {tracks.map((track) => (
          <div className={track.id === selectedTrackId ? 'arrangement-lane selected' : 'arrangement-lane'} key={track.id}>
            <span>{track.name}</span>
            <MidiClips track={track} length={project.projectLengthBeats} onSeek={onSeek} />
          </div>
        ))}
      </div>
      </div>
      <span className="arrangement-beat-note">{barBeats} beats / bar · Drag a clip to move · right edge to resize · double-click a lane to create. Sections remain independent.</span>
    </section>
  );
});
