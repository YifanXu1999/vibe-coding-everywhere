import React from "react";
import { claudeTheme } from "./claude";
import { geminiTheme } from "./gemini";

export { claudeTheme } from "./claude";
export { geminiTheme } from "./gemini";

export type ProviderTheme = typeof claudeTheme | typeof geminiTheme;

export const themes = { claude: claudeTheme, gemini: geminiTheme } as const;
export type Provider = keyof typeof themes;

export function getTheme(provider: Provider): ProviderTheme {
  return themes[provider];
}

/** Default theme (Claude). Kept for backward compatibility. */
export const theme = claudeTheme;

/** Context holds only provider to avoid Hermes throwing on .theme access. Theme is derived via getTheme(provider). */
const defaultContextValue: { provider: Provider } = { provider: "gemini" };

export const ThemeContext = React.createContext<{ provider: Provider }>(defaultContextValue);

export function ThemeProvider({
  provider,
  children,
}: {
  provider: Provider;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ provider }), [provider]);
  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useProvider(): Provider {
  try {
    const ctx = React.useContext(ThemeContext);
    if (ctx != null && typeof ctx === "object" && "provider" in ctx) {
      const p = (ctx as { provider: Provider }).provider;
      if (p === "claude" || p === "gemini") return p;
    }
  } catch (_) {
    // Hermes/RN can throw when context not ready
  }
  return "gemini";
}

/** Prefer deriving theme from provider to avoid accessing .theme on context (Hermes can throw). */
export function useTheme(): ProviderTheme {
  return getTheme(useProvider());
}
