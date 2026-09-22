import type { SyncStatus } from './syncClock';
import type { SubtitleCue } from './parseSrt';
import type {
  PlaybackSession,
  SubtitleLanguageOption,
  SubtitlePositionOption,
  SubtitleSizeOption,
} from './types';

export function normalizeSubtitleLanguages(
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

export const syncStatusLabels: Record<SyncStatus, string> = {
  adjusting: 'Adjusting...',
  disconnected: 'Disconnected',
  in_sync: 'In Sync',
  resynced: 'Resynced',
};

export const demoCues: SubtitleCue[] = [
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

export const subtitleSizeScales: Record<SubtitleSizeOption, number> = {
  small: 0.82,
  medium: 1,
  large: 1.22,
  extra_large: 1.48,
};

export const subtitlePositionValues: Record<SubtitlePositionOption, number> = {
  top: 28,
  center: 50,
  bottom: 72,
};

export const chromeIdleDelayMs = 2800;

export function formatTime(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((safeMs % 1000) / 100);

  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}

export function formatOffset(ms: number): string {
  const sign = ms > 0 ? '+' : '';
  return `${sign}${(ms / 1000).toFixed(1)}s`;
}

export function formatMetadataValue(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return new Intl.NumberFormat().format(value);
}

export function formatSeasonEpisode(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatEpisodeSearchQuery(session: PlaybackSession): string {
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

export function formatSubtitleSearchQuery(session: PlaybackSession | null): string {
  if (!session) {
    return '';
  }

  return session.itemType === 'Episode'
    ? formatEpisodeSearchQuery(session)
    : `${session.name}${session.productionYear ? ` ${session.productionYear}` : ''}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function selectSessionId(
  sessions: PlaybackSession[],
  currentSessionId: string,
): string {
  if (sessions.some((session) => session.id === currentSessionId)) {
    return currentSessionId;
  }

  return sessions[0]?.id ?? '';
}
