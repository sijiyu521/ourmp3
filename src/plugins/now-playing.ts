import type { Mp3Plugin, PluginContext, Track } from "../core/types";
import { Slot } from "../core/types";

/**
 * 正在播放插件
 *
 * 显示当前曲目的标题、艺术家、专辑与一个渐变色封面占位。
 * 当无曲目时显示欢迎提示。
 */
export class NowPlayingPlugin implements Mp3Plugin {
  id = "core.now-playing";
  name = "正在播放";
  version = "1.0.0";
  author = "OurMP3";
  description = "展示当前播放曲目的信息与封面";
  slot = Slot.NowPlaying;
  icon = "🎶";
  defaultEnabled = true;

  private titleEl!: HTMLElement;
  private artistEl!: HTMLElement;
  private coverEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private unsub: Array<() => void> = [];

  init(_ctx: PluginContext): void {
    /* no-op */
  }

  render(ctx: PluginContext): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "now-playing";
    wrap.innerHTML = `
      <div class="np-cover" data-role="cover">
        <span class="np-cover-icon">🎵</span>
      </div>
      <div class="np-info">
        <div class="np-title" data-role="title">OurMP3</div>
        <div class="np-artist" data-role="artist">一切皆插件的播放器</div>
      </div>
      <div class="np-status" data-role="status">就绪</div>
    `;
    this.titleEl = wrap.querySelector('[data-role="title"]')!;
    this.artistEl = wrap.querySelector('[data-role="artist"]')!;
    this.coverEl = wrap.querySelector('[data-role="cover"]')!;
    this.statusEl = wrap.querySelector('[data-role="status"]')!;

    this.unsub.push(
      ctx.bus.on("playback:play", (track: Track) => {
        this.titleEl.textContent = track.name;
        this.artistEl.textContent = track.artist || track.album || "未知艺术家";
        this.coverEl.querySelector(".np-cover-icon")!.textContent = "🎶";
        this.statusEl.textContent = "播放中";
        this.coverEl.classList.add("spinning");
      })
    );
    this.unsub.push(
      ctx.bus.on("playback:state", (s) => {
        if (!s.currentId) {
          this.statusEl.textContent = "就绪";
          this.coverEl.classList.remove("spinning");
        } else {
          this.statusEl.textContent = s.isPlaying ? "播放中" : "已暂停";
          this.coverEl.classList.toggle("spinning", s.isPlaying);
        }
      })
    );

    return wrap;
  }

  destroy(): void {
    this.unsub.forEach((u) => u());
    this.unsub = [];
  }
}
