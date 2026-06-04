import type { AppConfig } from "./config.js";
import { logger } from "./logger.js";
import type { JellyfinSession } from "./playbackStore.js";

function jellyfinUrl(baseUrl: string, pathname: string): URL {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`);
  return url;
}

export async function fetchJellyfinSessions(
  config: AppConfig["jellyfin"]
): Promise<JellyfinSession[]> {
  const url = jellyfinUrl(config.baseUrl, "/Sessions");
  url.searchParams.set("api_key", config.accessToken);

  const response = await fetch(url, {
    headers: {
      "X-Emby-Token": config.accessToken
    }
  });

  if (!response.ok) {
    throw new Error(
      `Jellyfin sessions request failed with ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as unknown;

  if (!Array.isArray(data)) {
    throw new Error("Jellyfin sessions response was not an array");
  }

  return data as JellyfinSession[];
}

export function startJellyfinSessionPolling(
  config: AppConfig["jellyfin"],
  onSessions: (sessions: JellyfinSession[]) => void
): () => void {
  let stopped = false;
  let timeout: NodeJS.Timeout | undefined;

  async function poll(): Promise<void> {
    try {
      const sessions = await fetchJellyfinSessions(config);
      onSessions(sessions);
    } catch (error) {
      logger.error("Could not fetch Jellyfin sessions", error);
    } finally {
      if (!stopped) {
        timeout = setTimeout(poll, config.sessionPollIntervalMs);
      }
    }
  }

  void poll();

  return () => {
    stopped = true;

    if (timeout) {
      clearTimeout(timeout);
    }
  };
}
