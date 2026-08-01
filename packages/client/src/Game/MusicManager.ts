import { signal } from "canvasengine";

export interface RpgMusicTransitionOptions {
  volume?: number;
  mapVolume?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  exitDelayMs?: number;
}

type MusicHost = {
  getSound(id: string): any | Promise<any>;
  createSound(src: string, options: { loop: boolean; volume: number }): any;
};

type PendingMusicTransition = {
  owner?: object;
  previousMapVolume: number;
  revision: number;
};

type MusicReleaseDebt = {
  owner?: object;
  restoreMap: boolean;
  sound: any;
  timers: Set<ReturnType<typeof setTimeout>>;
};

const clampVolume = (value: number) => Math.max(0, Math.min(1, value));
const audioExtensions = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
  "webm",
]);
const isSource = (value: string) => {
  const normalized = value.toLowerCase();
  if (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("/") ||
    normalized.startsWith("data:") ||
    normalized.startsWith("blob:")
  ) {
    return true;
  }

  const suffixStart = normalized.search(/[?#]/);
  const path = suffixStart === -1
    ? normalized
    : normalized.slice(0, suffixStart);
  const extensionStart = path.lastIndexOf(".");
  return extensionStart !== -1 &&
    audioExtensions.has(path.slice(extensionStart + 1));
};

/**
 * Controls temporary music layers without stopping map ambience or sound
 * effects. The map renderer consumes `mapVolume` reactively.
 */
export class RpgMusicManager {
  readonly mapVolume = signal(1);
  /** Optional owner key used by systems when several sources have equal priority. */
  contextId?: string;
  private currentId?: string;
  private currentSound?: any;
  private currentOwner?: object;
  private pendingTransition?: PendingMusicTransition;
  private readonly releaseDebts = new Map<any, MusicReleaseDebt>();
  private readonly sounds = new Map<string, any>();
  private revision = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly host: MusicHost) {}

  get overrideId(): string | undefined {
    return this.currentId;
  }

  /**
   * Starts a temporary music override. A stable owner token scopes later
   * `leave()` calls so one subsystem cannot release another subsystem's music.
   * Ownership transfers only after the requested source resolves; a failed
   * resolution restores the previous map mix and owner.
   *
   * @param id Registered sound id or supported audio source.
   * @param options Crossfade and volume settings.
   * @param owner Optional stable object identifying the calling subsystem.
   * @example
   * ```ts
   * const combatMusic = {};
   * await engine.music.enter("battle", { fadeInMs: 250 }, combatMusic);
   * engine.music.leave({ fadeOutMs: 250 }, combatMusic);
   * ```
   */
  async enter(
    id: string | undefined,
    options: RpgMusicTransitionOptions = {},
    owner?: object,
  ): Promise<void> {
    const revision = ++this.revision;
    this.clearTimers();
    const currentDebt = this.releaseDebts.get(this.currentSound);
    if (currentDebt && (!owner || currentDebt.owner === owner)) {
      this.cancelReleaseDebt(this.currentSound);
      if (owner) this.currentOwner = owner;
    }
    const transition: PendingMusicTransition = {
      owner,
      previousMapVolume:
        !this.currentOwner && this.releaseDebts.has(this.currentSound)
          ? 1
          : this.mapVolume(),
      revision,
    };
    this.pendingTransition = transition;
    const fadeInMs = Math.max(0, options.fadeInMs ?? 600);
    const fadeOutMs = Math.max(0, options.fadeOutMs ?? fadeInMs);
    const volume = clampVolume(options.volume ?? 0.8);
    const mapVolume = clampVolume(options.mapVolume ?? 0);

    this.tweenMapVolume(mapVolume, fadeInMs, revision);
    if (!id) {
      this.currentOwner = owner;
      this.pendingTransition = undefined;
      await this.fadeOutCurrent(fadeOutMs, revision);
      if (revision === this.revision) this.currentOwner = undefined;
      return;
    }
    if (id === this.currentId && this.currentSound) {
      this.cancelReleaseDebt(this.currentSound);
      this.currentOwner = owner;
      this.pendingTransition = undefined;
      this.fade(this.currentSound, this.readVolume(this.currentSound), volume, fadeInMs);
      return;
    }

    const previous = this.currentSound;
    let sound: any;
    try {
      sound = await this.resolve(id);
    } catch (error) {
      if (revision === this.revision) {
        this.pendingTransition = undefined;
        this.tweenMapVolume(transition.previousMapVolume, fadeOutMs, revision);
      }
      throw error;
    }
    if (revision !== this.revision) return;
    this.pendingTransition = undefined;
    if (!sound) {
      this.tweenMapVolume(transition.previousMapVolume, fadeOutMs, revision);
      return;
    }

    const reclaimedDebt = this.cancelReleaseDebt(sound);
    if (this.currentSound === sound || reclaimedDebt) {
      this.currentId = id;
      this.currentSound = sound;
      this.currentOwner = owner;
      this.setLoop(sound, true);
      this.fade(sound, this.readVolume(sound), volume, fadeInMs);
      if (previous && previous !== sound) {
        this.scheduleReleaseDebt(previous, {
          exitDelayMs: 0,
          fadeOutMs,
        });
      }
      return;
    }
    this.currentId = id;
    this.currentSound = sound;
    this.currentOwner = owner;
    this.setLoop(sound, true);
    this.setVolume(sound, 0);
    sound.play?.();
    this.fade(sound, 0, volume, fadeInMs);
    if (previous && previous !== sound) {
      this.scheduleReleaseDebt(previous, {
        exitDelayMs: 0,
        fadeOutMs,
      });
    }
  }

  /**
   * Releases a temporary override or cancels its pending resolution.
   * Passing the same token used by `enter()` makes the release owner-scoped.
   * Omitting the token preserves the legacy wildcard behavior and releases the
   * latest transition regardless of owner.
   *
   * @param options Exit delay, fade, and volume settings.
   * @param owner Optional stable owner token previously passed to `enter()`.
   * @example
   * ```ts
   * const cutsceneMusic = {};
   * await engine.music.enter("cutscene", {}, cutsceneMusic);
   * engine.music.leave({ exitDelayMs: 0 }, cutsceneMusic);
   * ```
   */
  leave(options: RpgMusicTransitionOptions = {}, owner?: object): void {
    const pending = this.pendingTransition;
    if (
      owner
      && pending
      && pending.owner !== owner
      && this.currentOwner === owner
    ) {
      const releasingSound = this.currentSound;
      this.currentOwner = undefined;
      pending.previousMapVolume = 1;
      this.scheduleReleaseDebt(releasingSound, options, owner, true);
      return;
    }
    if (owner) {
      const acceptedOwner = pending ? pending.owner : this.currentOwner;
      if (acceptedOwner !== owner) return;
    }
    const releasesPendingOnly = !!owner && !!pending && this.currentOwner !== owner;
    const revision = ++this.revision;
    this.pendingTransition = undefined;
    this.clearTimers();
    if (releasesPendingOnly) {
      const fadeOutMs = Math.max(0, options.fadeOutMs ?? 900);
      this.tweenMapVolume(pending.previousMapVolume, fadeOutMs, revision);
      return;
    }
    this.currentOwner = undefined;
    if (owner) {
      this.scheduleReleaseDebt(this.currentSound, options, owner, true);
      return;
    }
    this.cancelReleaseDebt(this.currentSound);
    this.scheduleLeave(options, revision);
  }

  reset(): void {
    this.revision += 1;
    this.clearTimers();
    this.clearReleaseDebts();
    this.currentSound?.stop?.();
    this.currentSound = undefined;
    this.currentId = undefined;
    this.currentOwner = undefined;
    this.pendingTransition = undefined;
    this.contextId = undefined;
    this.mapVolume.set(1);
  }

  private async resolve(id: string): Promise<any> {
    if (this.sounds.has(id)) return this.sounds.get(id);
    const value = isSource(id) ? { src: id } : await this.host.getSound(id);
    if (!value) return undefined;
    if (typeof value.play === "function") {
      this.sounds.set(id, value);
      return value;
    }
    const src = typeof value === "string" ? value : value.src ?? value.file;
    const sound = typeof src === "string"
      ? this.host.createSound(src, { loop: true, volume: 0 })
      : undefined;
    if (sound) this.sounds.set(id, sound);
    return sound;
  }

  private scheduleLeave(
    options: RpgMusicTransitionOptions,
    revision: number,
  ) {
    const delay = Math.max(0, options.exitDelayMs ?? 1500);
    this.schedule(() => {
      const fadeOutMs = Math.max(0, options.fadeOutMs ?? 900);
      this.tweenMapVolume(1, fadeOutMs, revision);
      void this.fadeOutCurrent(fadeOutMs, revision);
    }, delay, revision);
  }

  private scheduleReleaseDebt(
    sound: any,
    options: RpgMusicTransitionOptions,
    owner?: object,
    restoreMap = false,
  ) {
    if (!sound) return;
    this.cancelReleaseDebt(sound);
    const debt: MusicReleaseDebt = {
      owner,
      restoreMap,
      sound,
      timers: new Set(),
    };
    this.releaseDebts.set(sound, debt);
    const delay = Math.max(0, options.exitDelayMs ?? 1500);
    const startFade = () => {
      const fadeOutMs = Math.max(0, options.fadeOutMs ?? 900);
      if (
        debt.restoreMap
        && this.currentSound === sound
        && !this.currentOwner
        && !this.pendingTransition
      ) {
        this.tweenMapVolume(1, fadeOutMs, this.revision);
      }
      this.fade(sound, this.readVolume(sound), 0, fadeOutMs);
      this.scheduleDebtTimer(debt, () => {
        sound.stop?.();
        if (this.currentSound === sound && !this.currentOwner) {
          this.currentSound = undefined;
          this.currentId = undefined;
        }
        if (this.releaseDebts.get(sound) === debt) {
          this.releaseDebts.delete(sound);
        }
      }, fadeOutMs);
    };
    if (delay === 0) startFade();
    else this.scheduleDebtTimer(debt, startFade, delay);
  }

  private scheduleDebtTimer(
    debt: MusicReleaseDebt,
    callback: () => void,
    delay: number,
  ) {
    const timer = setTimeout(() => {
      debt.timers.delete(timer);
      callback();
    }, delay);
    debt.timers.add(timer);
  }

  private cancelReleaseDebt(sound: any) {
    const debt = this.releaseDebts.get(sound);
    if (!debt) return false;
    for (const timer of debt.timers) clearTimeout(timer);
    debt.timers.clear();
    this.releaseDebts.delete(sound);
    return true;
  }

  private clearReleaseDebts() {
    for (const sound of this.releaseDebts.keys()) {
      this.cancelReleaseDebt(sound);
      if (sound !== this.currentSound) sound.stop?.();
    }
  }

  private async fadeOutCurrent(duration: number, revision: number) {
    await this.fadeOutSound(this.currentSound, duration, revision);
  }

  private async fadeOutSound(sound: any, duration: number, revision: number) {
    if (!sound) return;
    this.fade(sound, this.readVolume(sound), 0, duration);
    this.schedule(() => {
      sound.stop?.();
      if (revision === this.revision && this.currentSound === sound) {
        this.currentSound = undefined;
        this.currentId = undefined;
        this.currentOwner = undefined;
      }
    }, duration, revision);
  }

  private fade(sound: any, from: number, to: number, duration: number) {
    if (duration > 0 && typeof sound.fade === "function") {
      sound.fade(from, to, duration);
    } else {
      this.setVolume(sound, to);
    }
  }

  private readVolume(sound: any): number {
    const value = sound?.volume?.();
    return typeof value === "number" ? value : 0;
  }

  private setVolume(sound: any, volume: number) {
    sound?.volume?.(clampVolume(volume));
  }

  private setLoop(sound: any, loop: boolean) {
    sound?.loop?.(loop);
  }

  private tweenMapVolume(target: number, duration: number, revision: number) {
    const start = this.mapVolume();
    if (duration === 0) {
      this.mapVolume.set(target);
      return;
    }
    const startedAt = Date.now();
    const step = () => {
      if (revision !== this.revision) return;
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      this.mapVolume.set(start + (target - start) * progress);
      if (progress < 1) this.schedule(step, 16, revision);
    };
    step();
  }

  private schedule(callback: () => void, delay: number, revision: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (revision === this.revision) callback();
    }, delay);
    this.timers.add(timer);
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }
}
