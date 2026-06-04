export type PlaybackSession = {
  id: string;
  itemId: string;
  itemType?: string | null;
  name: string;
  playMethod?: string | null;
  positionMs: number;
  productionYear?: number | null;
  runtimeMs?: number | null;
  sessionId: string;
  updatedAt: string;
  userId?: string | null;
  userName?: string | null;
  isPaused: boolean;
};

type JellyfinNowPlayingItem = {
  Id?: string;
  Name?: string;
  ProductionYear?: number | null;
  RunTimeTicks?: number | null;
  Type?: string;
};

export type JellyfinSession = {
  Id?: string;
  NowPlayingItem?: JellyfinNowPlayingItem | null;
  PlayState?: {
    IsPaused?: boolean;
    PlayMethod?: string | null;
    PositionTicks?: number | null;
  } | null;
  UserId?: string | null;
  UserName?: string | null;
};

type TrackedPlaybackSession = Omit<PlaybackSession, "positionMs" | "updatedAt"> & {
  lastKnownPositionMs: number;
  updatedAtMs: number;
};

export type PlaybackSnapshot = {
  lastUpdatedAt: string | null;
  sessions: PlaybackSession[];
};

const ticksPerMillisecond = 10_000;

function ticksToMs(ticks?: number | null): number {
  return Math.max(0, Math.floor((ticks ?? 0) / ticksPerMillisecond));
}

function clampPosition(positionMs: number, runtimeMs?: number | null): number {
  if (!runtimeMs || runtimeMs <= 0) {
    return Math.max(0, positionMs);
  }

  return Math.min(Math.max(0, positionMs), runtimeMs);
}

function toTrackedSession(
  session: JellyfinSession,
  updatedAtMs: number
): TrackedPlaybackSession | null {
  const item = session.NowPlayingItem;

  if (!session.Id || !item?.Id || !item.Name) {
    return null;
  }

  return {
    id: `${session.Id}:${item.Id}`,
    itemId: item.Id,
    itemType: item.Type ?? null,
    name: item.Name,
    playMethod: session.PlayState?.PlayMethod ?? null,
    productionYear: item.ProductionYear ?? null,
    runtimeMs: item.RunTimeTicks ? ticksToMs(item.RunTimeTicks) : null,
    sessionId: session.Id,
    userId: session.UserId ?? null,
    userName: session.UserName ?? null,
    isPaused: session.PlayState?.IsPaused ?? false,
    lastKnownPositionMs: ticksToMs(session.PlayState?.PositionTicks),
    updatedAtMs
  };
}

function toPlaybackSession(
  session: TrackedPlaybackSession,
  nowMs: number
): PlaybackSession {
  const elapsedMs = session.isPaused ? 0 : nowMs - session.updatedAtMs;
  const positionMs = clampPosition(
    session.lastKnownPositionMs + elapsedMs,
    session.runtimeMs
  );
  const { lastKnownPositionMs: _lastKnownPositionMs, updatedAtMs: _updatedAtMs, ...publicSession } =
    session;

  return {
    ...publicSession,
    positionMs,
    updatedAt: new Date(nowMs).toISOString()
  };
}

export function createPlaybackStore() {
  let sessions = new Map<string, TrackedPlaybackSession>();
  let lastUpdatedAt: string | null = null;

  return {
    getSnapshot(nowMs = Date.now()): PlaybackSnapshot {
      return {
        lastUpdatedAt,
        sessions: [...sessions.values()].map((session) =>
          toPlaybackSession(session, nowMs)
        )
      };
    },

    updateFromJellyfinSessions(jellyfinSessions: JellyfinSession[]) {
      const updatedAtMs = Date.now();
      const nextSessions = new Map<string, TrackedPlaybackSession>();

      for (const jellyfinSession of jellyfinSessions) {
        const trackedSession = toTrackedSession(jellyfinSession, updatedAtMs);

        if (trackedSession) {
          nextSessions.set(trackedSession.id, trackedSession);
        }
      }

      sessions = nextSessions;
      lastUpdatedAt = new Date(updatedAtMs).toISOString();
    }
  };
}
