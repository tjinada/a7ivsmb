import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

/**
 * Tiny persistence primitive: one JSON file per store, loaded into memory
 * and written atomically (temp file + rename) on change. This is the ONLY
 * persistence in the app — no database. Each feature that needs state owns
 * its own `JsonStore<T>` instance (FTP config, recent transfers — Phase 2+).
 */
export class JsonStore<T> {
  private readonly file: string;
  private data: T;
  private writing: Promise<void> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;

  constructor(filename: string, private readonly defaults: T) {
    this.file = path.join(config.dataDir, filename);
    this.data = defaults;
  }

  /** Load from disk; falls back to defaults if the file does not exist. */
  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      this.data = { ...this.defaults, ...(JSON.parse(raw) as T) };
    } catch {
      this.data = this.defaults;
      await this.persist();
    }
  }

  get(): T {
    return this.data;
  }

  /** Replace state via an updater and persist atomically. */
  async update(fn: (current: T) => T): Promise<T> {
    this.data = fn(this.data);
    await this.persist();
    return this.data;
  }

  /** Replace state now and persist once, `delayMs` after the last call.
   *  For bursty counters where losing a few seconds on restart is fine. */
  updateDeferred(fn: (current: T) => T, delayMs: number): T {
    this.data = fn(this.data);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.persist().catch(() => { /* data stays in memory; the next write retries */ });
    }, delayMs);
    this.timer.unref();
    return this.data;
  }

  private async persist(): Promise<void> {
    // A failed write mustn't wedge the chain for every later one.
    this.writing = this.writing.catch(() => undefined).then(async () => {
      await fs.mkdir(config.dataDir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      await fs.rename(tmp, this.file);
    });
    return this.writing;
  }
}
