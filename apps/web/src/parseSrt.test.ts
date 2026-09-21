import { describe, expect, it } from 'vitest';
import { parseSrt, parseTimestamp } from './parseSrt';

describe('parseTimestamp', () => {
  it('parses comma and dot millisecond separators', () => {
    expect(parseTimestamp('00:00:01,500')).toBe(1_500);
    expect(parseTimestamp('00:00:01.500')).toBe(1_500);
    expect(parseTimestamp('1:02:03,4')).toBe(3_723_400);
  });

  it('throws on invalid timestamps', () => {
    expect(() => parseTimestamp('not-a-time')).toThrow(/Invalid SRT timestamp/);
    expect(() => parseTimestamp('00:00')).toThrow(/Invalid SRT timestamp/);
  });
});

describe('parseSrt', () => {
  it('parses a valid multi-cue SRT with comma and dot ms', () => {
    const cues = parseSrt(`1
00:00:01,000 --> 00:00:02,000
Hello

2
00:00:03.500 --> 00:00:04.000
World
`);

    expect(cues).toEqual([
      { id: 1, startMs: 1_000, endMs: 2_000, text: 'Hello' },
      { id: 2, startMs: 3_500, endMs: 4_000, text: 'World' },
    ]);
  });

  it('strips simple HTML tags from cue text', () => {
    const cues = parseSrt(`1
00:00:00,000 --> 00:00:01,000
<i>Italic</i> and <b>bold</b>
`);

    expect(cues[0]?.text).toBe('Italic and bold');
  });

  it('throws when empty or when no cues are found', () => {
    expect(() => parseSrt('')).toThrow(/No playable subtitle cues/);
    expect(() => parseSrt('just some text\n\nno timings')).toThrow(
      /No playable subtitle cues/,
    );
  });

  it('sorts cues by startMs', () => {
    const cues = parseSrt(`1
00:00:05,000 --> 00:00:06,000
Second

2
00:00:01,000 --> 00:00:02,000
First
`);

    expect(cues.map((cue) => cue.text)).toEqual(['First', 'Second']);
    expect(cues[0]?.startMs).toBeLessThan(cues[1]!.startMs);
  });

  it('throws when a cue has an invalid timestamp', () => {
    expect(() =>
      parseSrt(`1
bad --> 00:00:01,000
Nope
`),
    ).toThrow(/Invalid SRT timestamp/);
  });
});
