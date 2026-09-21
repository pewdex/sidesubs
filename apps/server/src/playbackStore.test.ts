import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPlaybackStore,
  type JellyfinSession,
} from './playbackStore.js';

function jellyfinSession(
  overrides: Partial<JellyfinSession> & {
    Id?: string;
    item?: NonNullable<JellyfinSession['NowPlayingItem']>;
  } = {},
): JellyfinSession {
  const { item, ...rest } = overrides;
  return {
    Id: 'sess-1',
    UserId: 'user-1',
    UserName: 'Pierrick',
    NowPlayingItem: {
      Id: 'item-1',
      Name: 'Episode One',
      Type: 'Episode',
      RunTimeTicks: 3_600_000_0000, // 1 hour in ticks (10_000 ticks/ms)
      SeriesName: 'Show',
      IndexNumber: 1,
      ParentIndexNumber: 1,
      ...item,
    },
    PlayState: {
      IsPaused: false,
      PlaybackRate: 1,
      PositionTicks: 10_000_000, // 1000ms
      PlayMethod: 'DirectPlay',
    },
    ...rest,
  };
}

describe('createPlaybackStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an empty snapshot initially', () => {
    const store = createPlaybackStore();
    expect(store.getSnapshot()).toEqual({
      lastUpdatedAt: null,
      sessions: [],
    });
  });

  it('maps a Jellyfin session to PlaybackSession (ticks→ms, rate clamp, pause)', () => {
    const store = createPlaybackStore();
    store.updateFromJellyfinSessions([
      jellyfinSession({
        PlayState: {
          IsPaused: true,
          PlaybackRate: 99,
          PositionTicks: 25_000_000, // 2500ms
          PlayMethod: 'Transcode',
        },
      }),
    ]);

    const snapshot = store.getSnapshot();
    expect(snapshot.lastUpdatedAt).toBe('2026-09-21T12:00:00.000Z');
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]).toMatchObject({
      id: 'sess-1:item-1',
      itemId: 'item-1',
      name: 'Episode One',
      sessionId: 'sess-1',
      positionMs: 2_500,
      playbackRate: 8,
      isPaused: true,
      runtimeMs: 3_600_000,
      userName: 'Pierrick',
    });
  });

  it('projects position forward when not paused between updates', () => {
    const store = createPlaybackStore();
    store.updateFromJellyfinSessions([
      jellyfinSession({
        PlayState: {
          IsPaused: false,
          PlaybackRate: 1,
          PositionTicks: 10_000_000, // 1000ms
        },
      }),
    ]);

    vi.advanceTimersByTime(2_000);
    const projected = store.getSnapshot();
    expect(projected.sessions[0]?.positionMs).toBe(3_000);
    expect(projected.sessions[0]?.isPaused).toBe(false);
  });

  it('does not project position forward while paused', () => {
    const store = createPlaybackStore();
    store.updateFromJellyfinSessions([
      jellyfinSession({
        PlayState: {
          IsPaused: true,
          PlaybackRate: 1,
          PositionTicks: 10_000_000,
        },
      }),
    ]);

    vi.advanceTimersByTime(5_000);
    expect(store.getSnapshot().sessions[0]?.positionMs).toBe(1_000);
  });

  it('drops sessions without NowPlayingItem', () => {
    const store = createPlaybackStore();
    store.updateFromJellyfinSessions([
      { Id: 'sess-empty', NowPlayingItem: null },
      jellyfinSession(),
    ]);

    expect(store.getSnapshot().sessions.map((s) => s.id)).toEqual([
      'sess-1:item-1',
    ]);
  });

  it('replaces the session set on update so gone sessions are removed', () => {
    const store = createPlaybackStore();
    store.updateFromJellyfinSessions([
      jellyfinSession(),
      jellyfinSession({
        Id: 'sess-2',
        item: { Id: 'item-2', Name: 'Other' },
        PlayState: {
          IsPaused: false,
          PlaybackRate: 1,
          PositionTicks: 0,
        },
      }),
    ]);

    expect(store.getSnapshot().sessions).toHaveLength(2);

    store.updateFromJellyfinSessions([jellyfinSession()]);
    const remaining = store.getSnapshot().sessions;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe('sess-1:item-1');
  });
});
