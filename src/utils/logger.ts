import pino from "pino";

const level =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");
const service = process.env.SERVICE_NAME || "ai-finance-tracker-api";
const isProd =
  (process.env.NODE_ENV || "").toLowerCase() === "production" ||
  (process.env.BUN_ENV || "").toLowerCase() === "production";

let logger: pino.Logger;

try {
  if (!isProd) {
    const transport = pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    });
    logger = pino({ level, base: { service } }, transport);
  } else {
    logger = pino({ level, base: { service } });
  }
} catch {
  // Fallback if pretty transport isn't available
  logger = pino({ level, base: { service } });
}

export default logger;
