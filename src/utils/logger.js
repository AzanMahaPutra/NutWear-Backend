const env = require("../config/env");

/**
 * Logger sederhana reusable — mengeluarkan JSON terstruktur di production
 * (gampang diparsing oleh log aggregator seperti CloudWatch/Datadog), dan
 * format lebih mudah dibaca manusia saat development.
 */
function log(level, message, meta = {}) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  if (env.nodeEnv === "production") {
    console.log(JSON.stringify(entry));
  } else {
    console.log(`[${entry.timestamp}] [${level.toUpperCase()}] ${message}`, meta && Object.keys(meta).length ? meta : "");
  }
}

module.exports = {
  info: (message, meta) => log("info", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  error: (message, meta) => log("error", message, meta),
};
