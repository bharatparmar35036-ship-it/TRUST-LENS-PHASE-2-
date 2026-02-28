/* =====================================================
   LOGGER – Structured Backend Logging (v2)
   ===================================================== */

import winston from "winston";
import "winston-daily-rotate-file";

/* ---------------- LOG LEVEL ---------------- */

const level = process.env.LOG_LEVEL || "info";

/* ---------------- FORMAT ---------------- */

const logFormat = winston.format.printf(
  ({ level, message, timestamp }) => {
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }
);

/* ---------------- TRANSPORTS ---------------- */

const transports = [
  new winston.transports.Console({
    level,
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: "YYYY-MM-DD HH:mm:ss"
      }),
      logFormat
    )
  })
];

/* Optional file logging in production */
if (process.env.NODE_ENV === "production") {
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: "logs/trustlens-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "10m",
      maxFiles: "7d"
    })
  );
}

/* ---------------- LOGGER INSTANCE ---------------- */

const logger = winston.createLogger({
  level,
  transports
});

/* =====================================================
   EXPORT CLEAN METHODS
   ===================================================== */

export default {
  info: (msg) => logger.info(msg),
  warn: (msg) => logger.warn(msg),
  error: (msg) => logger.error(msg),
  debug: (msg) => logger.debug(msg)
};
