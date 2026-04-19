export class TtlCache<T> {
  private readonly store = new Map<string, { expiresAt: number; value: T }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const item = this.store.get(key);

    if (!item) {
      return undefined;
    }

    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return item.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}

