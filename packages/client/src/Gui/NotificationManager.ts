import { signal, animatedSignal } from "canvasengine";
import {
  isI18nMessageDescriptor,
  type I18nParams,
  type I18nText,
} from "@rpgjs/common";

export type NotificationType = "info" | "warn" | "error";

export interface NotificationPayload {
  message: I18nText;
  type?: NotificationType;
  icon?: string;
  time?: number;
  sound?: string;
}

export interface NotificationItem extends Omit<NotificationPayload, "message"> {
  id: number;
  message: string;
  opacity: any;
  offset: any;
  layoutY: any;
  removing: boolean;
}

export interface NotificationTranslationEngine {
  t?: (key: string, params?: I18nParams) => string;
  playSound?: (id: string) => void;
}

export function resolveNotificationMessage(
  message: I18nText,
  engine?: NotificationTranslationEngine
): string {
  if (typeof message === "string") return message;
  if (!isI18nMessageDescriptor(message)) return "";
  return engine?.t?.(message.key, message.params) ?? message.key;
}

const DEFAULT_DURATION = 220;

export class NotificationManager {
  stack = signal<NotificationItem[]>([]);
  private _counter = 0;

  add(payload: NotificationPayload, engine?: NotificationTranslationEngine) {
    const id = ++this._counter;
    const opacity = animatedSignal(0, { duration: DEFAULT_DURATION });
    const offset = animatedSignal(12, { duration: DEFAULT_DURATION });
    const layoutY = animatedSignal(0, { duration: DEFAULT_DURATION });
    const item: NotificationItem = {
      id,
      message: resolveNotificationMessage(payload.message, engine),
      type: payload.type || "info",
      icon: payload.icon,
      time: payload.time,
      sound: payload.sound,
      opacity,
      offset,
      layoutY,
      removing: false,
    };
    this.stack.update((list) => [...list, item]);
    opacity.set(1);
    offset.set(0);

    if (payload.sound && engine?.playSound) {
      engine.playSound(payload.sound);
    }

    const delay = typeof payload.time === "number" ? payload.time : 2000;
    setTimeout(() => {
      this.remove(id);
    }, delay);
  }

  remove(id: number) {
    const list = this.stack();
    const item = list.find((it) => it.id === id);
    if (!item || item.removing) return;
    item.removing = true;
    item.opacity.set(0);
    item.offset.set(-8);
    setTimeout(() => {
      this.stack.update((items) => items.filter((it) => it.id !== id));
    }, DEFAULT_DURATION);
  }
}
