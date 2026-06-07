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
import fallbackSubtitleLanguagesConfig from '../../../subtitleLanguages.json';

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
  episodeNumber?: number | null;
  name: string;
  playbackRate: number;
  positionMs: number;
  productionYear?: number | null;
  runtimeMs?: number | null;
  seasonNumber?: number | null;
  seriesName?: string | null;
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
type SubtitleSizeOption = 'small' | 'medium' | 'large' | 'extra_large';
type SubtitlePositionOption = 'top' | 'center' | 'bottom';
type ThemeMode = 'dark' | 'light' | 'system';
type IconName = 'menu' | 'refresh' | 'reset' | 'search' | 'upload';
type SubtitleLanguageOption = {
  code: string;
  name: string;
};

function normalizeSubtitleLanguages(
  rawLanguages: unknown,
): SubtitleLanguageOption[] {
  if (!Array.isArray(rawLanguages)) {
    return [];
  }

  return rawLanguages.flatMap((entry) => {
    if (
      entry &&
      typeof entry === 'object' &&
      'code' in entry &&
      'name' in entry &&
      typeof entry.code === 'string' &&
      typeof entry.name === 'string'
    ) {
      const code = entry.code.trim().toLowerCase();
      const name = entry.name.trim();

      if (code && name) {
        return [{ code, name }];
      }
    }

    return [];
  });
}

const fallbackSubtitleLanguages = normalizeSubtitleLanguages(
  fallbackSubtitleLanguagesConfig,
);

const syncStatusLabels: Record<SyncStatus, string> = {
  adjusting: 'Adjusting...',
  disconnected: 'Disconnected',
  in_sync: 'In Sync',
  resynced: 'Resynced',
};

const demoCues: SubtitleCue[] = [
  {
    id: 1,
    startMs: 0,
    endMs: 2600,
    text: 'Search subtitles or upload an SRT to begin.',
  },
  {
    id: 2,
    startMs: 3200,
    endMs: 7000,
    text: 'Pick the Jellyfin session playing on your TV.',
  },
];

const subtitleSizeScales: Record<SubtitleSizeOption, number> = {
  small: 0.82,
  medium: 1,
  large: 1.22,
  extra_large: 1.48,
};

const subtitlePositionValues: Record<SubtitlePositionOption, number> = {
  top: 28,
  center: 50,
  bottom: 72,
};
const chromeIdleDelayMs = 2800;

