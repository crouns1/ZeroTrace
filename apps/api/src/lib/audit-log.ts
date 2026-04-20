import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Request, Response } from "express";
import { config } from "../config.js";

interface AuditEvent {
  timestamp: string;
  level: "info" | "warn" | "error";
  event: string;
  requestId?: string;
  actor?: string;
  ip?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  detail?: string;
  meta?: Record<string, unknown>;
}

export class AuditLogger {
  private ensuredDirectory = false;

  async record(event: Omit<AuditEvent, "timestamp">): Promise<void> {
    const payload: AuditEvent = {
      timestamp: new Date().toISOString(),
      ...event,
    };
    const line = `${JSON.stringify(payload)}\n`;

    try {
      if (!this.ensuredDirectory) {
        await mkdir(dirname(config.auditLogPath), { recursive: true });
        this.ensuredDirectory = true;
      }

      await appendFile(config.auditLogPath, line, "utf8");
    } catch {
      // Logging should never break the product path.
    }

    const serialized = JSON.stringify(payload);

    if (event.level === "error") {
      console.error(serialized);
      return;
    }

    if (event.level === "warn") {
      console.warn(serialized);
      return;
    }

    console.log(serialized);
  }

  bindRequestLifecycle(request: Request, response: Response): void {
    const startedAt = Date.now();

    response.on("finish", () => {
      void this.record({
        level: response.statusCode >= 500 ? "error" : response.statusCode >= 400 ? "warn" : "info",
        event: "http.request.completed",
        requestId: response.locals.requestId as string | undefined,
        actor: response.locals.authenticatedActor as string | undefined,
        ip: request.ip,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
  }
}
