import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { parseSrt, type SubtitleCue } from './parseSrt';
import {
  clamp,
  demoCues,
  formatTime,
  subtitlePositionValues,
  subtitleSizeScales,
  syncStatusLabels,
} from './helpers';
import { Icon } from './Icon';
import { SettingsPanel } from './SettingsPanel';
import { SubtitleSearchModal } from './SubtitleSearchModal';
import { useChromeIdle } from './useChromeIdle';
import { usePlaybackSession } from './usePlaybackSession';
import { usePrefersDarkTheme } from './usePrefersDarkTheme';
import { useSubtitleSearch } from './useSubtitleSearch';
import { useWakeLock } from './useWakeLock';
import type {
  SubtitlePositionOption,
  SubtitleSizeOption,
  ThemeMode,
} from './types';

export function App() {
  const [cues, setCues] = useState<SubtitleCue[]>(demoCues);
  const [fileName, setFileName] = useState<string>('Demo subtitles');
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState(0);
  const [offsetInputValue, setOffsetInputValue] = useState('0.0');
  const [subtitleSize, setSubtitleSize] =
    useState<SubtitleSizeOption>('medium');
  const [subtitlePosition, setSubtitlePosition] =
    useState<SubtitlePositionOption>('center');
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefersDarkTheme = usePrefersDarkTheme();
  const {
    connectionState,
    currentTimeMs,
    refreshSessions,
    selectedSession,
    selectedSessionId,
    sessions,
    setSelectedSessionId,
    syncStatus,
  } = usePlaybackSession();
  const loadSubtitleContents = useCallback((contents: string, name: string) => {
    try {
      const nextCues = parseSrt(contents);
      setCues(nextCues);
      setFileName(name);
      setSubtitleOffsetMs(0);
      setOffsetInputValue((0 / 1000).toFixed(1));
      setError(null);
    } catch (caughtError) {
      throw caughtError instanceof Error
        ? caughtError
        : new Error('Could not parse that SRT file.');
    }
  }, []);
  const subtitleSearch = useSubtitleSearch(
    selectedSession,
    loadSubtitleContents,
  );
  const isChromeVisible = useChromeIdle(
    isSettingsOpen,
    subtitleSearch.isSubtitleSearchOpen,
  );

  useWakeLock(selectedSession);

  const subtitleDurationMs = useMemo(
    () => cues.reduce((duration, cue) => Math.max(duration, cue.endMs), 0),
    [cues],
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
        isChromeVisible ||
        isSettingsOpen ||
        subtitleSearch.isSubtitleSearchOpen
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
          onClick={subtitleSearch.openSubtitleSearch}
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
        <SettingsPanel
          cuesCount={cues.length}
          fileName={fileName}
          onClose={() => setIsSettingsOpen(false)}
          onSubtitlePositionChange={setSubtitlePosition}
          onSubtitleSizeChange={setSubtitleSize}
          onThemeModeChange={setThemeMode}
          subtitlePosition={subtitlePosition}
          subtitleSize={subtitleSize}
          themeMode={themeMode}
        />
      ) : null}

      {subtitleSearch.isSubtitleSearchOpen ? (
        <SubtitleSearchModal
          filteredSubtitleLanguages={subtitleSearch.filteredSubtitleLanguages}
          isLanguageMenuOpen={subtitleSearch.isLanguageMenuOpen}
          onClose={subtitleSearch.closeSubtitleSearch}
          onDownload={(result) => {
            void subtitleSearch.downloadSubtitle(result);
          }}
          onLanguageChange={subtitleSearch.setSubtitleSearchLanguage}
          onLanguageFilterChange={subtitleSearch.setSubtitleLanguageFilter}
          onLanguageMenuOpenChange={subtitleSearch.setIsLanguageMenuOpen}
          onQueryChange={subtitleSearch.setSubtitleSearchQuery}
          onSearch={(query) => {
            void subtitleSearch.searchSubtitles(query);
          }}
          query={subtitleSearch.subtitleSearchQuery}
          searchError={subtitleSearch.subtitleSearchError}
          searchLanguage={subtitleSearch.subtitleSearchLanguage}
          searchResults={subtitleSearch.subtitleSearchResults}
          searchState={subtitleSearch.subtitleSearchState}
        />
      ) : null}
    </main>
  );
}
