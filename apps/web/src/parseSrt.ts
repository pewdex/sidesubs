export type SubtitleCue = {
  id: number;
  startMs: number;
  endMs: number;
  text: string;
};

export function parseTimestamp(timestamp: string): number {
  const match = timestamp
    .trim()
    .match(/^(\d{1,2}):(\d{2}):(\d{2})(?:[,.](\d{1,3}))?$/);

  if (!match) {
    throw new Error(`Invalid SRT timestamp: ${timestamp}`);
  }

  const [, hours, minutes, seconds, milliseconds = '0'] = match;
  const paddedMilliseconds = milliseconds.padEnd(3, '0').slice(0, 3);

  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1000 +
    Number(paddedMilliseconds)
  );
}

export function parseSrt(contents: string): SubtitleCue[] {
  const blocks = contents
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const cues = blocks.flatMap((block, blockIndex) => {
    const lines = block.split('\n').map((line) => line.trimEnd());
    const timingLineIndex = lines.findIndex((line) => line.includes('-->'));

    if (timingLineIndex === -1) {
      return [];
    }

    const [start, rawEnd] = lines[timingLineIndex]
      .split('-->')
      .map((part) => part.trim());
    const end = rawEnd.split(/\s+/)[0];
    const text = lines
      .slice(timingLineIndex + 1)
      .join('\n')
      .replace(/<\/?[^>]+>/g, '')
      .trim();

    if (!text) {
      return [];
    }

    return [
      {
        id: blockIndex + 1,
        startMs: parseTimestamp(start),
        endMs: parseTimestamp(end),
        text,
      },
    ];
  });

  if (cues.length === 0) {
    throw new Error('No playable subtitle cues were found in this SRT file.');
  }

  return cues.sort((a, b) => a.startMs - b.startMs);
}
