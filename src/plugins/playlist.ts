import type { Mp3Plugin, PluginContext, Track } from "../core/types";
import { Slot } from "../core/types";

/**
 * 播放列表插件
 *
 * 维护内部曲目列表镜像，监听 playlist:* 事件保持同步。
 * 点击条目触发 playback:play。
 */
export class PlaylistPlugin implements Mp3Plugin {
  id = "core.playlist";
  name = "播放列表";
  version = "1.0.0";
  author = "OurMP3";
  description = "管理播放队列，双击条目播放";
  slot = Slot.Playlist;
  icon = "📋";
  defaultEnabled = true;

  private ctx!: PluginContext;
  private listEl!: HTMLElement;
  private emptyHint!: HTMLElement;
  private tracks: Track[] = [];
  private currentId: string | null = null;
  private unsub: Array<() => void> = [];

  init(ctx: PluginContext): void {
    this.ctx = ctx;
  }

  render(ctx: PluginContext): HTMLElement {
    this.ctx = ctx;
    const wrap = document.createElement("div");
    wrap.className = "playlist";
    wrap.innerHTML = `
      <div class="playlist-header">
        <span class="playlist-title">播放列表</span>
        <span class="playlist-count" data-role="count">0</span>
      </div>
      <div class="playlist-body" data-role="body"></div>
      <div class="playlist-empty" data-role="empty">
        <div class="empty-icon">🎵</div>
        <p>还没有曲目</p>
        <p class="hint">点击工具栏"添加"按钮选择音频文件</p>
      </div>
    `;
    this.listEl = wrap.querySelector('[data-role="body"]')!;
    this.emptyHint = wrap.querySelector('[data-role="empty"]')!;
    const countEl = wrap.querySelector('[data-role="count"]')!;

    this.unsub.push(
      ctx.bus.on("playlist:track-added", ({ track }) => {
        this.tracks.push(track);
        this.appendItem(track);
        countEl.textContent = String(this.tracks.length);
        this.toggleEmpty();
      })
    );
    this.unsub.push(
      ctx.bus.on("playlist:remove", (id) => {
        this.tracks = this.tracks.filter((t) => t.id !== id);
        this.rerender();
      })
    );
    this.unsub.push(
      ctx.bus.on("playlist:clear", () => {
        this.tracks = [];
        this.rerender();
      })
    );
    this.unsub.push(
      ctx.bus.on("playback:state", (s) => {
        this.currentId = s.currentId;
        this.updateActive();
      })
    );

    return wrap;
  }

  private appendItem(track: Track): void {
    const item = document.createElement("div");
    item.className = "track-item";
    item.dataset.id = track.id;
    item.innerHTML = `
      <span class="track-icon">🎵</span>
      <span class="track-name"></span>
      <button class="track-del" title="移除">✕</button>
    `;
    item.querySelector(".track-name")!.textContent = track.name;
    item.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("track-del")) return;
      this.ctx.bus.emit("playback:play", track);
    });
    item.querySelector(".track-del")!.addEventListener("click", (e) => {
      e.stopPropagation();
      this.ctx.bus.emit("playlist:remove", track.id);
    });
    this.listEl.appendChild(item);
  }

  private rerender(): void {
    this.listEl.innerHTML = "";
    this.tracks.forEach((t) => this.appendItem(t));
    this.toggleEmpty();
  }

  private updateActive(): void {
    this.listEl.querySelectorAll(".track-item").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-id") === this.currentId);
    });
  }

  private toggleEmpty(): void {
    this.emptyHint.style.display = this.tracks.length ? "none" : "flex";
  }

  destroy(): void {
    this.unsub.forEach((u) => u());
    this.unsub = [];
  }
}
