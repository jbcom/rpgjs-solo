import { signal, animatedSignal } from "canvasengine";

export type NotificationType = "info" | "warn" | "error";

export interface NotificationPayload {
  message: string;
  type?: NotificationType;
  icon?: string;
  time?: number;
  sound?: string;
}

export interface NotificationItem extends NotificationPayload {
  id: number;
  opacity: any;
  offset: any;
  layoutY: any;
  removing: boolean;
}

const DEFAULT_DURATION = 220;

export class NotificationManager {
  stack = signal<NotificationItem[]>([]);
  private _counter = 0;

  add(payload: NotificationPayload, engine?: { playSound?: (id: string) => void }) {
    const id = ++this._counter;
    const opacity = animatedSignal(0, { duration: DEFAULT_DURATION });
    const offset = animatedSignal(12, { duration: DEFAULT_DURATION });
    const layoutY = animatedSignal(0, { duration: DEFAULT_DURATION });
    const item: NotificationItem = {
      id,
      message: payload.message,
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
