import type { Mp3Plugin, PluginContext } from "../core/types";
import { Slot } from "../core/types";
import type { WebAudioEngine } from "../core/audio-engine";

/**
 * 均衡器插件
 *
 * 使用 Web Audio BiquadFilter 链构建 5 段 EQ。
 * 通过 engine.insertEffect() 把第一个 filter 插入音频链路，
 * 串联其余 filter，最后连回 analyser。
 *
 * 这是"一切皆插件"理念的典型体现：均衡器不是内置功能，
 * 而是一个独立插件，随时可以禁用/替换。
 */
const BANDS = [
  { freq: 60, label: "60" },
  { freq: 230, label: "230" },
  { freq: 910, label: "910" },
  { freq: 3600, label: "3.6k" },
  { freq: 14000, label: "14k" },
] as const;

export class EqualizerPlugin implements Mp3Plugin {
  id = "fx.equalizer";
  name = "均衡器";
  version = "1.0.0";
  author = "OurMP3";
  description = "5 段图形均衡器 (BiquadFilter peaking)";
  slot = Slot.Mixer;
  icon = "🎚";
  defaultEnabled = true;

  private ctx!: PluginContext;
  private filters: BiquadFilterNode[] = [];
  private enabled = false;
  private sliders: HTMLInputElement[] = [];
  private toggleBtn!: HTMLButtonElement;

  init(ctx: PluginContext): void {
    this.ctx = ctx;
  }

  render(ctx: PluginContext): HTMLElement {
    this.ctx = ctx;
    const wrap = document.createElement("div");
    wrap.className = "equalizer";
    const bandsHtml = BANDS.map(
      (b, i) => `
      <div class="eq-band">
        <input type="range" class="eq-slider" min="-12" max="12" step="1" value="0" data-i="${i}" orient="vertical" />
        <span class="eq-label">${b.label}</span>
      </div>`
    ).join("");
    wrap.innerHTML = `
      <div class="eq-header">
        <span class="eq-name">${this.icon} 均衡器</span>
        <button class="eq-toggle" data-act="toggle">OFF</button>
      </div>
      <div class="eq-bands">${bandsHtml}</div>
    `;

    this.toggleBtn = wrap.querySelector('[data-act="toggle"]')!;
    this.sliders = Array.from(wrap.querySelectorAll(".eq-slider"));

    this.toggleBtn.addEventListener("click", () => {
      this.enabled = !this.enabled;
      this.toggleBtn.textContent = this.enabled ? "ON" : "OFF";
      this.toggleBtn.classList.toggle("on", this.enabled);
      if (this.enabled) this.setupChain();
      else this.teardownChain();
    });

    this.sliders.forEach((s, i) => {
      s.addEventListener("input", () => {
        if (this.filters[i]) {
          this.filters[i].gain.value = parseFloat(s.value);
        }
      });
    });

    return wrap;
  }

  private setupChain(): void {
    const engine = this.ctx.engine as WebAudioEngine;
    const ac = engine.audioContext;
    if (!ac) return;

    // 创建 5 个 peaking filter 并串联: f0→f1→…→f4
    this.filters = BANDS.map((b) => {
      const f = ac.createBiquadFilter();
      f.type = "peaking";
      f.frequency.value = b.freq;
      f.Q.value = 1.0;
      f.gain.value = 0;
      return f;
    });
    for (let i = 0; i < this.filters.length - 1; i++) {
      this.filters[i].connect(this.filters[i + 1]);
    }

    // 将整条链插入音频路径: source→f0→...→f4→analyser
    engine.insertChain(this.filters[0], this.filters[this.filters.length - 1]);
  }

  private teardownChain(): void {
    const engine = this.ctx.engine as WebAudioEngine;
    if (this.filters.length === 0) return;
    for (const f of this.filters) {
      try {
        f.disconnect();
      } catch {
        /* */
      }
    }
    this.filters = [];
    // 恢复直连
    engine.bypassChain();
  }

  destroy(): void {
    this.teardownChain();
  }
}
