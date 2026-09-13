import type { Mp3Plugin, PluginContext } from "../core/types";
import { Slot } from "../core/types";

/**
 * 音量控制插件
 *
 * 提供静音切换 + 音量滑块。
 */
export class VolumePlugin implements Mp3Plugin {
  id = "core.volume";
  name = "音量控制";
  version = "1.0.0";
  author = "OurMP3";
  description = "音量滑块与静音切换";
  slot = Slot.Mixer;
  icon = "🔊";
  defaultEnabled = true;

  private slider!: HTMLInputElement;
  private muteBtn!: HTMLButtonElement;
  private muted = false;
  private unsub: Array<() => void> = [];

  init(_ctx: PluginContext): void {
    /* no-op */
  }

  render(ctx: PluginContext): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "volume-control";
    wrap.innerHTML = `
      <button class="ctrl-btn" data-act="mute" title="静音">🔊</button>
      <input type="range" class="volume-slider" min="0" max="1" step="0.01" value="1" data-role="vol" />
    `;
    this.muteBtn = wrap.querySelector('[data-act="mute"]')!;
    this.slider = wrap.querySelector('[data-role="vol"]')!;

    this.muteBtn.addEventListener("click", () => {
      this.muted = !this.muted;
      ctx.bus.emit("mixer:mute", this.muted);
      this.muteBtn.textContent = this.muted ? "🔇" : "🔊";
    });
    this.slider.addEventListener("input", () => {
      const v = parseFloat(this.slider.value);
      ctx.bus.emit("mixer:volume", v);
      this.muteBtn.textContent = v === 0 ? "🔇" : "🔊";
    });

    return wrap;
  }

  destroy(): void {
    this.unsub.forEach((u) => u());
    this.unsub = [];
  }
}
