export type PlaybackAnchor = {
  itemId: string;
  isPaused: boolean;
  positionMs: number;
  runtimeMs?: number | null;
  sessionId: string;
  updatedAt: string;
};

type SyncClockState = {
  correctionStartedAtMs: number;
  correctionStartOffsetMs: number;
  correctionTargetOffsetMs: number;
  correctionDurationMs: number;
  lastAnchor: PlaybackAnchor | null;
  sessionKey: string | null;
};

const ignoreDriftMs = 150;
const snapDriftMs = 1000;
const smoothCorrectionDurationMs = 700;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampPosition(positionMs: number, runtimeMs?: number | null): number {
  if (!runtimeMs || runtimeMs <= 0) {
    return Math.max(0, positionMs);
  }

  return clamp(positionMs, 0, runtimeMs);
}

function anchorPositionAt(anchor: PlaybackAnchor, nowMs: number): number {
  if (anchor.isPaused) {
    return clampPosition(anchor.positionMs, anchor.runtimeMs);
  }

  const anchorUpdatedAtMs = Date.parse(anchor.updatedAt);
  const elapsedMs = Number.isFinite(anchorUpdatedAtMs)
    ? nowMs - anchorUpdatedAtMs
    : 0;

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
    lastAnchor: null,
    sessionKey: null,
  };

  function getPosition(nowMs = performance.now()): number {
    if (!state.lastAnchor) {
      return 0;
    }

    const anchorPositionMs = anchorPositionAt(state.lastAnchor, Date.now());
    const correctionOffsetMs = correctionOffsetAt(state, nowMs);

    return clampPosition(
      anchorPositionMs + correctionOffsetMs,
      state.lastAnchor.runtimeMs,
    );
  }

  function snapTo(anchor: PlaybackAnchor, sessionKey: string): void {
    state.lastAnchor = anchor;
    state.sessionKey = sessionKey;
    state.correctionStartedAtMs = performance.now();
    state.correctionStartOffsetMs = 0;
    state.correctionTargetOffsetMs = 0;
    state.correctionDurationMs = 0;
  }

  function applyAnchor(anchor: PlaybackAnchor | null): void {
    if (!anchor) {
      state.lastAnchor = null;
      state.sessionKey = null;
      state.correctionStartedAtMs = performance.now();
      state.correctionStartOffsetMs = 0;
      state.correctionTargetOffsetMs = 0;
      state.correctionDurationMs = 0;
      return;
    }

    const sessionKey = `${anchor.sessionId}:${anchor.itemId}`;

    if (!state.lastAnchor || state.sessionKey !== sessionKey) {
      snapTo(anchor, sessionKey);
      return;
    }

    const wasPaused = state.lastAnchor.isPaused;
    const currentPositionMs = getPosition();
    const targetPositionMs = anchorPositionAt(anchor, Date.now());
    const driftMs = targetPositionMs - currentPositionMs;
    const shouldSnap =
      wasPaused !== anchor.isPaused || Math.abs(driftMs) > snapDriftMs;

    if (shouldSnap) {
      state.lastAnchor = anchor;
      state.sessionKey = sessionKey;
      state.correctionStartedAtMs = performance.now();
      state.correctionStartOffsetMs = 0;
      state.correctionTargetOffsetMs = 0;
      state.correctionDurationMs = 0;
      return;
    }

    if (Math.abs(driftMs) < ignoreDriftMs) {
      return;
    }

    const nowMs = performance.now();
    const currentRenderedPositionMs = currentPositionMs;
    const startingOffsetMs = currentRenderedPositionMs - targetPositionMs;

    state.lastAnchor = anchor;
    state.sessionKey = sessionKey;
    state.correctionStartedAtMs = nowMs;
    state.correctionStartOffsetMs = startingOffsetMs;
    state.correctionTargetOffsetMs = 0;
    state.correctionDurationMs = smoothCorrectionDurationMs;
  }

  return {
    applyAnchor,
    getPosition,
  };
}
