import { projectStore } from '../store/projectStore';
import type { Track } from '../types/music';

interface TrackListProps {
  tracks: Track[];
  selectedTrackId: string;
}

export function TrackList({ tracks, selectedTrackId }: TrackListProps) {
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
              <span>{track.instrument.type === 'sampled-piano' ? 'grand piano' : `${track.instrument.oscillator} synth`} · {track.notes.length} notes</span>
            </div>
            <span className="track-led" />
          </article>
        ))}
      </div>
      <button className="add-track-wide" onClick={() => projectStore.addTrack()}>＋ Add Instrument Track</button>
    </aside>
  );
}
