import type { Mp3Plugin, PluginContext } from "../core/types";
import { Slot } from "../core/types";

/**
 * 传输控制插件
 *
 * 提供: 上一首 / 播放·暂停 / 下一首 / 进度条·时间显示
 * 监听 playback:time 与 playback:state 来驱动 UI。
 */
export class TransportPlugin implements Mp3Plugin {
  id = "core.transport";
  name = "传输控制";
  version = "1.0.0";
  author = "OurMP3";
  description = "播放/暂停/上一首/下一首与进度条";
  slot = Slot.Transport;
  icon = "▶";
  defaultEnabled = true;

  private ctx!: PluginContext;
  private playBtn!: HTMLButtonElement;
  private progress!: HTMLInputElement;
  private currentLabel!: HTMLElement;
  private durationLabel!: HTMLElement;
  private state: { isPlaying: boolean; currentId: string | null; currentTime: number; duration: number } = {
    isPlaying: false,
    currentId: null,
    currentTime: 0,
    duration: 0,
  };
  private unsub: Array<() => void> = [];

  init(ctx: PluginContext): void {
    this.ctx = ctx;
  }

  render(ctx: PluginContext): HTMLElement {
    this.ctx = ctx;
    const wrap = document.createElement("div");
    wrap.className = "transport";
    wrap.innerHTML = `
      <button class="ctrl-btn" data-act="prev" title="上一首">⏮</button>
      <button class="ctrl-btn ctrl-main" data-act="toggle" title="播放/暂停">▶</button>
      <button class="ctrl-btn" data-act="next" title="下一首">⏭</button>
      <span class="time-label" data-role="current">0:00</span>
      <input type="range" class="progress" min="0" max="100" value="0" step="0.1" data-role="progress" />
      <span class="time-label" data-role="duration">0:00</span>
    `;

    this.playBtn = wrap.querySelector('[data-act="toggle"]')!;
    this.progress = wrap.querySelector('[data-role="progress"]')!;
    this.currentLabel = wrap.querySelector('[data-role="current"]')!;
    this.durationLabel = wrap.querySelector('[data-role="duration"]')!;

    wrap.querySelector('[data-act="prev"]')!.addEventListener("click", () =>
      ctx.bus.emit("playback:prev", void 0)
    );
    wrap.querySelector('[data-act="next"]')!.addEventListener("click", () =>
      ctx.bus.emit("playback:next", void 0)
    );
    this.playBtn.addEventListener("click", () => this.toggle());

    this.progress.addEventListener("input", () => {
      const pct = parseFloat(this.progress.value);
      const time = (pct / 100) * this.state.duration;
      this.currentLabel.textContent = fmt(time);
    });
    this.progress.addEventListener("change", () => {
      const pct = parseFloat(this.progress.value);
      const time = (pct / 100) * this.state.duration;
      ctx.bus.emit("playback:seek", time);
    });

    // 订阅事件
    this.unsub.push(
      ctx.bus.on("playback:state", (s) => {
        this.state.isPlaying = s.isPlaying;
        this.state.currentId = s.currentId;
        this.updateButton();
      })
    );
    this.unsub.push(
      ctx.bus.on("playback:time", ({ time, duration }) => {
        this.state.currentTime = time;
        this.state.duration = duration;
        this.currentLabel.textContent = fmt(time);
        this.durationLabel.textContent = fmt(duration);
        if (duration > 0) {
          // 拖拽时不覆盖
          if (document.activeElement !== this.progress) {
            this.progress.value = String((time / duration) * 100);
          }
        }
      })
    );

    return wrap;
  }

  private toggle(): void {
    if (this.state.isPlaying) {
      this.ctx.bus.emit("playback:pause", void 0);
    } else if (this.state.currentId) {
      this.ctx.bus.emit("playback:resume", void 0);
    }
  }

  private updateButton(): void {
    this.playBtn.textContent = this.state.isPlaying ? "⏸" : "▶";
  }

  destroy(): void {
    this.unsub.forEach((u) => u());
    this.unsub = [];
  }
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