function Icon({ name }: { name: IconName }) {
  const commonProps = {
    'aria-hidden': true,
    fill: 'none',
    height: 20,
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
    viewBox: '0 0 24 24',
    width: 20,
  };

  if (name === 'menu') {
    return (
      <svg {...commonProps}>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
      </svg>
    );
  }

  if (name === 'reset') {
    return (
      <svg {...commonProps}>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10a6 6 0 1 1-4.2 10.3" />
      </svg>
    );
  }

  if (name === 'refresh') {
    return (
      <svg {...commonProps}>
        <path d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5-4v4h4" />
        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
      </svg>
    );
  }

  if (name === 'upload') {
    return (
      <svg {...commonProps}>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 20h14" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

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

function formatMetadataValue(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return new Intl.NumberFormat().format(value);
}

function formatSeasonEpisode(value: number): string {
  return value.toString().padStart(2, '0');
}

function formatEpisodeSearchQuery(session: PlaybackSession): string {
  const seriesName = session.seriesName?.trim();
  const yearSuffix = session.productionYear ? ` ${session.productionYear}` : '';

  if (!seriesName) {
    return `${session.name}${yearSuffix}`;
  }

  if (session.seasonNumber === null || session.seasonNumber === undefined) {
    return session.episodeNumber === null || session.episodeNumber === undefined
      ? `${seriesName}${yearSuffix}`
      : `${seriesName}${yearSuffix} E${formatSeasonEpisode(session.episodeNumber)}`;
  }

  if (session.episodeNumber === null || session.episodeNumber === undefined) {
    return `${seriesName}${yearSuffix} S${formatSeasonEpisode(session.seasonNumber)}`;
  }

  return `${seriesName}${yearSuffix} S${formatSeasonEpisode(
    session.seasonNumber,
  )}E${formatSeasonEpisode(session.episodeNumber)}`;
}

function formatSubtitleSearchQuery(session: PlaybackSession | null): string {
  if (!session) {
    return '';
  }

  return session.itemType === 'Episode'
    ? formatEpisodeSearchQuery(session)
    : `${session.name}${session.productionYear ? ` ${session.productionYear}` : ''}`;
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
  const [subtitleSize, setSubtitleSize] =
    useState<SubtitleSizeOption>('medium');
  const [subtitlePosition, setSubtitlePosition] =
    useState<SubtitlePositionOption>('center');
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [prefersDarkTheme, setPrefersDarkTheme] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<PlaybackSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'error'
  >('connecting');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('disconnected');
  const [isSubtitleSearchOpen, setIsSubtitleSearchOpen] = useState(false);
  const [subtitleSearchQuery, setSubtitleSearchQuery] = useState('');
  const [subtitleSearchLanguage, setSubtitleSearchLanguage] = useState('en');
  const [subtitleLanguageFilter, setSubtitleLanguageFilter] = useState('');
  const [subtitleLanguages, setSubtitleLanguages] = useState(
    fallbackSubtitleLanguages,
  );
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
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
  const chromeIdleTimerRef = useRef<number | null>(null);

  const subtitleDurationMs = useMemo(
    () => cues.reduce((duration, cue) => Math.max(duration, cue.endMs), 0),
    [cues],
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );
  const filteredSubtitleLanguages = useMemo(() => {
    const query = subtitleLanguageFilter.trim().toLowerCase();

    if (!query) {
      return subtitleLanguages;
    }

    return subtitleLanguages.filter((language) =>
      language.code.includes(query) || language.name.toLowerCase().includes(query),
    );
  }, [subtitleLanguageFilter, subtitleLanguages]);

  const timelineDurationMs = Math.max(
    selectedSession?.runtimeMs || 0,
    subtitleDurationMs,
  );
  const adjustedSubtitleTimeMs = clamp(
    currentTimeMs + subtitleOffsetMs,
    0,
    timelineDurationMs,
  );
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
  const resolvedTheme =
    themeMode === 'system' ? (prefersDarkTheme ? 'dark' : 'light') : themeMode;

  useEffect(() => {
    let isMounted = true;

    async function loadRuntimeSubtitleLanguages(): Promise<void> {
      try {
        const response = await fetch('/api/subtitle-languages');

        if (!response.ok) {
          return;
        }

        const languages = normalizeSubtitleLanguages(await response.json());

        if (isMounted && languages.length > 0) {
          setSubtitleLanguages(languages);
        }
      } catch {
        // Keep the bundled fallback list if the runtime config is unavailable.
      }
    }

    void loadRuntimeSubtitleLanguages();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    syncClockRef.current.applyAnchor(selectedSession);
  }, [selectedSession]);

  useEffect(() => {
    function clearChromeIdleTimer(): void {
      if (chromeIdleTimerRef.current !== null) {
        window.clearTimeout(chromeIdleTimerRef.current);
        chromeIdleTimerRef.current = null;
      }
    }

    function hasFocusedChromeControl(): boolean {
      const activeElement = document.activeElement;

      return Boolean(
        activeElement &&
          activeElement.closest?.(
            '.top-bar, .bottom-bar, .settings-panel, .subtitle-search-modal',
          ),
      );
    }

    function scheduleChromeHide(): void {
      clearChromeIdleTimer();

      if (isSettingsOpen || isSubtitleSearchOpen) {
        setIsChromeVisible(true);
        return;
      }

      chromeIdleTimerRef.current = window.setTimeout(() => {
        if (!hasFocusedChromeControl()) {
          setIsChromeVisible(false);
        }
      }, chromeIdleDelayMs);
    }

    function revealChrome(): void {
      setIsChromeVisible(true);
      scheduleChromeHide();
    }

    const activityEvents = [
      'mousemove',
      'mousedown',
      'pointermove',
      'pointerdown',
      'touchstart',
      'touchmove',
      'wheel',
      'keydown',
      'focusin',
    ] as const;

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, revealChrome, { passive: true });
    }

    scheduleChromeHide();

    return () => {
      clearChromeIdleTimer();

      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, revealChrome);
      }
    };
  }, [isSettingsOpen, isSubtitleSearchOpen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    setPrefersDarkTheme(mediaQuery.matches);

    function handleThemeChange(event: MediaQueryListEvent): void {
      setPrefersDarkTheme(event.matches);
    }

    mediaQuery.addEventListener('change', handleThemeChange);

    return () => mediaQuery.removeEventListener('change', handleThemeChange);
  }, []);

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

  async function refreshSessions(): Promise<void> {
    setConnectionState('connecting');

    try {
      const response = await fetch('/api/playback-sessions');
      const snapshot = (await response.json()) as PlaybackSnapshot;

      if (!response.ok) {
        throw new Error('Could not refresh Jellyfin sessions.');
      }

      setConnectionState('connected');
      setSessions(snapshot.sessions);
      setSelectedSessionId((currentSessionId) => {
        if (snapshot.sessions.some((session) => session.id === currentSessionId)) {
          return currentSessionId;
        }

        return snapshot.sessions[0]?.id ?? '';
      });
    } catch {
      setConnectionState('error');
    }
  }

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
    const initialQuery = formatSubtitleSearchQuery(selectedSession);

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

    setIsLanguageMenuOpen(false);
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
    setOffsetInputValue((nextOffsetMs / 1000).toFixed(1));
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
      setOffsetInputValue((subtitleOffsetMs / 1000).toFixed(1));
      return;
    }

    setSubtitleOffset(Math.round(parsedSeconds * 1000));
  }

  function updateOffsetInput(value: string): void {
    setOffsetInputValue(value);

    const parsedSeconds = Number(value);

    if (Number.isFinite(parsedSeconds)) {
      setSubtitleOffsetMs(Math.round(parsedSeconds * 1000));
    }
  }

  return (
    <main
      className={[
        'app-shell',
        resolvedTheme === 'dark' ? 'theme-dark' : 'theme-dim',
        isChromeVisible || isSettingsOpen || isSubtitleSearchOpen
          ? 'chrome-visible'
          : 'chrome-hidden',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="top-bar">
        <div className="sync-status-wrap">
          <div className="sync-status-pill" role="status" aria-live="polite">
            {syncStatusLabels[syncStatus]}
          </div>
          <div className="sync-status-popover" role="tooltip">
            <strong>Sync Status</strong>
            <dl>
              <div>
                <dt>In Sync</dt>
                <dd>Normal playback. No correction currently being applied.</dd>
              </div>
              <div>
                <dt>Adjusting...</dt>
                <dd>A small sync correction is being applied while drift is smoothed.</dd>
              </div>
              <div>
                <dt>Resynced</dt>
                <dd>
                  Shown briefly after a seek, pause/resume, reconnect, session
                  change, or large drift correction.
                </dd>
              </div>
              <div>
                <dt>Disconnected</dt>
                <dd>No playback updates received recently, or the event stream is disconnected.</dd>
              </div>
            </dl>
          </div>
        </div>
        <label className="session-picker">
          <select
            aria-label="Jellyfin session"
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
        </label>
        <button
          className="refresh-button"
          type="button"
          onClick={() => {
            void refreshSessions();
          }}
        >
          <Icon name="refresh" />
        </button>
        <button
          aria-label="Open subtitle settings"
          className="settings-trigger"
          type="button"
          onClick={() => setIsSettingsOpen(true)}
        >
          <Icon name="menu" />
        </button>
      </header>

      <section
        className="subtitle-stage"
        aria-label="Subtitle preview"
        style={
          {
            '--subtitle-position': `${subtitlePositionValues[subtitlePosition]}%`,
            '--subtitle-scale': subtitleSizeScales[subtitleSize],
          } as CSSProperties
        }
      >
        <div className="subtitle-text" role="status" aria-live="polite">
          {subtitleText}
        </div>
      </section>

      <footer className="bottom-bar" aria-label="Subtitle actions">
        <button
          aria-label="Search subtitles"
          className="icon-action subtitle-search-trigger"
          type="button"
          onClick={openSubtitleSearch}
        >
          <Icon name="search" />
        </button>
        <label className="file-picker icon-file-picker">
          <input
            accept=".srt,application/x-subrip,text/plain"
            type="file"
            onChange={(event) => {
              void handleFileChange(event.target.files?.[0] ?? null);
            }}
          />
          <span aria-label="Upload SRT" role="button">
            <Icon name="upload" />
          </span>
        </label>
        <div className="bottom-timing-readout" aria-label="Playback timing">
          <span>Media {formatTime(currentTimeMs)}</span>
          <span>Subs {formatTime(adjustedSubtitleTimeMs)}</span>
        </div>
        <div className="bottom-offset-controls" aria-label="Timing offset">
          <button type="button" onClick={() => nudgeSubtitleOffset(-1000)}>
            -1s
          </button>
          <button type="button" onClick={() => nudgeSubtitleOffset(-500)}>
            -0.5s
          </button>
          <label className="offset-value">
            <input
              aria-label="Subtitle offset seconds"
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
          <button type="button" onClick={() => nudgeSubtitleOffset(500)}>
            +0.5s
          </button>
          <button type="button" onClick={() => nudgeSubtitleOffset(1000)}>
            +1s
          </button>
          <button
            aria-label="Reset subtitle offset"
            className="offset-reset-button"
            type="button"
            onClick={resetSubtitleOffset}
          >
            <Icon name="reset" />
          </button>
        </div>
        {error ? <p className="error-message">{error}</p> : null}
      </footer>

      {isSettingsOpen ? (
        <div
          className="settings-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsSettingsOpen(false);
            }
          }}
        >
          <aside
            aria-label="Subtitle settings"
            aria-modal="true"
            className="settings-panel"
            role="dialog"
          >
            <div className="modal-header">
              <h2>Subtitle Settings</h2>
              <button
                aria-label="Close subtitle settings"
                className="modal-close-button"
                type="button"
                onClick={() => setIsSettingsOpen(false)}
              >
                X
              </button>
            </div>

            <section className="settings-group">
              <h3>Size</h3>
              <div className="segmented-control">
                {(['small', 'medium', 'large', 'extra_large'] as const).map(
                  (size) => (
                    <button
                      className={subtitleSize === size ? 'selected' : ''}
                      key={size}
                      type="button"
                      onClick={() => setSubtitleSize(size)}
                    >
                      {size === 'extra_large' ? 'XL' : size[0].toUpperCase() + size.slice(1)}
                    </button>
                  ),
                )}
              </div>
            </section>

            <section className="settings-group">
              <h3>Position</h3>
              <div className="segmented-control">
                {(['top', 'center', 'bottom'] as const).map((position) => (
                  <button
                    className={subtitlePosition === position ? 'selected' : ''}
                    key={position}
                    type="button"
                    onClick={() => setSubtitlePosition(position)}
                  >
                    {position[0].toUpperCase() + position.slice(1)}
                  </button>
                ))}
              </div>
            </section>

            <section className="settings-group">
              <h3>Theme</h3>
              <div className="segmented-control">
                {(['dark', 'light', 'system'] as const).map((theme) => (
                  <button
                    className={themeMode === theme ? 'selected' : ''}
                    key={theme}
                    type="button"
                    onClick={() => setThemeMode(theme)}
                  >
                    {theme[0].toUpperCase() + theme.slice(1)}
                  </button>
                ))}
              </div>
            </section>

            <section className="settings-group meta-readout">
              <h3>Subtitle File</h3>
              <div>
                <span>{fileName}</span>
                <span>{cues.length} cues</span>
              </div>
            </section>

          </aside>
        </div>
      ) : null}

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
                  placeholder="Back to the Future"
                  type="search"
                  value={subtitleSearchQuery}
                  onChange={(event) => setSubtitleSearchQuery(event.target.value)}
                />
              </label>
              <label className="subtitle-search-field subtitle-language-field">
                <span>Language Code</span>
                <div className="subtitle-language-combobox">
                  <input
                    aria-autocomplete="list"
                    aria-controls="subtitle-language-menu"
                    aria-expanded={isLanguageMenuOpen}
                    className="subtitle-language-input"
                    inputMode="text"
                    maxLength={8}
                    placeholder="en"
                    role="combobox"
                    type="text"
                    value={subtitleSearchLanguage}
                    onBlur={() => {
                      window.setTimeout(() => setIsLanguageMenuOpen(false), 120);
                    }}
                    onChange={(event) => {
                      const nextLanguage = event.target.value
                        .replace(/\s/g, '')
                        .toLowerCase();

                      setSubtitleSearchLanguage(nextLanguage);
                      setSubtitleLanguageFilter(nextLanguage);
                      setIsLanguageMenuOpen(true);
                    }}
                    onClick={() => {
                      setSubtitleLanguageFilter('');
                      setIsLanguageMenuOpen(true);
                    }}
                    onFocus={() => {
                      setSubtitleLanguageFilter('');
                      setIsLanguageMenuOpen(true);
                    }}
                  />
                  {isLanguageMenuOpen ? (
                    <div
                      className="subtitle-language-menu"
                      id="subtitle-language-menu"
                      role="listbox"
                    >
                      {filteredSubtitleLanguages.length === 0 ? (
                        <div className="subtitle-language-empty">
                          No matching languages
                        </div>
                      ) : (
                        filteredSubtitleLanguages.map((language) => (
                          <button
                            className="subtitle-language-option"
                            key={language.code}
                            role="option"
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setSubtitleSearchLanguage(language.code);
                              setSubtitleLanguageFilter('');
                              setIsLanguageMenuOpen(false);
                            }}
                          >
                            <span>{language.name}</span>
                            <strong>{language.code}</strong>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </label>
              <button
                aria-label={
                  subtitleSearchState === 'searching'
                    ? 'Searching subtitles'
                    : 'Search subtitles'
                }
                className="subtitle-search-submit"
                disabled={
                  subtitleSearchState !== 'idle' || !subtitleSearchQuery.trim()
                }
                type="submit"
              >
                <Icon name="search" />
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
