import { Redis } from "ioredis";
import { config } from "../config.js";
import { TtlCache } from "../lib/cache.js";

export interface CacheProvider<T> {
  readonly name: string;
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, ttlMs?: number): Promise<void>;
}

class MemoryCacheProvider<T> implements CacheProvider<T> {
  readonly name = "memory";
  private readonly cache = new TtlCache<T>(config.cacheTtlMs);

  async get(key: string): Promise<T | undefined> {
    return this.cache.get(key);
  }

  async set(key: string, value: T): Promise<void> {
    this.cache.set(key, value);
  }
}

class RedisCacheProvider<T> implements CacheProvider<T> {
  readonly name = "redis";
  private readonly client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
    });
  }

  async get(key: string): Promise<T | undefined> {
    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : undefined;
  }

  async set(key: string, value: T, ttlMs = config.cacheTtlMs): Promise<void> {
    await this.client.set(key, JSON.stringify(value), "PX", ttlMs);
  }
}

export function createCacheProvider<T>(): CacheProvider<T> {
  if (config.redisUrl) {
    return new RedisCacheProvider<T>(config.redisUrl);
  }

  return new MemoryCacheProvider<T>();
}
