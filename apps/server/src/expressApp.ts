import express from "express";
import path from "node:path";

import type { AppConfig } from "./config.js";
import type { createPlaybackStore } from "./playbackStore.js";
import type { createSseBroker } from "./sseBroker.js";

type PlaybackStore = ReturnType<typeof createPlaybackStore>;
type SseBroker = ReturnType<typeof createSseBroker>;

export function createExpressApp(
  config: AppConfig["server"],
  playbackStore: PlaybackStore,
  sseBroker: SseBroker
) {
  const app = express();

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/playback-sessions", (_request, response) => {
    response.json(playbackStore.getSnapshot());
  });

  app.get("/api/playing-movies", (_request, response) => {
    const snapshot = playbackStore.getSnapshot();

    response.json({
      lastUpdatedAt: snapshot.lastUpdatedAt,
      movies: snapshot.sessions.filter((session) => session.itemType === "Movie")
    });
  });

  app.get("/api/playback-events", (request, response) => {
    request.socket.setTimeout(0);
    sseBroker.connect(response);
  });

  app.use(express.static(config.webDistDir));

  app.use((_request, response) => {
    response.sendFile(path.join(config.webDistDir, "index.html"));
  });

  return app;
}
