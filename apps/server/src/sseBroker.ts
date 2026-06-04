import type { Response } from "express";

import type { PlaybackSnapshot } from "./playbackStore.js";

type SseClient = {
  id: number;
  response: Response;
};

export function createSseBroker(getSnapshot: () => PlaybackSnapshot) {
  const clients = new Map<number, SseClient>();
  let nextClientId = 1;

  function send(response: Response, event: string, data: unknown): void {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  return {
    connect(response: Response) {
      const id = nextClientId;
      nextClientId += 1;

      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no"
      });
      response.flushHeaders?.();

      clients.set(id, { id, response });
      send(response, "playback-snapshot", getSnapshot());

      response.on("close", () => {
        clients.delete(id);
      });
    },

    broadcastSnapshot() {
      const snapshot = getSnapshot();

      for (const client of clients.values()) {
        send(client.response, "playback-snapshot", snapshot);
      }
    },

    close() {
      for (const client of clients.values()) {
        client.response.end();
      }

      clients.clear();
    }
  };
}
