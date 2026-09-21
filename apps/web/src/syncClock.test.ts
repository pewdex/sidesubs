import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncClock, type PlaybackAnchor } from './syncClock';

function anchor(
  overrides: Partial<PlaybackAnchor> & Pick<PlaybackAnchor, 'positionMs'> = {
    positionMs: 0,
  },
): PlaybackAnchor {
  return {
    itemId: 'item-1',
    isPaused: false,
    playbackRate: 1,
    sessionId: 'session-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('createSyncClock', () => {
  let nowMs = 0;

  beforeEach(() => {
    nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** First apply snaps and shows "resynced" for 1600ms; wait it out before drift cases. */
  function applySettled(clock: ReturnType<typeof createSyncClock>, a: PlaybackAnchor) {
    clock.applyAnchor(a);
    nowMs += 1_600;
  }

  it('returns position 0 and disconnected with no anchor', () => {
    const clock = createSyncClock();

    expect(clock.getPosition(nowMs)).toBe(0);
    expect(clock.getStatus(nowMs)).toBe('disconnected');
  });

  it('advances position with elapsed time * playback rate while playing', () => {
    const clock = createSyncClock();
    clock.applyAnchor(anchor({ positionMs: 5_000, playbackRate: 2 }));

    nowMs += 250;
    expect(clock.getPosition(nowMs)).toBe(5_500);
    expect(clock.getStatus(nowMs)).toBe('resynced');
  });

  it('keeps position frozen while paused', () => {
    const clock = createSyncClock();
    clock.applyAnchor(anchor({ positionMs: 4_000, isPaused: true }));

    nowMs += 2_000;
    expect(clock.getPosition(nowMs)).toBe(4_000);
  });

  it('ignores small drift under 150ms without starting a correction', () => {
    const clock = createSyncClock();
    applySettled(clock, anchor({ positionMs: 1_000 }));
    // After 1600ms settled: projected position = 1000 + 1600 = 2600
    expect(clock.getStatus(nowMs)).toBe('in_sync');

    // Report 2680 → drift 80ms (< 150) relative to current ~2600
    clock.applyAnchor(anchor({ positionMs: 2_680 }));

    expect(clock.getPosition(nowMs)).toBe(2_680);
    expect(clock.getStatus(nowMs)).toBe('in_sync');
  });

  it('smoothly corrects medium drift between 150ms and 1000ms', () => {
    const clock = createSyncClock();
    applySettled(clock, anchor({ positionMs: 1_000 }));
    // Projected ~2600; report 2900 → drift 300ms
    clock.applyAnchor(anchor({ positionMs: 2_900 }));

    expect(clock.getPosition(nowMs)).toBe(2_600);
    expect(clock.getStatus(nowMs)).toBe('in_sync'); // |offset| 300 < 500 visible

    nowMs += 350; // halfway through 700ms correction
    // Anchor 2900+350=3250; offset halfway -300→0 = -150 → 3100
    expect(clock.getPosition(nowMs)).toBe(3_100);

    nowMs += 350; // correction complete
    expect(clock.getPosition(nowMs)).toBe(3_600);
    expect(clock.getStatus(nowMs)).toBe('in_sync');
  });

  it('reports adjusting when smooth correction start offset is large enough', () => {
    const clock = createSyncClock();
    applySettled(clock, anchor({ positionMs: 1_000 }));
    // Projected ~2600; report 3200 → drift 600ms (≥ 500 visible)
    clock.applyAnchor(anchor({ positionMs: 3_200 }));

    expect(clock.getStatus(nowMs)).toBe('adjusting');
    expect(clock.getPosition(nowMs)).toBe(2_600);
  });

  it('snaps when drift exceeds 1000ms', () => {
    const clock = createSyncClock();
    applySettled(clock, anchor({ positionMs: 1_000 }));
    clock.applyAnchor(anchor({ positionMs: 5_000 }));

    expect(clock.getPosition(nowMs)).toBe(5_000);
    expect(clock.getStatus(nowMs)).toBe('in_sync');
  });

  it('snaps when pause state changes', () => {
    const clock = createSyncClock();
    applySettled(clock, anchor({ positionMs: 2_000, isPaused: false }));
    // Projected ~3600
    clock.applyAnchor(anchor({ positionMs: 3_500, isPaused: true }));

    expect(clock.getPosition(nowMs)).toBe(3_500);
    nowMs += 1_000;
    expect(clock.getPosition(nowMs)).toBe(3_500);
  });

  it('snaps when playback rate changes', () => {
    const clock = createSyncClock();
    applySettled(clock, anchor({ positionMs: 1_000, playbackRate: 1 }));
    // Projected ~2600
    clock.applyAnchor(anchor({ positionMs: 2_600, playbackRate: 1.5 }));

    expect(clock.getPosition(nowMs)).toBe(2_600);
    nowMs += 200;
    expect(clock.getPosition(nowMs)).toBe(2_900);
  });

  it('reports disconnected after stale updates (>4500ms)', () => {
    const clock = createSyncClock();
    clock.applyAnchor(anchor({ positionMs: 500 }));

    nowMs += 4_501;
    expect(clock.getStatus(nowMs)).toBe('disconnected');
  });

  it('snaps and briefly reports resynced on session change', () => {
    const clock = createSyncClock();
    applySettled(clock, anchor({ positionMs: 1_000, sessionId: 'a', itemId: '1' }));
    expect(clock.getStatus(nowMs)).toBe('in_sync');

    clock.applyAnchor(
      anchor({ positionMs: 50, sessionId: 'b', itemId: '2' }),
    );

    expect(clock.getPosition(nowMs)).toBe(50);
    expect(clock.getStatus(nowMs)).toBe('resynced');

    nowMs += 1_600;
    expect(clock.getStatus(nowMs)).toBe('in_sync');
  });
});
