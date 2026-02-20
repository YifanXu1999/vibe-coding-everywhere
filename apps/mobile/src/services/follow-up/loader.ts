/**
 * Load follow-up options from prompts/follow-up/*.md.
 * Uses server API (reads from project root, not workspace) so options
 * are available regardless of workspace configuration.
 */

import type { IServerConfig } from "../../core/types";
import type { ParsedFollowUp } from "./parser";

/**
 * Load follow-up options from the server API.
 * The server reads prompts/follow-up/*.md from the project root.
 */
export async function loadFollowUpOptions(serverConfig: IServerConfig): Promise<ParsedFollowUp[]> {
  const baseUrl = serverConfig.getBaseUrl();
  const url = `${baseUrl}/api/follow-up-options`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as ParsedFollowUp[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
