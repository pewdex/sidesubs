# sidesubs

Jellyfin sidecar subtitle app for showing synced subtitles on a second screen.

The backend talks to Jellyfin, tracks active playback sessions in memory, and streams playback snapshots to browser clients with Server-Sent Events. The frontend renders uploaded or OpenSubtitles-downloaded SRT subtitles locally in the browser using the selected Jellyfin session's playback position.

## Project Layout

```text
apps/
  server/  Express API, Jellyfin websocket/session tracking, SSE, static frontend
  web/     React + Vite SRT subtitle display
```

The two apps are maintained as npm workspaces. Docker builds both and runs one container where the backend serves the built frontend.

## Configuration

Copy `.env.example` to `.env` and set:

```sh
JELLYFIN_BASE_URL=http://your-jellyfin-host:8096
JELLYFIN_ACCESS_TOKEN=your-token
```

`JELLYFIN_ACCESS_TOKEN` can be a Jellyfin user access token or API key. User access tokens may expose richer session data for some WebSocket messages.

Optional variables:

```sh
JELLYFIN_DEVICE_ID=sidesubs-docker
JELLYFIN_DEVICE_NAME=sidesubs
JELLYFIN_CLIENT_NAME=sidesubs
JELLYFIN_CLIENT_VERSION=0.1.0
JELLYFIN_SESSION_POLL_INTERVAL_MS=5000
JELLYFIN_SUBSCRIPTION_INTERVAL_MS=1000
LOG_LEVEL=info
PORT=3000
OPENSUBTITLES_API_KEY=your-opensubtitles-api-key
OPENSUBTITLES_ACCESS_TOKEN=optional-bearer-token
OPENSUBTITLES_USERNAME=optional-opensubtitles-username
OPENSUBTITLES_PASSWORD=optional-opensubtitles-password
OPENSUBTITLES_BASE_URL=https://api.opensubtitles.com/api/v1
OPENSUBTITLES_USER_AGENT=sidesubs v0.1.0
```

Set `LOG_LEVEL=debug` only when you want extra websocket keepalive/subscription details.
`OPENSUBTITLES_API_KEY` is required only for the Search Subtitles modal. If it is missing, the app still starts and manual SRT upload still works.
For downloads that require login, set either `OPENSUBTITLES_ACCESS_TOKEN` or `OPENSUBTITLES_USERNAME` and `OPENSUBTITLES_PASSWORD`; login happens in memory on the backend.

## Local Development

Install all workspace dependencies from the repo root:

```sh
npm install
```

Run the Jellyfin WebSocket/static server:

```sh
npm run dev:server
```

Run the React + Vite frontend during UI development:

```sh
npm run dev:web
```

The frontend can load `.srt` subtitle files from the file picker, search OpenSubtitles, select an active Jellyfin playback session, and render subtitles against that session's playback position.
Search results show OpenSubtitles poster images when available. The browser loads those through the backend cover proxy, so the frontend still does not talk directly to OpenSubtitles.

The server exposes active Jellyfin playback sessions at:

```sh
GET /api/playback-sessions
```

The frontend receives live playback updates from:

```sh
GET /api/playback-events
```

`/api/playing-movies` is still available as a compatibility endpoint.

Subtitle search endpoints:

```sh
GET /api/subtitles/search?query=Movie%20Title&language=en
POST /api/subtitles/download
GET /api/subtitles/cover?url=https%3A%2F%2F...
```

Build both apps:

```sh
npm run build
```

## Docker

```sh
docker compose up --build
```

The container logs high-level playback/session activity and serves the subtitle frontend at `http://localhost:3000`.
