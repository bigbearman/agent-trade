// Adapter registry — loads and manages trading venue adapters

import type { TradingAdapter } from './adapters/adapter.js';

export class AdapterRegistry {
  private adapters: Map<string, TradingAdapter> = new Map();

  register(adapter: TradingAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): TradingAdapter | undefined {
    return this.adapters.get(name);
  }

  list(): TradingAdapter[] {
    return Array.from(this.adapters.values());
  }

  getConfigured(): TradingAdapter[] {
    return this.list().filter((a) => a.isConfigured());
  }

  /** Get adapter by name, throw if not found */
  require(name: string): TradingAdapter {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`Venue "${name}" not found. Available: ${this.list().map((a) => a.name).join(', ')}`);
    }
    return adapter;
  }

  /** Get the first configured adapter, or throw */
  requireAny(): TradingAdapter {
    const configured = this.getConfigured();
    if (configured.length === 0) {
      throw new Error('No trading venues configured. Check environment variables.');
    }
    return configured[0];
  }
}
