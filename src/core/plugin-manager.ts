import type { Mp3Plugin, PluginContext, Slot } from "./types";
import { WebAudioEngine } from "./audio-engine";
import { EventBusImpl } from "./event-bus";
import { CapabilityRegistryImpl } from "./capability-registry";
import type { PlaybackState, Track } from "./types";

/**
 * 插件管理器 / 内核引导。
 *
 * 负责:
 *  - 创建共享上下文 (bus, engine, capabilities, state)
 *  - 按顺序初始化所有已注册插件
 *  - 将插件渲染到对应 Slot 的 DOM 容器中
 *  - 在内核层维护播放列表与状态并广播事件
 */
export class PluginManager {
  private plugins: Mp3Plugin[] = [];
  private disposers: Map<string, (() => void)[]> = new Map();
  private slots: Map<Slot, HTMLElement> = new Map();
  private ctx: PluginContext;

  private tracks: Track[] = [];
  private state: PlaybackState = {
    currentId: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
  };

  constructor(root: HTMLElement) {
    const bus = new EventBusImpl();
    const capabilities = new CapabilityRegistryImpl();
    const engine = new WebAudioEngine(bus);

    this.ctx = {
      root,
      bus,
      engine,
      getState: () => ({ ...this.state }),
      capabilities,
      uid: () =>
        Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    };

    this.bindInternalHandlers();
  }

  // ── 内部事件桥接 ──────────────────────────────────────────

  private bindInternalHandlers(): void {
    const { bus, engine } = this.ctx;

    bus.on("playback:play", (track) => {
      this.state.currentId = track.id;
      engine.load(track.url);
      void engine.play();
      this.state.isPlaying = true;
      this.broadcastState();
    });

    bus.on("playback:pause", () => {
      engine.pause();
      this.state.isPlaying = false;
      this.broadcastState();
    });

    bus.on("playback:resume", () => {
      void engine.play();
      this.state.isPlaying = true;
      this.broadcastState();
    });

    bus.on("playback:stop", () => {
      engine.stop();
      this.state.isPlaying = false;
      this.broadcastState();
    });

    bus.on("playback:seek", (time) => {
      engine.seek(time);
    });

    bus.on("playback:next", () => {
      const idx = this.tracks.findIndex((t) => t.id === this.state.currentId);
      const next = this.tracks[idx + 1];
      if (next) bus.emit("playback:play", next);
    });

    bus.on("playback:prev", () => {
      const idx = this.tracks.findIndex((t) => t.id === this.state.currentId);
      const prev = this.tracks[idx - 1];
      if (prev) bus.emit("playback:play", prev);
    });

    bus.on("playback:ended", () => {
      bus.emit("playback:next", void 0);
    });

    bus.on("mixer:volume", (v) => {
      this.state.volume = v;
      engine.setVolume(v);
      this.broadcastState();
    });

    bus.on("mixer:mute", (muted) => {
      this.state.muted = muted;
      engine.setVolume(muted ? 0 : this.state.volume);
      this.broadcastState();
    });

    bus.on("playlist:add", (track) => {
      this.tracks.push(track);
      bus.emit("playlist:track-added", { index: this.tracks.length - 1, track });
    });

    bus.on("playlist:remove", (id) => {
      this.tracks = this.tracks.filter((t) => t.id !== id);
    });

    bus.on("playlist:clear", () => {
      this.tracks = [];
    });
  }

  private broadcastState(): void {
    this.ctx.bus.emit("playback:state", { ...this.state });
  }

  // ── 插件生命周期 ───────────────────────────────────────────

  register(plugin: Mp3Plugin): void {
    this.plugins.push(plugin);
  }

  getPlugins(): Mp3Plugin[] {
    return [...this.plugins];
  }

  async initAll(): Promise<void> {
    // 先创建所有 Slot 容器（由 App 渲染骨架）
    // 插件 init 在容器就绪后逐一调用
    for (const plugin of this.plugins) {
      await plugin.init?.(this.ctx);
      this.ctx.bus.emit("plugin:loaded", plugin.id);
    }
  }

  renderSlot(slot: Slot): HTMLElement | null {
    const container = this.slots.get(slot);
    if (!container) return null;

    // 清空容器
    container.innerHTML = "";

    const pluginsInSlot = this.plugins.filter((p) => p.slot === slot);
    for (const plugin of pluginsInSlot) {
      if (!plugin.render) continue;
      try {
        const el = plugin.render(this.ctx);
        el.classList.add("plugin-instance");
        el.dataset.pluginId = plugin.id;
        container.appendChild(el);
      } catch (err) {
        console.error(`[PluginManager] render failed for "${plugin.id}":`, err);
      }
    }
    return container;
  }

  setSlotElement(slot: Slot, el: HTMLElement): void {
    this.slots.set(slot, el);
  }

  destroyAll(): void {
    for (const plugin of this.plugins) {
      try {
        plugin.destroy?.();
      } catch (err) {
        console.error(`[PluginManager] destroy failed for "${plugin.id}":`, err);
      }
      this.ctx.bus.emit("plugin:unloaded", plugin.id);
    }
    this.plugins = [];
    this.disposers.clear();
  }

  get context(): PluginContext {
    return this.ctx;
  }

  getTracks(): Track[] {
    return [...this.tracks];
  }
}
