import type { Mp3Plugin, PluginContext, Track } from "../core/types";
import { Slot } from "../core/types";

/**
 * 文件源插件
 *
 * 负责：从文件系统选择 MP3 文件，生成 blob URL，并发布到播放列表。
 * 同时注册 "source.open-files" 能力，供其他插件（如拖拽区）调用。
 */
export class FileSourcePlugin implements Mp3Plugin {
  id = "core.file-source";
  name = "文件源";
  version = "1.0.0";
  author = "OurMP3";
  description = "从本地文件选择音频，加入播放列表";
  slot = Slot.Toolbar;
  icon = "📂";
  defaultEnabled = true;

  private ctx!: PluginContext;

  init(ctx: PluginContext): void {
    this.ctx = ctx;
    ctx.capabilities.register({
      id: "source.open-files",
      label: "打开文件",
      invoke: () => this.openFiles(),
    });
  }

  private openFiles(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,.mp3,.flac,.wav,.ogg,.m4a";
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      for (const file of files) {
        const url = URL.createObjectURL(file);
        const track: Track = {
          id: this.ctx.uid(),
          name: file.name.replace(/\.[^.]+$/, ""),
          url,
          size: file.size,
        };
        this.ctx.bus.emit("playlist:add", track);
      }
    };
    input.click();
  }

  render(ctx: PluginContext): HTMLElement {
    this.ctx = ctx;
    const btn = document.createElement("button");
    btn.className = "toolbar-btn";
    btn.title = "打开音频文件";
    btn.innerHTML = `<span class="icon">${this.icon}</span><span>添加</span>`;
    btn.onclick = () => this.openFiles();
    return btn;
  }

  destroy(): void {
    this.ctx.capabilities.unregister("source.open-files");
  }
}
