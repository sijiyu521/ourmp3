import type { Capability, CapabilityRegistry } from "./types";

/**
 * 能力注册表。
 * 插件可向外暴露可被检索/调用的能力，形成松耦合的服务发现机制。
 * 例如 FileSource 插件注册 "source.open-files" 能力，
 * 其他插件即可通过 ctx.capabilities.get("source.open-files") 调用它。
 */
export class CapabilityRegistryImpl implements CapabilityRegistry {
  private caps = new Map<string, Capability>();

  register<T>(cap: Capability<T>): void {
    this.caps.set(cap.id, cap as Capability);
  }

  unregister(id: string): void {
    this.caps.delete(id);
  }

  get<T>(id: string): Capability<T> | null {
    return (this.caps.get(id) as Capability<T> | undefined) ?? null;
  }

  list(): Capability[] {
    return [...this.caps.values()];
  }

  clear(): void {
    this.caps.clear();
  }
}
