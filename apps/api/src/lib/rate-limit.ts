import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  keyPrefix: string;
  limit: number;
  windowMs?: number;
  onReject?: (request: Request, response: Response, remainingMs: number) => void;
}

class MemoryRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  consume(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      const next = {
        count: 1,
        resetAt: now + windowMs,
      };
      this.buckets.set(key, next);
      return {
        allowed: true,
        remaining: Math.max(0, limit - next.count),
        resetAt: next.resetAt,
      };
    }

    current.count += 1;
    return {
      allowed: current.count <= limit,
      remaining: Math.max(0, limit - current.count),
      resetAt: current.resetAt,
    };
  }
}

const limiter = new MemoryRateLimiter();

function requestClientKey(request: Request): string {
  return request.ip || request.header("x-forwarded-for") || "unknown";
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  return (request: Request, response: Response, next: NextFunction) => {
    const windowMs = options.windowMs ?? config.rateLimitWindowMs;
    const key = `${options.keyPrefix}:${requestClientKey(request)}`;
    const result = limiter.consume(key, options.limit, windowMs);
    const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));

    response.setHeader("X-RateLimit-Limit", String(options.limit));
    response.setHeader("X-RateLimit-Remaining", String(result.remaining));
    response.setHeader("X-RateLimit-Reset", String(Math.floor(result.resetAt / 1000)));

    if (result.allowed) {
      next();
      return;
    }

    response.setHeader("Retry-After", String(retryAfterSeconds));
    options.onReject?.(request, response, result.resetAt - Date.now());
    response.status(429).json({
      error: "Rate limit exceeded.",
      retryAfterSeconds,
      disclaimer: config.disclaimer,
    });
  };
}
