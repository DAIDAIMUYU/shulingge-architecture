import type http from "node:http";

import { createHttpError } from "./errors.js";
import type { RouteDefinition, RouteRequest } from "./types.js";

interface CompiledRoute {
  definition: RouteDefinition;
  pattern: RegExp;
  paramNames: string[];
}

function compilePath(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const pattern = path.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => {
    paramNames.push(name);
    return "([^/]+)";
  });

  return {
    pattern: new RegExp(`^${pattern}$`),
    paramNames,
  };
}

export function createRouter(routeDefinitions: RouteDefinition[]) {
  const compiledRoutes: CompiledRoute[] = routeDefinitions.map((definition) => ({
    definition,
    ...compilePath(definition.path),
  }));

  return {
    async match(method: string, pathname: string): Promise<{
      route: RouteDefinition;
      params: Record<string, string>;
    }> {
      for (const compiled of compiledRoutes) {
        if (compiled.definition.method !== method) {
          continue;
        }

        const match = pathname.match(compiled.pattern);
        if (!match) {
          continue;
        }

        const params = Object.fromEntries(
          compiled.paramNames.map((name, index) => [name, decodeURIComponent(match[index + 1] ?? "")]),
        );

        return {
          route: compiled.definition,
          params,
        };
      }

      throw createHttpError(404, "SERVER_ROUTE_NOT_FOUND", `Route not found: ${method} ${pathname}`);
    },
    listRoutes(): RouteDefinition[] {
      return routeDefinitions;
    },
  };
}

export async function parseJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const method = request.method ?? "GET";
  if (method === "GET" || method === "DELETE") {
    return undefined;
  }

  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
}

export function toRouteRequest(
  raw: http.IncomingMessage,
  method: string,
  url: URL,
  params: Record<string, string>,
  body: unknown,
): RouteRequest {
  return {
    method,
    url,
    raw,
    params,
    query: url.searchParams,
    body,
  };
}
