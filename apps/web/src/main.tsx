import {
  StrictMode,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { createSyncClock, type SyncStatus } from './syncClock';

type SubtitleCue = {
  id: number;
  startMs: number;
  endMs: number;
  text: string;
};

type PlaybackSession = {
  id: string;
  itemId: string;
  itemType?: string | null;
  name: string;
  playbackRate: number;
  positionMs: number;
  productionYear?: number | null;
  runtimeMs?: number | null;
  sessionId: string;
  updatedAt: string;
  userName?: string | null;
  isPaused: boolean;
};

type PlaybackSnapshot = {
  lastUpdatedAt: string | null;
  sessions: PlaybackSession[];
};

type SubtitleSearchResult = {
  coverUrl: string | null;
  id: string;
  fileId: number;
  title: string;
  language: string | null;
  releaseName: string | null;
  downloadCount: number | null;
  rating: number | null;
};

type SubtitleSearchState = 'idle' | 'searching' | 'downloading';

const syncStatusLabels: Record<SyncStatus, string> = {
  adjusting: '🟡 Adjusting...',
  disconnected: '🔴 Disconnected',
  in_sync: '🟢 In Sync',
  resynced: '🔵 Resynced',
};

const demoCues: SubtitleCue[] = [
  {
    id: 1,
    startMs: 0,
    endMs: 2600,
    text: 'Upload an SRT file to begin.',
  },
  {
    id: 2,
    startMs: 3200,
    endMs: 7000,
    text: 'Select a Jellyfin session to sync playback.',
  },
];

function parseTimestamp(timestamp: string): number {
  const match = timestamp
    .trim()
    .match(/^(\d{1,2}):(\d{2}):(\d{2})(?:[,.](\d{1,3}))?$/);

  if (!match) {
    throw new Error(`Invalid SRT timestamp: ${timestamp}`);
  }

  const [, hours, minutes, seconds, milliseconds = '0'] = match;
  const paddedMilliseconds = milliseconds.padEnd(3, '0').slice(0, 3);

  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1000 +
    Number(paddedMilliseconds)
  );
}

function parseSrt(contents: string): SubtitleCue[] {
  const blocks = contents
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const cues = blocks.flatMap((block, blockIndex) => {
    const lines = block.split('\n').map((line) => line.trimEnd());
    const timingLineIndex = lines.findIndex((line) => line.includes('-->'));

    if (timingLineIndex === -1) {
      return [];
    }

    const [start, rawEnd] = lines[timingLineIndex]
      .split('-->')
      .map((part) => part.trim());
    const end = rawEnd.split(/\s+/)[0];
    const text = lines
      .slice(timingLineIndex + 1)
      .join('\n')
      .replace(/<\/?[^>]+>/g, '')
      .trim();

    if (!text) {
      return [];
    }

    return [
      {
        id: blockIndex + 1,
        startMs: parseTimestamp(start),
        endMs: parseTimestamp(end),
        text,
      },
    ];
  });

  if (cues.length === 0) {
    throw new Error('No playable subtitle cues were found in this SRT file.');
  }

  return cues.sort((a, b) => a.startMs - b.startMs);
}

function formatTime(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((safeMs % 1000) / 100);

  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}

function formatOffset(ms: number): string {
  const sign = ms > 0 ? '+' : '';
  return `${sign}${(ms / 1000).toFixed(1)}s`;
}

function formatOffsetInput(ms: number): string {
  return (ms / 1000).toFixed(1);
}

