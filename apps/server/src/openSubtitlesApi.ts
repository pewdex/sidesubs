import type { AppConfig } from "./config.js";

export type SubtitleSearchResult = {
  coverUrl: string | null;
  id: string;
  fileId: number;
  title: string;
  language: string | null;
  releaseName: string | null;
  downloadCount: number | null;
  rating: number | null;
};

export type DownloadedSubtitle = {
  fileName: string;
  content: string;
};

type OpenSubtitlesErrorCode =
  | "api_error"
  | "download_failed"
  | "missing_api_key"
  | "rate_limited";

export class OpenSubtitlesError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: OpenSubtitlesErrorCode
  ) {
    super(message);
  }
}

type OpenSubtitlesConfig = AppConfig["openSubtitles"];

let cachedAccessToken: string | null = null;

function getBaseHeaders(config: OpenSubtitlesConfig): HeadersInit {
  if (!config.apiKey) {
    throw new OpenSubtitlesError(
      "OpenSubtitles is not configured. Add OPENSUBTITLES_API_KEY to your .env file.",
      503,
      "missing_api_key"
    );
  }

  const headers: HeadersInit = {
    "Api-Key": config.apiKey,
    "Content-Type": "application/json",
    "User-Agent": config.userAgent
  };

  if (config.accessToken) {
    headers.Authorization = `Bearer ${config.accessToken}`;
  } else if (cachedAccessToken) {
    headers.Authorization = `Bearer ${cachedAccessToken}`;
  }

  return headers;
}

async function ensureAccessToken(config: OpenSubtitlesConfig): Promise<void> {
  if (config.accessToken || cachedAccessToken || !config.username || !config.password) {
    return;
  }

  const response = await fetch(`${config.baseUrl}/login`, {
    body: JSON.stringify({
      password: config.password,
      username: config.username
    }),
    headers: getBaseHeaders(config),
    method: "POST"
  });
  const payload = await readOpenSubtitlesJson<{ token?: unknown }>(
    response,
    "OpenSubtitles login failed."
  );
  const token = normalizeString(payload.token);

  if (!token) {
    throw new OpenSubtitlesError(
      "OpenSubtitles login did not return an access token.",
      502,
      "api_error"
    );
  }

  cachedAccessToken = token;
}

async function readOpenSubtitlesJson<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    // The API occasionally returns an empty or HTML error body.
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : fallbackMessage;

    throw new OpenSubtitlesError(
      response.status === 429
        ? "OpenSubtitles rate limit reached. Please try again later."
        : message,
      response.status === 429 ? 429 : 502,
      response.status === 429 ? "rate_limited" : "api_error"
    );
  }

  return payload as T;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapSearchResult(item: any): SubtitleSearchResult | null {
  const attributes = item?.attributes;
  const featureDetails = attributes?.feature_details;
  const firstRelatedLink = attributes?.related_links?.[0];
  const firstFile = attributes?.files?.[0];
  const fileId = normalizeNumber(firstFile?.file_id);

  if (!fileId) {
    return null;
  }

  const title =
    normalizeString(firstFile?.file_name) ||
    normalizeString(featureDetails?.title) ||
    normalizeString(attributes?.release) ||
    `Subtitle ${fileId}`;

  return {
    coverUrl:
      normalizeString(featureDetails?.img_url) ||
      normalizeString(firstRelatedLink?.img_url),
    downloadCount: normalizeNumber(attributes?.download_count),
    fileId,
    id: String(item?.id || fileId),
    language: normalizeString(attributes?.language),
    rating: normalizeNumber(attributes?.ratings),
    releaseName: normalizeString(attributes?.release),
    title
  };
}

function isAllowedCoverUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    (url.hostname.endsWith(".opensubtitles.com") ||
      url.hostname === "opensubtitles.com" ||
      url.hostname.endsWith(".osdb.link") ||
      url.hostname === "osdb.link")
  );
}

export async function searchOpenSubtitles(
  config: OpenSubtitlesConfig,
  query: string,
  languageCode: string | null
): Promise<SubtitleSearchResult[]> {
  const trimmedQuery = query.trim();
  const trimmedLanguageCode = languageCode?.trim().toLowerCase() || "";

  if (!trimmedQuery) {
    throw new OpenSubtitlesError("Enter a movie title to search.", 400, "api_error");
  }

  const url = new URL(`${config.baseUrl}/subtitles`);
  url.searchParams.set("query", trimmedQuery);
  url.searchParams.set("order_by", "download_count");
  url.searchParams.set("order_direction", "desc");

  if (trimmedLanguageCode) {
    url.searchParams.set("languages", trimmedLanguageCode);
  }

  const response = await fetch(url, {
    headers: getBaseHeaders(config)
  });
  const payload = await readOpenSubtitlesJson<{ data?: any[] }>(
    response,
    "OpenSubtitles search failed."
  );

  return (payload.data || [])
    .map(mapSearchResult)
    .filter((result): result is SubtitleSearchResult => result !== null);
}

export async function downloadOpenSubtitles(
  config: OpenSubtitlesConfig,
  fileId: number
): Promise<DownloadedSubtitle> {
  if (!Number.isInteger(fileId) || fileId <= 0) {
    throw new OpenSubtitlesError("Invalid subtitle file id.", 400, "api_error");
  }

  await ensureAccessToken(config);

  const response = await fetch(`${config.baseUrl}/download`, {
    body: JSON.stringify({
      file_id: fileId,
      sub_format: "srt"
    }),
    headers: getBaseHeaders(config),
    method: "POST"
  });
  const payload = await readOpenSubtitlesJson<{
    file_name?: unknown;
    link?: unknown;
  }>(response, "OpenSubtitles download failed.");
  const link = normalizeString(payload.link);

  if (!link) {
    throw new OpenSubtitlesError(
      "OpenSubtitles did not return a subtitle download link.",
      502,
      "download_failed"
    );
  }

  const subtitleResponse = await fetch(link);

  if (!subtitleResponse.ok) {
    throw new OpenSubtitlesError(
      "Could not download the selected subtitle file.",
      subtitleResponse.status === 429 ? 429 : 502,
      subtitleResponse.status === 429 ? "rate_limited" : "download_failed"
    );
  }

  const content = await subtitleResponse.text();

  return {
    content,
    fileName: normalizeString(payload.file_name) || `opensubtitles-${fileId}.srt`
  };
}

export async function fetchOpenSubtitlesCover(coverUrl: string): Promise<{
  contentType: string;
  image: Buffer;
}> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(coverUrl);
  } catch {
    throw new OpenSubtitlesError("Invalid cover image URL.", 400, "api_error");
  }

  if (!isAllowedCoverUrl(parsedUrl)) {
    throw new OpenSubtitlesError("Cover image host is not allowed.", 400, "api_error");
  }

  const response = await fetch(parsedUrl);

  if (!response.ok) {
    throw new OpenSubtitlesError(
      "Could not load the selected cover image.",
      response.status === 429 ? 429 : 502,
      response.status === 429 ? "rate_limited" : "download_failed"
    );
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";

  if (!contentType.startsWith("image/")) {
    throw new OpenSubtitlesError("Cover URL did not return an image.", 502, "api_error");
  }

  return {
    contentType,
    image: Buffer.from(await response.arrayBuffer())
  };
}
