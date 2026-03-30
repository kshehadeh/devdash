import * as util from "util";

export type ConsoleLogLevel = "log" | "warn" | "error";
export type ConsoleLogSource = "main" | "renderer";

export interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  level: ConsoleLogLevel;
  source: ConsoleLogSource;
  message: string;
}

export interface ConsoleLogPayload {
  level: ConsoleLogLevel;
  source: ConsoleLogSource;
  message: string;
}

const MAX_LOG_ENTRIES = 1000;
const logBuffer: ConsoleLogEntry[] = [];
let logCounter = 0;
let logEmitter: ((entry: ConsoleLogEntry) => void) | null = null;
let consolePatched = false;

function addToBuffer(entry: ConsoleLogEntry) {
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.splice(0, logBuffer.length - MAX_LOG_ENTRIES);
  }
  if (logEmitter) {
    logEmitter(entry);
  }
}

function createEntry(level: ConsoleLogLevel, source: ConsoleLogSource, message: string): ConsoleLogEntry {
  logCounter += 1;
  return {
    id: `${Date.now()}-${logCounter}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
  };
}

function formatMessage(args: unknown[]): string {
  try {
    return util.format(...args);
  } catch {
    return args.map((arg) => String(arg)).join(" ");
  }
}

export function startMainConsoleCapture() {
  if (consolePatched) return;
  consolePatched = true;

  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  console.log = (...args: unknown[]) => {
    original.log(...args);
    addToBuffer(createEntry("log", "main", formatMessage(args)));
  };

  console.warn = (...args: unknown[]) => {
    original.warn(...args);
    addToBuffer(createEntry("warn", "main", formatMessage(args)));
  };

  console.error = (...args: unknown[]) => {
    original.error(...args);
    addToBuffer(createEntry("error", "main", formatMessage(args)));
  };
}

export function setConsoleLogEmitter(emitter: ((entry: ConsoleLogEntry) => void) | null) {
  logEmitter = emitter;
}

export function getConsoleLogs(): ConsoleLogEntry[] {
  return [...logBuffer];
}

export function clearConsoleLogs() {
  logBuffer.length = 0;
}

export function appendRendererConsoleLog(payload: ConsoleLogPayload) {
  if (!payload?.message) return;
  const level: ConsoleLogLevel = payload.level ?? "log";
  const source: ConsoleLogSource = "renderer";
  addToBuffer(createEntry(level, source, payload.message));
}
