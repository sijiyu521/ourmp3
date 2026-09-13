import type { Mp3Plugin, PluginContext } from "../core/types";
import { Slot } from "../core/types";
import type { WebAudioEngine } from "../core/audio-engine";

/**
 * 频谱条形图插件
 *
 * 使用 AnalyserNode 读取频域数据，在 Canvas 上绘制实时频谱。
 * 通过 requestAnimationFrame 持续刷新。
 */
export class SpectrumPlugin implements Mp3Plugin {
  id = "viz.spectrum";
  name = "频谱条形图";
  version = "1.0.0";
  author = "OurMP3";
  description = "实时频率可视化频谱";
  slot = Slot.Visualizer;
  icon = "📊";
  defaultEnabled = true;

  private engine!: WebAudioEngine;
  private canvas!: HTMLCanvasElement;
  private raf: number | null = null;

  init(_ctx: PluginContext): void {
    /* no-op */
  }

  render(ctx: PluginContext): HTMLElement {
    this.engine = ctx.engine as WebAudioEngine;

    const wrap = document.createElement("div");
    wrap.className = "spectrum";
    wrap.innerHTML = `<canvas class="spectrum-canvas"></canvas>`;

    this.canvas = wrap.querySelector("canvas")!;
    this.startLoop();
    return wrap;
  }

  private startLoop(): void {
    const analyser = this.engine.getAnalyser();
    if (!analyser) {
      setTimeout(() => this.startLoop(), 300);
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.raf = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      const canvas = this.canvas;
      const w = (canvas.width = canvas.clientWidth * devicePixelRatio);
      const h = (canvas.height = canvas.clientHeight * devicePixelRatio);
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;

      ctx2d.clearRect(0, 0, w, h);

      const barCount = Math.min(bufferLength, 64);
      const barW = (w / barCount) * 0.85;
      const gap = (w / barCount) * 0.15;

      const gradient = ctx2d.createLinearGradient(0, h, 0, 0);
      gradient.addColorStop(0, "#1db954");
      gradient.addColorStop(0.5, "#ff9800");
      gradient.addColorStop(1, "#e91e63");
      ctx2d.fillStyle = gradient;

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i] / 255;
        const barH = value * h * 0.9;
        const x = i * (barW + gap);
        const y = h - barH - 1;
        ctx2d.fillRect(x, y, barW, barH);
      }
    };

    draw();
  }

  destroy(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }
}