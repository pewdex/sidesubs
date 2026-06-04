import WebSocket from "ws";

import type { AppConfig } from "./config.js";
import { logger } from "./logger.js";
import type { JellyfinSession } from "./playbackStore.js";

type JellyfinInboundMessageType =
  | "ActivityLogEntryStart"
  | "ActivityLogEntryStop"
  | "KeepAlive"
  | "ScheduledTasksInfoStart"
  | "ScheduledTasksInfoStop"
  | "SessionsStart"
  | "SessionsStop";

type JellyfinOutboundMessage = {
  MessageType?: string;
  Data?: unknown;
  MessageId?: string;
};

type JellyfinInboundMessage = {
  MessageType: JellyfinInboundMessageType;
  Data?: string | null;
};

const subscriptionStartMessages = [
  "SessionsStart",
  "ActivityLogEntryStart",
  "ScheduledTasksInfoStart"
] as const satisfies readonly JellyfinInboundMessageType[];

function createSocketUrl(
  baseUrl: string,
  accessToken: string,
  deviceId: string
): string {
  const socketUrl = new URL(baseUrl);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
  socketUrl.pathname = `${socketUrl.pathname.replace(/\/+$/, "")}/socket`;
  socketUrl.search = "";
  socketUrl.searchParams.set("api_key", accessToken);
  socketUrl.searchParams.set("deviceId", deviceId);
  return socketUrl.toString();
}

function parseMessage(data: WebSocket.RawData): JellyfinOutboundMessage | string {
  const text = data.toString("utf8");

  try {
    return JSON.parse(text) as JellyfinOutboundMessage;
  } catch {
    return text;
  }
}

function sendJson(ws: WebSocket, message: JellyfinInboundMessage): void {
  ws.send(JSON.stringify(message));
}

function extractSessions(message: JellyfinOutboundMessage): JellyfinSession[] | null {
  if (message.MessageType !== "Sessions") {
    return null;
  }

  if (Array.isArray(message.Data)) {
    return message.Data as JellyfinSession[];
  }

  if (
    message.Data &&
    typeof message.Data === "object" &&
    "Sessions" in message.Data &&
    Array.isArray((message.Data as { Sessions?: unknown }).Sessions)
  ) {
    return (message.Data as { Sessions: JellyfinSession[] }).Sessions;
  }

  return null;
}

export function startJellyfinSocket(
  config: AppConfig["jellyfin"],
  onSessions?: (sessions: JellyfinSession[]) => void
): () => void {
  const socketUrl = createSocketUrl(
    config.baseUrl,
    config.accessToken,
    config.deviceId
  );

  let socket: WebSocket | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let reconnectAttempt = 0;
  let shuttingDown = false;

  function scheduleReconnect(): void {
    reconnectAttempt += 1;
    const delayMs = Math.min(30000, 1000 * 2 ** Math.min(reconnectAttempt, 5));
    logger.warn(`Jellyfin websocket reconnecting in ${delayMs}ms`);
    reconnectTimer = setTimeout(connect, delayMs);
  }

  function connect(): void {
    logger.info(`Connecting to Jellyfin websocket at ${config.baseUrl}`);

    socket = new WebSocket(socketUrl, {
      headers: {
        "X-Emby-Authorization": [
          `MediaBrowser Client="${config.clientName}"`,
          `Device="${config.deviceName}"`,
          `DeviceId="${config.deviceId}"`,
          `Version="${config.clientVersion}"`,
          `Token="${config.accessToken}"`
        ].join(", ")
      }
    });

    socket.on("open", () => {
      reconnectAttempt = 0;
      logger.info("Connected to Jellyfin websocket");

      for (const messageType of subscriptionStartMessages) {
        sendJson(socket as WebSocket, {
          MessageType: messageType,
          Data: `0,${config.subscriptionIntervalMs}`
        });
        logger.debug(`Sent ${messageType} subscription`);
      }
    });

    socket.on("message", (data) => {
      const message = parseMessage(data);

      if (typeof message !== "string") {
        const sessions = extractSessions(message);

        if (sessions) {
          onSessions?.(sessions);
        }
      }

      if (
        typeof message !== "string" &&
        message.MessageType === "ForceKeepAlive"
      ) {
        logger.debug("Received Jellyfin ForceKeepAlive");
        sendJson(socket as WebSocket, { MessageType: "KeepAlive" });
      }
    });

    socket.on("error", (error) => {
      logger.error("Jellyfin websocket error", error);
    });

    socket.on("close", (code, reason) => {
      const reasonText = reason.length ? ` ${reason.toString()}` : "";
      logger.warn(`Jellyfin websocket closed: ${code}${reasonText}`);

      if (!shuttingDown) {
        scheduleReconnect();
      }
    });
  }

  connect();

  return () => {
    shuttingDown = true;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    if (socket?.readyState === WebSocket.OPEN) {
      for (const messageType of subscriptionStartMessages) {
        sendJson(socket, {
          MessageType: messageType.replace(
            "Start",
            "Stop"
          ) as JellyfinInboundMessageType
        });
      }
    }

    socket?.close();
  };
}
