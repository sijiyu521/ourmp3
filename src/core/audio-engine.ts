import type { AudioEngine } from "./types";
import { EventBusImpl } from "./event-bus";

/**
 * 基于 Web Audio API 的音频引擎。
 *
 * 音频路径:  HTMLAudioElement → MediaElementSource → [效果链] → Analyser → Gain → destination
 *
 * 这样效果插件（如均衡器）可以通过 getOutputNode() 拿到 source 节点并插入
 * 自己的 BiquadFilter 链；可视化插件通过 getAnalyser() 读取频域数据。
 */
export class WebAudioEngine implements AudioEngine {
  private audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  /** 效果链的"入口"节点——效果插件在此之后串联 */
  private inputNode: AudioNode | null = null;
  private readyCallbacks: Array<() => void> = [];
  private ready = false;

  constructor(private bus: EventBusImpl) {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.setupListeners();
  }

  private ensureContext(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.source = this.ctx.createMediaElementSource(this.audio);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.gain = this.ctx.createGain();
    // 默认链路: source → analyser → gain → destination
    // 效果插件可在 getOutputNode() 之后插入节点
    this.source.connect(this.analyser);
    this.analyser.connect(this.gain);
    this.gain.connect(this.ctx.destination);
    this.inputNode = this.source;
    this.ready = true;
    this.readyCallbacks.forEach((cb) => cb());
    this.readyCallbacks = [];
  }

  private setupListeners(): void {
    this.audio.addEventListener("loadedmetadata", () => {
      this.bus.emit("playback:time", {
        time: this.audio.currentTime,
        duration: this.audio.duration || 0,
      });
    });
    this.audio.addEventListener("timeupdate", () => {
      this.bus.emit("playback:time", {
        time: this.audio.currentTime,
        duration: this.audio.duration || 0,
      });
    });
    this.audio.addEventListener("ended", () => {
      this.bus.emit("playback:ended", void 0);
    });
  }

  load(url: string): void {
    this.audio.src = url;
    this.audio.load();
  }

  async play(): Promise<void> {
    this.ensureContext();
    if (this.ctx!.state === "suspended") await this.ctx!.resume();
    await this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  seek(time: number): void {
    this.audio.currentTime = time;
  }

  setVolume(v: number): void {
    this.audio.volume = v;
  }

  getDuration(): number {
    return this.audio.duration || 0;
  }

  getCurrentTime(): number {
    return this.audio.currentTime || 0;
  }

  /**
   * 返回效果链入口节点（source）。
   * 效果插件应该断开 source→analyser 的连接，
   * 转而 source→effect→analyser，实现串联。
   */
  getOutputNode(): AudioNode | null {
    this.ensureContext();
    return this.inputNode;
  }

  getAnalyser(): AnalyserNode | null {
    this.ensureContext();
    return this.analyser;
  }

  /**
   * 供效果插件调用：将单个 effect 节点插入到 source 与 analyser 之间。
   * 插入后，source→effect→analyser。
   */
  insertEffect(effect: AudioNode): void {
    if (!this.ctx || !this.source || !this.analyser) return;
    try {
      this.source.disconnect();
    } catch {
      /* 可能尚未连接 */
    }
    this.source.connect(effect);
    effect.connect(this.analyser);
    this.inputNode = effect;
  }

  /**
   * 插入一条效果链：first→...→last→analyser，source→first。
   * 调用方需自行将链内节点连接好。
   */
  insertChain(first: AudioNode, last: AudioNode): void {
    if (!this.ctx || !this.source || !this.analyser) return;
    try {
      this.source.disconnect();
    } catch {
      /* 可能尚未连接 */
    }
    this.source.connect(first);
    last.connect(this.analyser);
    this.inputNode = last;
  }

  /** 将效果链从音频路径中移除，恢复 source→analyser 直连 */
  bypassChain(): void {
    if (!this.ctx || !this.source || !this.analyser) return;
    try {
      this.source.disconnect();
    } catch {
      /* */
    }
    this.source.connect(this.analyser);
    this.inputNode = this.source;
  }

  onReady(cb: () => void): void {
    if (this.ready) cb();
    else this.readyCallbacks.push(cb);
  }

  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  get element(): HTMLAudioElement {
    return this.audio;
  }
}
