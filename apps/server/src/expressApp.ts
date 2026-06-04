import express from "express";
import path from "node:path";

import type { AppConfig } from "./config.js";
import {
  OpenSubtitlesError,
  downloadOpenSubtitles,
  fetchOpenSubtitlesCover,
  searchOpenSubtitles
} from "./openSubtitlesApi.js";
import type { createPlaybackStore } from "./playbackStore.js";
import type { createSseBroker } from "./sseBroker.js";

type PlaybackStore = ReturnType<typeof createPlaybackStore>;
type SseBroker = ReturnType<typeof createSseBroker>;

export function createExpressApp(
  config: AppConfig,
  playbackStore: PlaybackStore,
  sseBroker: SseBroker
) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

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

  app.get("/api/subtitles/search", async (request, response) => {
    try {
      const query = typeof request.query.query === "string" ? request.query.query : "";
      const language =
        typeof request.query.language === "string" ? request.query.language : null;
      const results = await searchOpenSubtitles(
        config.openSubtitles,
        query,
        language
      );

      response.json({
        results: results.map((result) => ({
          ...result,
          coverUrl: result.coverUrl
            ? `/api/subtitles/cover?url=${encodeURIComponent(result.coverUrl)}`
            : null
        }))
      });
    } catch (caughtError) {
      sendSubtitleError(response, caughtError);
    }
  });

  app.get("/api/subtitles/cover", async (request, response) => {
    try {
      const coverUrl = typeof request.query.url === "string" ? request.query.url : "";
      const cover = await fetchOpenSubtitlesCover(coverUrl);

      response.setHeader("Cache-Control", "public, max-age=3600");
      response.type(cover.contentType).send(cover.image);
    } catch (caughtError) {
      sendSubtitleError(response, caughtError);
    }
  });

  app.post("/api/subtitles/download", async (request, response) => {
    try {
      const fileId = Number(request.body?.fileId);
      const subtitle = await downloadOpenSubtitles(config.openSubtitles, fileId);

      response.json(subtitle);
    } catch (caughtError) {
      sendSubtitleError(response, caughtError);
    }
  });

  app.use(express.static(config.server.webDistDir));

  app.use((_request, response) => {
    response.sendFile(path.join(config.server.webDistDir, "index.html"));
  });

  return app;
}

function sendSubtitleError(response: express.Response, caughtError: unknown): void {
  if (caughtError instanceof OpenSubtitlesError) {
    response.status(caughtError.statusCode).json({
      code: caughtError.code,
      message: caughtError.message
    });
    return;
  }

  response.status(500).json({
    code: "subtitle_error",
    message: "Subtitle request failed."
  });
}
