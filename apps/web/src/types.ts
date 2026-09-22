export type PlaybackSession = {
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

export type PlaybackSnapshot = {
  lastUpdatedAt: string | null;
  sessions: PlaybackSession[];
};

export type SubtitleSearchResult = {
  coverUrl: string | null;
  id: string;
  fileId: number;
  title: string;
  language: string | null;
  releaseName: string | null;
  downloadCount: number | null;
  rating: number | null;
};

export type SubtitleSearchState = 'idle' | 'searching' | 'downloading';
export type SubtitleSizeOption = 'small' | 'medium' | 'large' | 'extra_large';
export type SubtitlePositionOption = 'top' | 'center' | 'bottom';
export type ThemeMode = 'dark' | 'light' | 'system';
export type IconName = 'menu' | 'refresh' | 'reset' | 'search' | 'upload';
export type SubtitleLanguageOption = {
  code: string;
  name: string;
};
export type ConnectionState = 'connecting' | 'connected' | 'error';
export type ScreenWakeLockSentinel = EventTarget & {
  released: boolean;
  release: () => Promise<void>;
};
export type ScreenWakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<ScreenWakeLockSentinel>;
  };
};