function formatMetadataValue(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return new Intl.NumberFormat().format(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function App() {
  const [cues, setCues] = useState<SubtitleCue[]>(demoCues);
  const [fileName, setFileName] = useState<string>('Demo subtitles');
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState(0);
  const [offsetInputValue, setOffsetInputValue] = useState('0.0');
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<PlaybackSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'error'
  >('connecting');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('disconnected');
  const [isSyncStatusHelpOpen, setIsSyncStatusHelpOpen] = useState(false);
  const [isSubtitleSearchOpen, setIsSubtitleSearchOpen] = useState(false);
  const [subtitleSearchQuery, setSubtitleSearchQuery] = useState('');
  const [subtitleSearchLanguage, setSubtitleSearchLanguage] = useState('en');
  const [subtitleSearchResults, setSubtitleSearchResults] = useState<
    SubtitleSearchResult[]
  >([]);
  const [subtitleSearchError, setSubtitleSearchError] = useState<string | null>(
    null,
  );
  const [subtitleSearchState, setSubtitleSearchState] =
    useState<SubtitleSearchState>('idle');
  const syncClockRef = useRef(createSyncClock());
  const hadConnectionErrorRef = useRef(false);

  const subtitleDurationMs = useMemo(
    () => cues.reduce((duration, cue) => Math.max(duration, cue.endMs), 0),
    [cues],
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  const timelineDurationMs = Math.max(
    selectedSession?.runtimeMs || 0,
    subtitleDurationMs,
  );
  const adjustedSubtitleTimeMs = clamp(
    currentTimeMs + subtitleOffsetMs,
    0,
    timelineDurationMs,
  );
  const movieProgressPercent =
    timelineDurationMs > 0 ? (currentTimeMs / timelineDurationMs) * 100 : 0;

  const activeCue = useMemo(
    () =>
      cues.find(
        (cue) =>
          adjustedSubtitleTimeMs >= cue.startMs &&
          adjustedSubtitleTimeMs <= cue.endMs,
      ),
    [adjustedSubtitleTimeMs, cues],
  );

  const subtitleText = activeCue?.text || '';

  useEffect(() => {
    syncClockRef.current.applyAnchor(selectedSession);
  }, [selectedSession]);

  useEffect(() => {
    let animationFrame = window.requestAnimationFrame(function tick() {
      const nowMs = performance.now();

      setCurrentTimeMs(syncClockRef.current.getPosition(nowMs));
      setSyncStatus(syncClockRef.current.getStatus(nowMs));
      animationFrame = window.requestAnimationFrame(tick);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    const eventSource = new EventSource('/api/playback-events');

    eventSource.addEventListener('open', () => {
      if (hadConnectionErrorRef.current) {
        syncClockRef.current.markResynced();
        hadConnectionErrorRef.current = false;
      }

      setConnectionState('connected');
    });

    eventSource.addEventListener('error', () => {
      hadConnectionErrorRef.current = true;
      syncClockRef.current.markDisconnected();
      setConnectionState('error');
    });

    eventSource.addEventListener('playback-snapshot', (event) => {
      const snapshot = JSON.parse((event as MessageEvent).data) as PlaybackSnapshot;

      setConnectionState('connected');
      setSessions(snapshot.sessions);
      setSelectedSessionId((currentSessionId) => {
        if (snapshot.sessions.some((session) => session.id === currentSessionId)) {
          return currentSessionId;
        }

        return snapshot.sessions[0]?.id ?? '';
      });
    });

    return () => eventSource.close();
  }, []);

  function loadSubtitleContents(contents: string, name: string): void {
    try {
      const nextCues = parseSrt(contents);
      setCues(nextCues);
      setFileName(name);
      setSubtitleOffset(0);
      setError(null);
    } catch (caughtError) {
      throw caughtError instanceof Error
        ? caughtError
        : new Error('Could not parse that SRT file.');
    }
  }

  async function handleFileChange(file: File | null): Promise<void> {
    if (!file) {
      return;
    }

    try {
      const contents = await file.text();
      loadSubtitleContents(contents, file.name);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not parse that SRT file.',
      );
    }
  }

  async function searchSubtitles(query: string): Promise<void> {
    const trimmedQuery = query.trim();
    const trimmedLanguage = subtitleSearchLanguage.trim().toLowerCase();

    if (!trimmedQuery) {
      setSubtitleSearchError(
        selectedSession
          ? 'Enter a title to search.'
          : 'Select a Jellyfin session or type a movie title.',
      );
      setSubtitleSearchResults([]);
      return;
    }

    setSubtitleSearchState('searching');
    setSubtitleSearchError(null);

    try {
      const params = new URLSearchParams({ query: trimmedQuery });

      if (trimmedLanguage) {
        params.set('language', trimmedLanguage);
      }

      const response = await fetch(`/api/subtitles/search?${params.toString()}`);
      const payload = (await response.json()) as {
        message?: string;
        results?: SubtitleSearchResult[];
      };

      if (!response.ok) {
        throw new Error(payload.message || 'Subtitle search failed.');
      }

      const results = payload.results || [];
      setSubtitleSearchResults(results);

      if (results.length === 0) {
        setSubtitleSearchError('No subtitles found for that search.');
      }
    } catch (caughtError) {
      setSubtitleSearchResults([]);
      setSubtitleSearchError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Subtitle search failed.',
      );
    } finally {
      setSubtitleSearchState('idle');
    }
  }

  function openSubtitleSearch(): void {
    const initialQuery = selectedSession?.name || '';

    setSubtitleSearchQuery(initialQuery);
    setSubtitleSearchResults([]);
    setSubtitleSearchError(null);
    setIsSubtitleSearchOpen(true);

    if (initialQuery) {
      void searchSubtitles(initialQuery);
    } else {
      setSubtitleSearchError('Select a Jellyfin session or type a movie title.');
    }
  }

  function closeSubtitleSearch(): void {
    if (subtitleSearchState === 'downloading') {
      return;
    }

    setIsSubtitleSearchOpen(false);
  }

  async function downloadSubtitle(result: SubtitleSearchResult): Promise<void> {
    setSubtitleSearchState('downloading');
    setSubtitleSearchError(null);

    try {
      const response = await fetch('/api/subtitles/download', {
        body: JSON.stringify({ fileId: result.fileId }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const payload = (await response.json()) as {
        content?: string;
        fileName?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || 'Subtitle download failed.');
      }

      if (!payload.content) {
        throw new Error('The downloaded subtitle file was empty.');
      }

      loadSubtitleContents(payload.content, payload.fileName || result.title);
      setIsSubtitleSearchOpen(false);
    } catch (caughtError) {
      setSubtitleSearchError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Subtitle download failed.',
      );
    } finally {
      setSubtitleSearchState('idle');
    }
  }

  function setSubtitleOffset(nextOffsetMs: number): void {
    setSubtitleOffsetMs(nextOffsetMs);
    setOffsetInputValue(formatOffsetInput(nextOffsetMs));
  }

  function setAdjustedSubtitleTime(nextSubtitleTimeMs: number): void {
    setSubtitleOffset(nextSubtitleTimeMs - currentTimeMs);
  }

  function nudgeSubtitleOffset(deltaMs: number): void {
    setSubtitleOffset(subtitleOffsetMs + deltaMs);
  }

  function resetSubtitleOffset(): void {
    setSubtitleOffset(0);
  }

  function commitOffsetInput(value: string): void {
    const parsedSeconds = Number(value);

    if (!Number.isFinite(parsedSeconds)) {
      setOffsetInputValue(formatOffsetInput(subtitleOffsetMs));
      return;
    }

    const nextOffsetMs = Math.round(parsedSeconds * 1000);
    setSubtitleOffset(nextOffsetMs);
  }

  function updateOffsetInput(value: string): void {
    setOffsetInputValue(value);

    const parsedSeconds = Number(value);

    if (Number.isFinite(parsedSeconds)) {
      setSubtitleOffsetMs(Math.round(parsedSeconds * 1000));
    }
  }

  return (
    <main className="app-shell">
      <section className="subtitle-stage" aria-label="Subtitle preview">
        <div className="sync-status-wrap">
          <button
            aria-expanded={isSyncStatusHelpOpen}
            className="sync-status-pill"
            type="button"
            onClick={() => setIsSyncStatusHelpOpen((isOpen) => !isOpen)}
          >
            <span role="status" aria-live="polite">
              {syncStatusLabels[syncStatus]}
            </span>
          </button>
          {isSyncStatusHelpOpen ? (
            <div className="sync-status-popover" role="dialog">
              <strong>Sync Status</strong>
              <dl>
                <div>
                  <dt>🟢 In Sync</dt>
                  <dd>Normal playback. No correction currently being applied.</dd>
                </div>
                <div>
                  <dt>🟡 Adjusting...</dt>
                  <dd>A small sync correction is being applied while drift is smoothed.</dd>
                </div>
                <div>
                  <dt>🔵 Resynced</dt>
                  <dd>
                    Shown briefly after a seek, pause/resume, reconnect, session
                    change, or large drift correction.
                  </dd>
                </div>
                <div>
                  <dt>🔴 Disconnected</dt>
                  <dd>No playback updates received recently, or the event stream is disconnected.</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
        <div className="subtitle-text" role="status" aria-live="polite">
          {subtitleText}
        </div>
      </section>

      <aside className="control-panel" aria-label="Subtitle controls">
        <label className="session-picker">
          <span>Jellyfin session</span>
          <select
            value={selectedSessionId}
            onChange={(event) => setSelectedSessionId(event.target.value)}
          >
            {sessions.length === 0 ? (
              <option value="">
                {connectionState === 'connecting'
                  ? 'Connecting to Jellyfin sessions...'
                  : 'No active playback sessions'}
              </option>
            ) : null}

            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
                {session.productionYear ? ` (${session.productionYear})` : ''}
                {session.userName ? ` - ${session.userName}` : ''}
              </option>
            ))}
          </select>
          <span className="field-note">
            {selectedSession
              ? selectedSession.isPaused
                ? 'Paused'
                : selectedSession.playbackRate !== 1
                  ? `Playing at ${selectedSession.playbackRate}x`
                  : 'Playing'
              : connectionState === 'error'
                ? 'Waiting for the backend event stream to reconnect.'
                : 'Start playback in Jellyfin, then select the session here.'}
          </span>
        </label>

        <div className="file-row">
          <div className="file-actions">
            <label className="file-picker">
              <input
                accept=".srt,application/x-subrip,text/plain"
                type="file"
                onChange={(event) => {
                  void handleFileChange(event.target.files?.[0] ?? null);
                }}
              />
              <span>Choose SRT</span>
            </label>
            <button
              className="subtitle-search-trigger"
              type="button"
              onClick={openSubtitleSearch}
            >
              Search Subtitles
            </button>
          </div>

          <div className="file-meta">
            <strong>{fileName}</strong>
            <span>{cues.length} cues</span>
          </div>
        </div>

        <div className="sync-row">
          <output aria-live="off">
            Movie {formatTime(currentTimeMs)}
          </output>
          <output aria-live="off">
            Subs {formatTime(adjustedSubtitleTimeMs)}
          </output>
          <span>{connectionState === 'connected' ? 'Live sync' : 'Reconnecting'}</span>
        </div>

        <div className="offset-row">
          <button type="button" onClick={() => nudgeSubtitleOffset(-1000)}>
            -1s
          </button>
          <button type="button" onClick={() => nudgeSubtitleOffset(-500)}>
            -0.5s
          </button>
          <button type="button" onClick={() => nudgeSubtitleOffset(-100)}>
            -0.1s
          </button>
          <label className="offset-input">
            <span>Offset</span>
            <input
              inputMode="decimal"
              step="0.1"
              type="number"
              value={offsetInputValue}
              onBlur={(event) => commitOffsetInput(event.target.value)}
              onChange={(event) => updateOffsetInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
            />
            <span>s</span>
          </label>
          <button type="button" onClick={() => nudgeSubtitleOffset(100)}>
            +0.1s
          </button>
          <button type="button" onClick={() => nudgeSubtitleOffset(500)}>
            +0.5s
          </button>
          <button type="button" onClick={() => nudgeSubtitleOffset(1000)}>
            +1s
          </button>
          <button type="button" onClick={resetSubtitleOffset}>
            Reset
          </button>
        </div>

        <label className="timeline">
          <span>Subtitle timing</span>
          <div
            className="timeline-control"
            style={
              {
                '--movie-progress': `${movieProgressPercent}%`,
              } as CSSProperties
            }
          >
            <input
              max={timelineDurationMs}
              min={0}
              step={100}
              type="range"
              value={adjustedSubtitleTimeMs}
              onChange={(event) =>
                setAdjustedSubtitleTime(Number(event.target.value))
              }
            />
          </div>
        </label>

        {error ? <p className="error-message">{error}</p> : null}
      </aside>

      {isSubtitleSearchOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeSubtitleSearch();
            }
          }}
        >
          <section
            aria-labelledby="subtitle-search-title"
            aria-modal="true"
            className="subtitle-search-modal"
            role="dialog"
          >
            <div className="modal-header">
              <h2 id="subtitle-search-title">Search Subtitles</h2>
              <button
                aria-label="Close subtitle search"
                className="modal-close-button"
                type="button"
                onClick={closeSubtitleSearch}
              >
                X
              </button>
            </div>

            <form
              className="subtitle-search-form"
              onSubmit={(event) => {
                event.preventDefault();
                void searchSubtitles(subtitleSearchQuery);
              }}
            >
              <label className="subtitle-search-field subtitle-query-field">
                <span>Movie title</span>
                <input
                  autoFocus
                  className="subtitle-query-input"
                  placeholder="Closer"
                  type="search"
                  value={subtitleSearchQuery}
                  onChange={(event) => setSubtitleSearchQuery(event.target.value)}
                />
              </label>
              <label className="subtitle-search-field subtitle-language-field">
                <span>Language</span>
                <input
                  className="subtitle-language-input"
                  inputMode="text"
                  maxLength={8}
                  placeholder="en"
                  type="text"
                  value={subtitleSearchLanguage}
                  onChange={(event) =>
                    setSubtitleSearchLanguage(
                      event.target.value.replace(/\s/g, '').toLowerCase(),
                    )
                  }
                />
              </label>
              <button
                disabled={
                  subtitleSearchState !== 'idle' || !subtitleSearchQuery.trim()
                }
                type="submit"
              >
                {subtitleSearchState === 'searching' ? 'Searching...' : 'Search'}
              </button>
            </form>

            {subtitleSearchError ? (
              <p className="modal-error">{subtitleSearchError}</p>
            ) : null}

            <div className="subtitle-results" role="list">
              {subtitleSearchResults.map((result) => {
                const downloadCount = formatMetadataValue(result.downloadCount);
                const rating = formatMetadataValue(result.rating);

                return (
                  <button
                    className="subtitle-result"
                    disabled={subtitleSearchState !== 'idle'}
                    key={`${result.id}-${result.fileId}`}
                    role="listitem"
                    type="button"
                    onClick={() => {
                      void downloadSubtitle(result);
                    }}
                  >
                    <span className="subtitle-cover" aria-hidden="true">
                      {result.coverUrl ? (
                        <img src={result.coverUrl} alt="" loading="lazy" />
                      ) : (
                        <span>No cover</span>
                      )}
                    </span>
                    <span className="subtitle-result-details">
                      <strong>{result.title}</strong>
                      <span>
                        {[
                          result.language ? result.language.toUpperCase() : null,
                          result.releaseName,
                        ]
                          .filter(Boolean)
                          .join(' - ') || 'Subtitle'}
                      </span>
                      <small>
                        {[
                          downloadCount ? `${downloadCount} downloads` : null,
                          rating ? `${rating} rating` : null,
                        ]
                          .filter(Boolean)
                          .join(' - ')}
                      </small>
                    </span>
                  </button>
                );
              })}

              {subtitleSearchState === 'downloading' ? (
                <p className="empty-results">Downloading selected subtitle...</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
