type LogLevel = "debug" | "error" | "info" | "warn";

function write(level: LogLevel, message: string, details?: unknown): void {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;

  if (details === undefined) {
    console[level === "error" ? "error" : "log"](line);
    return;
  }

  console[level === "error" ? "error" : "log"](line, details);
}

export const logger = {
  debug(message: string, details?: unknown) {
    if (process.env.LOG_LEVEL === "debug") {
      write("debug", message, details);
    }
  },
  error(message: string, details?: unknown) {
    write("error", message, details);
  },
  info(message: string, details?: unknown) {
    write("info", message, details);
  },
  warn(message: string, details?: unknown) {
    write("warn", message, details);
  }
};
