/**
 * 核心：一切皆插件
 *
 * 本文件定义了 OurMP3 的插件契约。播放器的每一个功能——
 * 从音频源、传输控制、播放列表到可视化与效果器——
 * 都是一个实现了 Mp3Plugin 接口的插件。
 *
 * 插件通过 PluginContext 访问播放器内核（事件总线、音频引擎、状态），
 * 并可声明其提供的"能力"(Slot)，供其他插件或 UI 调用。
 */

/** 插件可挂载到的 UI 插槽 */
export enum Slot {
  /** 主播放区 — 正在播放的曲目信息与封面 */
  NowPlaying = "now-playing",
  /** 传输控制条 — 播放/暂停/上一首/下一首 + 进度条 */
  Transport = "transport",
  /** 播放列表 */
  Playlist = "playlist",
  /** 音量 / 音效控制 */
  Mixer = "mixer",
  /** 可视化区域 */
  Visualizer = "visualizer",
  /** 顶部工具栏 */
  Toolbar = "toolbar",
}

/** 全局播放状态 */
export interface PlaybackState {
  currentId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
}

/** 播放列表条目 */
export interface Track {
  id: string;
  name: string;
  artist?: string;
  album?: string;
  /** 可播放的 URL（blob: 或 http(s):） */
  url: string;
  duration?: number;
  size?: number;
}

/** 事件总线中传递的事件映射 */
export interface EventMap {
  "playback:play": Track;
  "playback:pause": void;
  "playback:resume": void;
  "playback:stop": void;
  "playback:seek": number;
  "playback:time": { time: number; duration: number };
  "playback:ended": void;
  "playback:next": void;
  "playback:prev": void;
  "playback:state": PlaybackState;
  "playlist:add": Track;
  "playlist:remove": string;
  "playlist:clear": void;
  "playlist:track-added": { index: number; track: Track };
  "mixer:volume": number;
  "mixer:mute": boolean;
  "plugin:loaded": string;
  "plugin:unloaded": string;
}

/** 通用事件处理器 */
export type EventHandler<T = unknown> = (payload: T) => void;

/** 对外暴露的能力——插件可注册一个或多个能力，通过 id 检索 */
export interface Capability<T = unknown> {
  id: string;
  label: string;
  invoke: (...args: unknown[]) => T;
}

/** 插件运行时上下文——由内核注入 */
export interface PluginContext {
  /** DOM 根容器 */
  root: HTMLElement;
  /** 事件总线 */
  bus: EventBus;
  /** 音频引擎 */
  engine: AudioEngine;
  /** 状态访问器 */
  getState: () => PlaybackState;
  /** 能力注册表 */
  capabilities: CapabilityRegistry;
  /** 工具：生成唯一 id */
  uid: () => string;
}

/** 音频引擎抽象——解耦 Web Audio 与 HTMLAudio 两种后端 */
export interface AudioEngine {
  load(url: string): void;
  play(): void;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  setVolume(v: number): void;
  getDuration(): number;
  getCurrentTime(): number;
  /** 获取 AudioNode，供效果插件串联（Web Audio 后端可用） */
  getOutputNode(): AudioNode | null;
  /** 获取 AnalyserNode，供可视化插件使用 */
  getAnalyser(): AnalyserNode | null;
  /** 当引擎准备好（有数据可播） */
  onReady(cb: () => void): void;
}

/** 事件总线接口 */
export interface EventBus {
  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void;
  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void;
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void;
}

/** 能力注册表接口 */
export interface CapabilityRegistry {
  register<T>(cap: Capability<T>): void;
  unregister(id: string): void;
  get<T>(id: string): Capability<T> | null;
  list(): Capability[];
}

/** 插件元数据 */
export interface PluginManifest {
  /** 插件唯一 id */
  id: string;
  /** 展示名 */
  name: string;
  /** 版本号 */
  version: string;
  /** 作者 */
  author?: string;
  /** 简短描述 */
  description?: string;
  /** 默认是否启用 */
  defaultEnabled?: boolean;
}

/** 插件接口——一切功能皆插件 */
export interface Mp3Plugin extends PluginManifest {
  /** 挂载到的 UI 插槽（若不需要 UI 可省略） */
  slot?: Slot;
  /** 图标（emoji 或 svg path） */
  icon?: string;
  /** 初始化：注册事件、能力、渲染 UI */
  init?(ctx: PluginContext): void | Promise<void>;
  /** 销毁：清理事件监听、DOM、定时器 */
  destroy?(): void;
  /** 当对应插槽需要渲染时返回 HTMLElement（命令式渲染） */
  render?(ctx: PluginContext): HTMLElement;
}

export type PluginConstructor = new () => Mp3Plugin;
