import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AppConfig = {
  jellyfin: {
    accessToken: string;
    baseUrl: string;
    clientName: string;
    clientVersion: string;
    deviceId: string;
    deviceName: string;
    sessionPollIntervalMs: number;
    subscriptionIntervalMs: number;
  };
  openSubtitles: {
    apiKey: string | null;
    baseUrl: string;
    userAgent: string;
    accessToken: string | null;
    password: string | null;
    username: string | null;
  };
  server: {
    port: number;
    webDistDir: string;
  };
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeBaseUrl(rawBaseUrl: string): string {
  try {
    const parsed = new URL(rawBaseUrl);
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`JELLYFIN_BASE_URL is not a valid URL: ${rawBaseUrl}`);
  }
}

function optionalEnv(name: string): string | null {
  return process.env[name]?.trim() || null;
}

function positiveNumberEnv(name: string, fallback: string): number {
  const value = Number(process.env[name]?.trim() || fallback);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }

  return value;
}

export function loadConfig(): AppConfig {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const defaultWebDistDir = path.resolve(moduleDir, "../../web/dist");

  return {
    jellyfin: {
      accessToken: requiredEnv("JELLYFIN_ACCESS_TOKEN"),
      baseUrl: normalizeBaseUrl(requiredEnv("JELLYFIN_BASE_URL")),
      clientName: process.env.JELLYFIN_CLIENT_NAME?.trim() || "sidesubs",
      clientVersion: process.env.JELLYFIN_CLIENT_VERSION?.trim() || "0.1.0",
      deviceId: process.env.JELLYFIN_DEVICE_ID?.trim() || randomUUID(),
      deviceName:
        process.env.JELLYFIN_DEVICE_NAME?.trim() || `sidesubs-${os.hostname()}`,
      sessionPollIntervalMs: positiveNumberEnv(
        "JELLYFIN_SESSION_POLL_INTERVAL_MS",
        "5000"
      ),
      subscriptionIntervalMs: positiveNumberEnv(
        "JELLYFIN_SUBSCRIPTION_INTERVAL_MS",
        "1000"
      )
    },
    openSubtitles: {
      accessToken: optionalEnv("OPENSUBTITLES_ACCESS_TOKEN"),
      apiKey: optionalEnv("OPENSUBTITLES_API_KEY"),
      baseUrl: normalizeBaseUrl(
        process.env.OPENSUBTITLES_BASE_URL?.trim() ||
          "https://api.opensubtitles.com/api/v1"
      ),
      password: optionalEnv("OPENSUBTITLES_PASSWORD"),
      userAgent:
        process.env.OPENSUBTITLES_USER_AGENT?.trim() || "sidesubs v0.1.0",
      username: optionalEnv("OPENSUBTITLES_USERNAME")
    },
    server: {
      port: positiveNumberEnv("PORT", "3000"),
      webDistDir: path.resolve(
        process.env.WEB_DIST_DIR?.trim() || defaultWebDistDir
      )
    }
  };
}
