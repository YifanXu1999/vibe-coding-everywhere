import type { IServerConfig } from "./types";

/**
 * Default server config (env-based). Inject IServerConfig in tests or for different backends.
 */
function getBaseUrlFromEnv(): string {
  const url =
    typeof process !== "undefined" && process.env?.EXPO_PUBLIC_SERVER_URL
      ? process.env.EXPO_PUBLIC_SERVER_URL
      : "http://localhost:3456";
  return url.replace(/\/$/, "");
}

export function createDefaultServerConfig(): IServerConfig {
  return {
    getBaseUrl: getBaseUrlFromEnv,
    resolvePreviewUrl(previewUrl: string): string {
      try {
        const base = getBaseUrlFromEnv();
        const baseParsed = new URL(base);
        const parsed = new URL(previewUrl);
        if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
          parsed.hostname = baseParsed.hostname;
          return parsed.toString();
        }
        return previewUrl;
      } catch {
        return previewUrl;
      }
    },
  };
}

/** Singleton default for app use when no DI container is used. */
let defaultInstance: IServerConfig | null = null;

export function getDefaultServerConfig(): IServerConfig {
  if (!defaultInstance) defaultInstance = createDefaultServerConfig();
  return defaultInstance;
}
