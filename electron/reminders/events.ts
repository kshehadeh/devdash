import { EventEmitter } from "events";

const emitter = new EventEmitter();

const CHANNEL_CHANGED = "reminders:changed";

export function emitRemindersChanged(): void {
  emitter.emit(CHANNEL_CHANGED);
}

export function onRemindersChanged(listener: () => void): () => void {
  emitter.on(CHANNEL_CHANGED, listener);
  return () => emitter.removeListener(CHANNEL_CHANGED, listener);
}
