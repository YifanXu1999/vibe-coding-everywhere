export function getServerBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_SERVER_URL;
  if (url) return url.replace(/\/$/, "");
  return "http://localhost:3456";
}

/**
 * Resolve preview URL for in-app WebView. On device, localhost refers to the
 * device itself, so replace localhost with the server host so the preview
 * (e.g. dev server on port 3000) is reachable.
 */
export function resolvePreviewUrl(previewUrl: string): string {
  try {
    const base = getServerBaseUrl();
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
}
