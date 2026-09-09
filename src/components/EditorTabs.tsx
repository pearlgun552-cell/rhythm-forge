import { useRef, useState } from 'react';
import { useLanguage } from '../i18n';
import { Arrangement } from './Arrangement';
import { PianoRoll } from '../piano-roll/PianoRoll';
import type { Track } from '../types/music';

interface EditorTabsProps {
  tracks: Track[];
  selectedTrack: Track | undefined;
  selectedTrackId: string;
  selectedNoteId: string | null;
  activePitches: Set<number>;
  positionBeats: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function EditorTabs({
  tracks,
  selectedTrack,
  selectedTrackId,
  selectedNoteId,
  activePitches,
  positionBeats,
}: EditorTabsProps) {
  const { t } = useLanguage();
  // Each tab is an independent toggle. Both start visible so the two views
  // appear side by side, matching the previous stacked layout.
  const [arrangementVisible, setArrangementVisible] = useState(true);
  const [pianoVisible, setPianoVisible] = useState(true);
  const [ratio, setRatio] = useState(0.3);
  const canvasRef = useRef<HTMLDivElement>(null);
  const splitterRef = useRef<{ x: number; base: number; width: number } | null>(null);

  const startSplitterDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    splitterRef.current = { x: event.clientY, base: ratio, width: rect.height };
    const onMove = (moveEvent: PointerEvent) => {
      const splitter = splitterRef.current;
      if (!splitter) return;
      setRatio(clamp(splitter.base + (moveEvent.clientY - splitter.x) / splitter.width, 0.2, 0.8));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      splitterRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const bothVisible = arrangementVisible && pianoVisible;
  const neitherVisible = !arrangementVisible && !pianoVisible;

  return (
    <div className="editor-column editor-tabs-host">
      <div className="editor-tabs" role="toolbar" aria-label={t('arrangement.title')}>
        <button
          className={arrangementVisible ? 'editor-tab active' : 'editor-tab'}
          type="button"
          aria-pressed={arrangementVisible}
          title={t('editor.tabHint')}
          onClick={() => setArrangementVisible((visible) => !visible)}
        >
          <span className="editor-tab-icon" aria-hidden="true">▤</span>
          {t('arrangement.title')}
        </button>
        <button
          className={pianoVisible ? 'editor-tab active' : 'editor-tab'}
          type="button"
          aria-pressed={pianoVisible}
          title={t('editor.tabHint')}
          onClick={() => setPianoVisible((visible) => !visible)}
        >
          <span className="editor-tab-icon" aria-hidden="true">♬</span>
          {t('pianoRoll.heading')}
        </button>
      </div>

      <div className={`editor-canvas ${bothVisible ? 'split' : ''}`} ref={canvasRef}>
        {!neitherVisible && arrangementVisible && (
          <div className="editor-panel arrangement-panel" style={bothVisible ? { flexBasis: `${ratio * 100}%` } : undefined}>
            <Arrangement tracks={tracks} selectedTrackId={selectedTrackId} positionBeats={positionBeats} />
          </div>
        )}
        {bothVisible && <div className="editor-divider" role="separator" aria-orientation="vertical" onPointerDown={startSplitterDrag} />}
        {!neitherVisible && pianoVisible && (
          <div className="editor-panel piano-panel">
            <PianoRoll track={selectedTrack} selectedNoteId={selectedNoteId} activePitches={activePitches} positionBeats={positionBeats} />
          </div>
        )}
        {neitherVisible && (
          <div className="editor-empty">
            <span className="editor-empty-name">Rhythm Forge</span>
          </div>
        )}
      </div>
    </div>
  );
}
