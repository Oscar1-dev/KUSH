export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

const sensitiveKey = /token|secret|password|authorization|code|cookie/i;
// Discord bot tokens: three base64url segments separated by dots.
const tokenLike =
  /[A-Za-z\d_-]{23,28}\.[A-Za-z\d_-]{6,7}\.[A-Za-z\d_-]{27,40}/g;

export function redact(value: unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return "[redacted]";
  if (typeof value === "string") return value.replace(tokenLike, "[redacted]");
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, redact(item, name)]),
    );
  return value;
}

/** Structured JSON lines with secret redaction. Never logs message bodies. */
export function createLogger(
  write: (line: string, level: LogLevel) => void = (line, level) =>
    (level === "error" ? console.error : console.log)(line),
  now: () => Date = () => new Date(),
): Logger {
  const emit = (level: LogLevel, event: string, fields: LogFields = {}) =>
    write(
      JSON.stringify({
        time: now().toISOString(),
        level,
        event,
        ...(redact(fields) as LogFields),
      }),
      level,
    );
  return {
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
  };
}
