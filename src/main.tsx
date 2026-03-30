import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./globals.css";

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

function getCircularReplacer() {
  const seen = new WeakSet<object>();
  return (_key: string, value: unknown) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  };
}

function formatConsoleArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.stack ?? arg.message;
  try {
    return JSON.stringify(arg, getCircularReplacer());
  } catch {
    return String(arg);
  }
}

function formatConsoleArgs(args: unknown[]): string {
  return args.map((arg) => formatConsoleArg(arg)).join(" ");
}

function forwardConsoleLog(level: "log" | "warn" | "error", args: unknown[]) {
  if (!window.electron?.sendConsoleLog) return;
  const message = formatConsoleArgs(args);
  window.electron.sendConsoleLog({ level, source: "renderer", message });
}

console.log = (...args: unknown[]) => {
  originalConsole.log(...args);
  forwardConsoleLog("log", args);
};

console.warn = (...args: unknown[]) => {
  originalConsole.warn(...args);
  forwardConsoleLog("warn", args);
};

console.error = (...args: unknown[]) => {
  originalConsole.error(...args);
  forwardConsoleLog("error", args);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
