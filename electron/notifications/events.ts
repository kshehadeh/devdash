import { EventEmitter } from "events";

const emitter = new EventEmitter();

const CHANNEL_OPEN = "notifications:open";
const CHANNEL_CHANGED = "notifications:changed";

export function emitNotificationOpen(notificationId: string): void {
  emitter.emit(CHANNEL_OPEN, notificationId);
}

export function onNotificationOpen(listener: (notificationId: string) => void): () => void {
  emitter.on(CHANNEL_OPEN, listener);
  return () => emitter.removeListener(CHANNEL_OPEN, listener);
}

export function emitNotificationsChanged(): void {
  emitter.emit(CHANNEL_CHANGED);
}

export function onNotificationsChanged(listener: () => void): () => void {
  emitter.on(CHANNEL_CHANGED, listener);
  return () => emitter.removeListener(CHANNEL_CHANGED, listener);
}
