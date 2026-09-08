import type { Track } from '../types/music';
import { LOOP_BARS, LOOP_BEATS } from '../utils/musicConstants';

interface ArrangementProps {
  tracks: Track[];
  selectedTrackId: string;
  positionBeats: number;
}

export function Arrangement({ tracks, selectedTrackId, positionBeats }: ArrangementProps) {
  return (
    <section className="arrangement panel">
      <div className="arrangement-title"><span>ARRANGEMENT</span><strong>{LOOP_BARS} BAR LOOP</strong></div>
      <div className="arrangement-ruler" style={{ gridTemplateColumns: `repeat(${LOOP_BARS}, 1fr)` }}>
        {Array.from({ length: LOOP_BARS }, (_, bar) => <i key={bar}>{bar + 1}</i>)}
      </div>
      <div className="arrangement-body">
        <div className="arrangement-playhead" style={{ left: `calc(88px + (100% - 88px) * ${positionBeats / LOOP_BEATS})` }} />
        {tracks.map((track) => (
          <div className={track.id === selectedTrackId ? 'arrangement-lane selected' : 'arrangement-lane'} key={track.id}>
            <span>{track.name}</span>
            <div className="clip">
              {track.notes.map((note) => (
                <i key={note.id} style={{ left: `${(note.start / LOOP_BEATS) * 100}%`, width: `${Math.max(0.35, note.duration / LOOP_BEATS * 100)}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
