import { getDefaultServerConfig } from "../core";

/** @deprecated Prefer getDefaultServerConfig().getBaseUrl() or inject IServerConfig. */
export function getServerBaseUrl(): string {
  return getDefaultServerConfig().getBaseUrl();
}

/** @deprecated Prefer getDefaultServerConfig().resolvePreviewUrl() or inject IServerConfig. */
export function resolvePreviewUrl(previewUrl: string): string {
  return getDefaultServerConfig().resolvePreviewUrl(previewUrl);
}
