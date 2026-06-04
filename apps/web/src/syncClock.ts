export type PlaybackAnchor = {
  itemId: string;
  isPaused: boolean;
  playbackRate: number;
  positionMs: number;
  runtimeMs?: number | null;
  sessionId: string;
  updatedAt: string;
};

export type SyncStatus = 'adjusting' | 'disconnected' | 'in_sync' | 'resynced';

type StoredPlaybackAnchor = PlaybackAnchor & {
  receivedAtMs: number;
};

type SyncClockState = {
  correctionStartedAtMs: number;
  correctionStartOffsetMs: number;
  correctionTargetOffsetMs: number;
  correctionDurationMs: number;
  forceDisconnected: boolean;
  lastAnchor: StoredPlaybackAnchor | null;
  resyncedUntilMs: number;
  sessionKey: string | null;
};

const ignoreDriftMs = 150;
const snapDriftMs = 1000;
const smoothCorrectionDurationMs = 700;
const staleUpdateMs = 4500;
const resyncedDisplayMs = 1600;
const visibleAdjustmentDriftMs = 500;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampPosition(positionMs: number, runtimeMs?: number | null): number {
  if (!runtimeMs || runtimeMs <= 0) {
    return Math.max(0, positionMs);
  }

  return clamp(positionMs, 0, runtimeMs);
}

function normalizePlaybackRate(rate: number | null | undefined): number {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    return 1;
  }

  return Math.min(Math.max(rate, 0.1), 8);
}

function anchorPositionAt(anchor: StoredPlaybackAnchor, nowMs: number): number {
  if (anchor.isPaused) {
    return clampPosition(anchor.positionMs, anchor.runtimeMs);
  }

  const elapsedMs =
    Math.max(0, nowMs - anchor.receivedAtMs) *
    normalizePlaybackRate(anchor.playbackRate);

  return clampPosition(anchor.positionMs + Math.max(0, elapsedMs), anchor.runtimeMs);
}

function correctionOffsetAt(state: SyncClockState, nowMs: number): number {
  if (state.correctionDurationMs <= 0) {
    return state.correctionTargetOffsetMs;
  }

  const progress = clamp(
    (nowMs - state.correctionStartedAtMs) / state.correctionDurationMs,
    0,
    1,
  );

  return (
    state.correctionStartOffsetMs +
    (state.correctionTargetOffsetMs - state.correctionStartOffsetMs) * progress
  );
}

export function createSyncClock() {
  const state: SyncClockState = {
    correctionStartedAtMs: performance.now(),
    correctionStartOffsetMs: 0,
    correctionTargetOffsetMs: 0,
    correctionDurationMs: 0,
    forceDisconnected: false,
    lastAnchor: null,
    resyncedUntilMs: 0,
    sessionKey: null,
  };

  function getPosition(nowMs = performance.now()): number {
    if (!state.lastAnchor) {
      return 0;
    }

    const anchorPositionMs = anchorPositionAt(state.lastAnchor, nowMs);
    const correctionOffsetMs = correctionOffsetAt(state, nowMs);

    return clampPosition(
      anchorPositionMs + correctionOffsetMs,
      state.lastAnchor.runtimeMs,
    );
  }

  function snapTo(anchor: PlaybackAnchor, sessionKey: string, receivedAtMs: number): void {
    state.lastAnchor = {
      ...anchor,
      playbackRate: normalizePlaybackRate(anchor.playbackRate),
      receivedAtMs,
    };
    state.sessionKey = sessionKey;
    state.correctionStartedAtMs = receivedAtMs;
    state.correctionStartOffsetMs = 0;
    state.correctionTargetOffsetMs = 0;
    state.correctionDurationMs = 0;
    state.forceDisconnected = false;
    state.resyncedUntilMs = receivedAtMs + resyncedDisplayMs;
  }

  function applyAnchor(anchor: PlaybackAnchor | null): void {
    const nowMs = performance.now();

    if (!anchor) {
      state.lastAnchor = null;
      state.sessionKey = null;
      state.correctionStartedAtMs = nowMs;
      state.correctionStartOffsetMs = 0;
      state.correctionTargetOffsetMs = 0;
      state.correctionDurationMs = 0;
      state.forceDisconnected = false;
      state.resyncedUntilMs = 0;
      return;
    }

    const receivedAtMs = nowMs;
    state.forceDisconnected = false;
    const sessionKey = `${anchor.sessionId}:${anchor.itemId}`;
    const storedAnchor: StoredPlaybackAnchor = {
      ...anchor,
      playbackRate: normalizePlaybackRate(anchor.playbackRate),
      receivedAtMs,
    };

    if (!state.lastAnchor || state.sessionKey !== sessionKey) {
      snapTo(anchor, sessionKey, receivedAtMs);
      return;
    }

    const wasPaused = state.lastAnchor.isPaused;
    const previousPlaybackRate = normalizePlaybackRate(state.lastAnchor.playbackRate);
    const currentPositionMs = getPosition(receivedAtMs);
    const targetPositionMs = clampPosition(anchor.positionMs, anchor.runtimeMs);
    const driftMs = targetPositionMs - currentPositionMs;
    const shouldSnap =
      wasPaused !== anchor.isPaused ||
      previousPlaybackRate !== storedAnchor.playbackRate ||
      Math.abs(driftMs) > snapDriftMs;

    if (shouldSnap) {
      state.lastAnchor = storedAnchor;
      state.sessionKey = sessionKey;
      state.correctionStartedAtMs = receivedAtMs;
      state.correctionStartOffsetMs = 0;
      state.correctionTargetOffsetMs = 0;
      state.correctionDurationMs = 0;
      state.forceDisconnected = false;
      return;
    }

    if (Math.abs(driftMs) < ignoreDriftMs) {
      state.lastAnchor = storedAnchor;
      state.sessionKey = sessionKey;
      return;
    }

    const currentRenderedPositionMs = currentPositionMs;
    const startingOffsetMs = currentRenderedPositionMs - targetPositionMs;

    state.lastAnchor = storedAnchor;
    state.sessionKey = sessionKey;
    state.correctionStartedAtMs = receivedAtMs;
    state.correctionStartOffsetMs = startingOffsetMs;
    state.correctionTargetOffsetMs = 0;
    state.correctionDurationMs = smoothCorrectionDurationMs;
  }

  function getStatus(nowMs = performance.now()): SyncStatus {
    if (!state.lastAnchor || state.forceDisconnected) {
      return 'disconnected';
    }

    if (nowMs - state.lastAnchor.receivedAtMs > staleUpdateMs) {
      return 'disconnected';
    }

    if (nowMs < state.resyncedUntilMs) {
      return 'resynced';
    }

    const correctionEndsAtMs =
      state.correctionStartedAtMs + state.correctionDurationMs;

    if (
      state.correctionDurationMs > 0 &&
      nowMs < correctionEndsAtMs &&
      Math.abs(state.correctionStartOffsetMs) >= visibleAdjustmentDriftMs
    ) {
      return 'adjusting';
    }

    return 'in_sync';
  }

  function markDisconnected(): void {
    state.forceDisconnected = true;
    state.resyncedUntilMs = 0;
  }

  function markResynced(): void {
    const nowMs = performance.now();
    state.resyncedUntilMs = nowMs + resyncedDisplayMs;
  }

  return {
    applyAnchor,
    getPosition,
    getStatus,
    markDisconnected,
    markResynced,
  };
}
