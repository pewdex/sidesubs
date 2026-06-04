import "dotenv/config";

import { loadConfig } from "./config.js";
import { createExpressApp } from "./expressApp.js";
import { startJellyfinSessionPolling } from "./jellyfinApi.js";
import { startJellyfinSocket } from "./jellyfinSocket.js";
import { logger } from "./logger.js";
import { createPlaybackStore } from "./playbackStore.js";
import { createSseBroker } from "./sseBroker.js";

const config = loadConfig();
const playbackStore = createPlaybackStore();
const sseBroker = createSseBroker(() => playbackStore.getSnapshot());
let previousSessionSummary = "";
const updatePlaybackSessions = (sessions: Parameters<
  typeof playbackStore.updateFromJellyfinSessions
>[0]) => {
  playbackStore.updateFromJellyfinSessions(sessions);
  sseBroker.broadcastSnapshot();

  const snapshot = playbackStore.getSnapshot();
  const sessionSummary = snapshot.sessions
    .map((session) => `${session.sessionId}:${session.itemId}:${session.isPaused}`)
    .sort()
    .join("|");

  if (sessionSummary !== previousSessionSummary) {
    previousSessionSummary = sessionSummary;
    logger.info(`Tracked playback sessions updated (${snapshot.sessions.length})`, {
      sessions: snapshot.sessions.map((session) => ({
        itemType: session.itemType,
        name: session.name,
        paused: session.isPaused,
        sessionId: session.sessionId,
        userName: session.userName
      }))
    });
  }
};

const stopJellyfinSocket = startJellyfinSocket(
  config.jellyfin,
  updatePlaybackSessions
);
const stopSessionPolling = startJellyfinSessionPolling(
  config.jellyfin,
  updatePlaybackSessions
);
const playbackBroadcastInterval = setInterval(() => {
  sseBroker.broadcastSnapshot();
}, 1000);
const app = createExpressApp(config, playbackStore, sseBroker);
const server = app.listen(config.server.port, "0.0.0.0", () => {
  logger.info(`Serving subtitle frontend from ${config.server.webDistDir}`);
  logger.info(`Frontend listening on http://0.0.0.0:${config.server.port}`);
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info(`Received ${signal}; closing services`);
  stopJellyfinSocket();
  stopSessionPolling();
  clearInterval(playbackBroadcastInterval);
  sseBroker.close();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
