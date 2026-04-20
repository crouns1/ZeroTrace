import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

function extractApiKey(request: Request): string | undefined {
  const headerValue = request.header("x-reconpulse-api-key")?.trim();

  if (headerValue) {
    return headerValue;
  }

  const authorization = request.header("authorization")?.trim();

  if (!authorization) {
    return undefined;
  }

  const match = authorization.match(/^bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

export function authSummary(): { enabled: boolean; keyCount: number } {
  return {
    enabled: config.authApiKeys.length > 0,
    keyCount: config.authApiKeys.length,
  };
}

export function createAuthMiddleware(
  onFailure?: (request: Request, response: Response, reason: string) => void,
) {
  const validKeys = new Set(config.authApiKeys);

  return (request: Request, response: Response, next: NextFunction) => {
    if (validKeys.size === 0) {
      response.locals.authenticatedActor = "development-open";
      next();
      return;
    }

    const apiKey = extractApiKey(request);

    if (apiKey && validKeys.has(apiKey)) {
      response.locals.authenticatedActor = `api-key:${apiKey.slice(0, 4)}...`;
      next();
      return;
    }

    onFailure?.(request, response, "missing-or-invalid-api-key");
    response.status(401).json({
      error: "Authentication required.",
      disclaimer: config.disclaimer,
    });
  };
}
