import { memo } from 'react';
import { projectStore } from '../store/projectStore';
import type { Track } from '../types/music';

interface TrackListProps {
  tracks: Track[];
  selectedTrackId: string;
  onDeleteTrack: (trackId: string) => void;
}

export const TrackList = memo(function TrackList({ tracks, selectedTrackId, onDeleteTrack }: TrackListProps) {
  const requestDelete = (track: Track) => {
    if (tracks.length <= 1) {
      window.alert('Project must contain at least one track.');
      return;
    }
    if (track.notes.length > 0 && !window.confirm(`Delete “${track.name}”?\n\nThis track contains ${track.notes.length} notes.`)) return;
    onDeleteTrack(track.id);
  };

  return (
    <aside className="track-list panel">
      <div className="panel-heading">
        <div><span>TRACKS</span><h2>音轨</h2></div>
        <button className="add-button" onClick={() => projectStore.addTrack()} aria-label="Add Track">＋</button>
      </div>
      <div className="track-items">
        {tracks.map((track, index) => (
          <article
            className={track.id === selectedTrackId ? 'track-item selected' : 'track-item'}
            key={track.id}
            onClick={() => projectStore.selectTrack(track.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              requestDelete(track);
            }}
          >
            <div className="track-number">{String(index + 1).padStart(2, '0')}</div>
            <div className="track-copy">
              <input
                aria-label={`Rename ${track.name}`}
                value={track.name}
                onClick={(event) => event.stopPropagation()}
                onFocus={() => projectStore.selectTrack(track.id)}
                onChange={(event) => projectStore.updateTrack(track.id, { name: event.target.value })}
              />
              <span>{track.type === 'drum' ? 'drum machine' : track.instrument.type === 'sampled-piano' ? 'grand piano' : `${track.instrument.preset} synth`} · {track.type === 'drum' ? '16 steps' : `${track.notes.length} notes`}</span>
            </div>
            <button
              className="track-menu"
              disabled={tracks.length <= 1}
              aria-label={`Delete ${track.name}`}
              title={tracks.length <= 1 ? 'Project must contain at least one track.' : 'Delete Track'}
              onClick={(event) => {
                event.stopPropagation();
                requestDelete(track);
              }}
            >
              ⋯
            </button>
            <span className="track-led" />
          </article>
        ))}
      </div>
      {tracks.length === 1 && <p className="track-limit">Project must contain at least one track.</p>}
      <div className="track-add-actions">
        <button className="add-track-wide" onClick={() => projectStore.addTrack()}>＋ Instrument Track</button>
        <button className="add-track-wide drum-add" onClick={() => projectStore.addDrumTrack()}>＋ Drum Track</button>
      </div>
    </aside>
  );
});
