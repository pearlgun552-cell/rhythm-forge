import { projectStore } from '../store/projectStore';
import type { Track } from '../types/music';
import { useLanguage } from '../i18n';

interface TrackListProps {
  tracks: Track[];
  selectedTrackId: string;
}

export function TrackList({ tracks, selectedTrackId }: TrackListProps) {
  const { t } = useLanguage();
  return (
    <aside className="track-list panel">
      <div className="panel-heading">
        <div><span>{t('trackList.tracks')}</span><h2>{t('trackList.title')}</h2></div>
        <button className="add-button" onClick={() => projectStore.addTrack()} aria-label={t('trackList.addTrack')}>＋</button>
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
                aria-label={`${t('trackList.rename')} ${track.name}`}
                value={track.name}
                onClick={(event) => event.stopPropagation()}
                onFocus={() => projectStore.selectTrack(track.id)}
                onChange={(event) => projectStore.updateTrack(track.id, { name: event.target.value })}
              />
              <span>
                {track.instrument.type === 'sampled-piano' ? t('trackList.grandPiano') : `${track.instrument.oscillator} ${t('trackList.synth')}`}
                {' · '}{track.notes.length} {track.notes.length === 1 ? t('trackList.note') : t('trackList.notes')}
              </span>
            </div>
            <span className="track-led" />
          </article>
        ))}
      </div>
      <button className="add-track-wide" onClick={() => projectStore.addTrack()}>＋ {t('trackList.addInstrumentTrack')}</button>
    </aside>
  );
}
