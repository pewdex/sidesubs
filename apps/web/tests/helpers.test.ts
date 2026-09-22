import { describe, expect, it } from 'vitest';
import {
  clamp,
  formatEpisodeSearchQuery,
  formatMetadataValue,
  formatOffset,
  formatSubtitleSearchQuery,
  formatTime,
  normalizeSubtitleLanguages,
  selectSessionId,
} from '../src/helpers';
import type { PlaybackSession } from '../src/types';

function session(
  overrides: Partial<PlaybackSession> = {},
): PlaybackSession {
  return {
    id: 'session-1',
    itemId: 'item-1',
    name: 'Movie Title',
    playbackRate: 1,
    positionMs: 0,
    sessionId: 'jf-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isPaused: false,
    ...overrides,
  };
}

describe('formatTime', () => {
  it('formats minutes, seconds, and tenths', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(1_500)).toBe('0:01.5');
    expect(formatTime(61_230)).toBe('1:01.2');
  });
});

describe('formatOffset', () => {
  it('includes a plus sign for positive offsets', () => {
    expect(formatOffset(1500)).toBe('+1.5s');
    expect(formatOffset(-500)).toBe('-0.5s');
    expect(formatOffset(0)).toBe('0.0s');
  });
});

describe('formatMetadataValue', () => {
  it('returns null for missing values', () => {
    expect(formatMetadataValue(null)).toBeNull();
    expect(formatMetadataValue(1234)).toBe(new Intl.NumberFormat().format(1234));
  });
});

describe('formatSubtitleSearchQuery', () => {
  it('returns an empty string without a session', () => {
    expect(formatSubtitleSearchQuery(null)).toBe('');
  });

  it('uses the movie title and year', () => {
    expect(
      formatSubtitleSearchQuery(
        session({ name: 'Back to the Future', productionYear: 1985 }),
      ),
    ).toBe('Back to the Future 1985');
  });

  it('formats TV episodes with series, year, season, and episode', () => {
    expect(
      formatEpisodeSearchQuery(
        session({
          itemType: 'Episode',
          name: 'Pilot',
          seriesName: 'Show',
          productionYear: 2020,
          seasonNumber: 2,
          episodeNumber: 3,
        }),
      ),
    ).toBe('Show 2020 S02E03');

    expect(
      formatSubtitleSearchQuery(
        session({
          itemType: 'Episode',
          name: 'Pilot',
          seriesName: 'Show',
          productionYear: 2020,
          seasonNumber: 2,
          episodeNumber: 3,
        }),
      ),
    ).toBe('Show 2020 S02E03');
  });
});

describe('normalizeSubtitleLanguages', () => {
  it('keeps valid language entries and drops junk', () => {
    expect(
      normalizeSubtitleLanguages([
        { code: ' EN ', name: ' English ' },
        { code: '', name: 'Empty' },
        { not: 'a language' },
      ]),
    ).toEqual([{ code: 'en', name: 'English' }]);
  });
});

describe('clamp and selectSessionId', () => {
  it('clamps to the given range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it('keeps the current session when it is still present', () => {
    const sessions = [session({ id: 'a' }), session({ id: 'b' })];
    expect(selectSessionId(sessions, 'b')).toBe('b');
    expect(selectSessionId(sessions, 'missing')).toBe('a');
    expect(selectSessionId([], 'a')).toBe('');
  });
});
