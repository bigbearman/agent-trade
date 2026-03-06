// Spend tracking with persistent disk storage

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { SpendRecord } from './types.js';

export class SpendTracker {
  private record: SpendRecord = { date: '', total: 0 };
  private readonly filePath: string;
  private lock = false;

  constructor() {
    const dataDir = process.env.AT_DATA_DIR || process.env.WM_DATA_DIR || join(process.env.HOME || '/tmp', '.agent-trade');
    try { mkdirSync(dataDir, { recursive: true }); } catch { /* ignore */ }
    this.filePath = join(dataDir, 'spend-tracker.json');
    this.load();
  }

  private load(): void {
    try {
      const data = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed.date && typeof parsed.total === 'number') {
        this.record = parsed;
      }
    } catch {
      // File doesn't exist or corrupted — start fresh
    }
  }

  private save(): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(this.record), 'utf-8');
    } catch {
      console.error('[SpendTracker] Failed to persist spend data');
    }
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  getSpent(): number {
    if (this.record.date !== this.todayKey()) {
      this.record = { date: this.todayKey(), total: 0 };
      this.save();
    }
    return this.record.total;
  }

  /**
   * Atomic check-and-add: returns true if amount was within limits and recorded.
   * Prevents race condition where parallel calls all pass limit check.
   */
  tryAdd(amount: number, dailyLimit: number): { success: boolean; newTotal: number } {
    if (this.lock) {
      return { success: false, newTotal: this.record.total };
    }
    this.lock = true;
    try {
      if (this.record.date !== this.todayKey()) {
        this.record = { date: this.todayKey(), total: 0 };
      }
      if (this.record.total + amount > dailyLimit) {
        return { success: false, newTotal: this.record.total };
      }
      this.record.total += amount;
      this.save();
      return { success: true, newTotal: this.record.total };
    } finally {
      this.lock = false;
    }
  }

  add(amount: number): void {
    if (this.record.date !== this.todayKey()) {
      this.record = { date: this.todayKey(), total: 0 };
    }
    this.record.total += amount;
    this.save();
  }
}
