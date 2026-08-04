import { config } from "../config/index.js";

// Logger minimalista com níveis e cores ANSI (sem dependências externas).
const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof levels;

const threshold = levels[config.LOG_LEVEL as Level];

const color = {
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
};

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(level: Level, paint: (s: string) => string, ...args: unknown[]) {
  if (levels[level] < threshold) return;
  const tag = paint(`[${level.toUpperCase()}]`);
  console.error(color.gray(ts()), tag, ...args);
}

export const logger = {
  debug: (...a: unknown[]) => log("debug", color.gray, ...a),
  info: (...a: unknown[]) => log("info", color.blue, ...a),
  warn: (...a: unknown[]) => log("warn", color.yellow, ...a),
  error: (...a: unknown[]) => log("error", color.red, ...a),
  success: (...a: unknown[]) => log("info", color.green, ...a),
};
