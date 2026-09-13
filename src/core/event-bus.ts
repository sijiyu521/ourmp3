import type { EventBus, EventHandler, EventMap } from "./types";

type AnyHandler = EventHandler<unknown>;
type HandlerSet = Map<string, Set<AnyHandler>>;

/**
 * 简单的事件总线实现。
 * - on() 返回取消订阅函数
 * - emit() 同步派发，捕获异常防止单个 handler 崩溃整个链
 */
export class EventBusImpl implements EventBus {
  private handlers: HandlerSet = new Map();

  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void {
    const key = event as string;
    if (!this.handlers.has(key)) this.handlers.set(key, new Set());
    this.handlers.get(key)!.add(handler as AnyHandler);
    return () => this.off(event, handler);
  }

  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    const key = event as string;
    this.handlers.get(key)?.delete(handler as AnyHandler);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const key = event as string;
    const set = this.handlers.get(key);
    if (!set) return;
    // 复制一份避免遍历中增删导致迭代异常
    for (const handler of [...set]) {
      try {
        handler(payload as unknown);
      } catch (err) {
        console.error(`[EventBus] handler for "${key}" threw:`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
