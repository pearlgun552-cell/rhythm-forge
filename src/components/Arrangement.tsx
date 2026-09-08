import { memo } from 'react';
import { useTransport } from '../sequencer/useTransport';
import { projectStore } from '../store/projectStore';
import type { Project, Track } from '../types/music';
import { barsForBeats, beatsPerBar } from '../utils/musicConstants';

interface ArrangementProps {
  project: Project;
  tracks: Track[];
  selectedTrackId: string;
}

const SECTION_KEYS = ['', 'A major', 'E major', 'F# minor', 'D major', 'C major', 'C minor'];

function ArrangementPlayhead({ project }: { project: Project }) {
  const { positionBeats } = useTransport();
  return <div className="arrangement-playhead" style={{ left: `calc(88px + (100% - 88px) * ${positionBeats / project.projectLengthBeats})` }} />;
}

export const Arrangement = memo(function Arrangement({ project, tracks, selectedTrackId }: ArrangementProps) {
  const bars = barsForBeats(project.projectLengthBeats, project.timeSignature);
  const barBeats = beatsPerBar(project.timeSignature);
  return (
    <section className="arrangement panel">
      <div className="arrangement-title">
        <div><span>ARRANGEMENT</span><strong>{bars} BARS · {project.timeSignature.numerator}/{project.timeSignature.denominator}</strong></div>
        <button className="section-add-button" onClick={() => projectStore.addSection('')} aria-label="Add Section">＋ Section</button>
      </div>
      <div className="arrangement-ruler" style={{ gridTemplateColumns: `repeat(${bars}, 1fr)` }}>
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
      <div className="section-editor-list">
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
              {SECTION_KEYS.map((key) => <option key={key} value={key}>{key || `Project · ${project.key}`}</option>)}
            </select>
            <button className="section-delete" onClick={() => projectStore.deleteSection(section.id)} aria-label={`Delete section ${section.name}`}>×</button>
          </div>
        ))}
      </div>
      <div className="arrangement-body">
        <ArrangementPlayhead project={project} />
        {tracks.map((track) => (
          <div className={track.id === selectedTrackId ? 'arrangement-lane selected' : 'arrangement-lane'} key={track.id}>
            <span>{track.name}</span>
            <div className="clip">
              {track.type === 'instrument' && track.notes.map((note) => (
                <i key={note.id} style={{ left: `${(note.start / project.projectLengthBeats) * 100}%`, width: `${Math.max(0.35, note.duration / project.projectLengthBeats * 100)}%` }} />
              ))}
              {track.type === 'drum' && <i className="drum-clip" style={{ left: 0, width: '100%' }} />}
            </div>
          </div>
        ))}
      </div>
      <span className="arrangement-beat-note">{barBeats} beats / bar · Sections are planning markers; notes are not moved automatically.</span>
    </section>
  );
});
