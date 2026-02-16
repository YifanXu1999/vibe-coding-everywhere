/**
 * Header icons (Lucide, via better-icons).
 * Use: better-icons get lucide:menu | lucide:settings
 */
import React from "react";
import Svg, { Path, Circle, G } from "react-native-svg";

const size = 22;

export function MenuIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 5h16M4 12h16M4 19h16"
      />
    </Svg>
  );
}

export function SettingsIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <Path
          fill={color}
          d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0a2.34 2.34 0 0 0 3.319 1.915a2.34 2.34 0 0 1 2.33 4.033a2.34 2.34 0 0 0 0 3.831a2.34 2.34 0 0 1-2.33 4.033a2.34 2.34 0 0 0-3.319 1.915a2.34 2.34 0 0 1-4.659 0a2.34 2.34 0 0 0-3.32-1.915a2.34 2.34 0 0 1-2.33-4.033a2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
        />
        <Circle fill={color} cx="12" cy="12" r="3" />
      </G>
    </Svg>
  );
}
