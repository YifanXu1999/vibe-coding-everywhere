/**
 * UI behavior tests: Permission denial banner
 *
 * Covers the flow when the backend returns permission_denials (e.g. tool, file access, bash).
 * See log: permission_denials in result, PermissionDenialBanner with onDismiss / onAccept.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { PermissionDenialBanner } from "../PermissionDenialBanner";
import type { PermissionDenial } from "../../core/types";

// ─── Mock data: permission denials (tool, file access, bash) ─────────────────

const mockDenialTool: PermissionDenial = {
  tool_name: "Bash",
  tool: "Bash",
};

const mockDenialFileAccess: PermissionDenial = {
  tool_name: "Read",
  tool_input: { file_path: "/workspace/secret.txt" },
};

const mockDenialWithPath: PermissionDenial = {
  tool: "Edit",
  tool_input: { path: "apps/mobile/App.tsx" },
};

const mockDenialUnknown: PermissionDenial = {
  tool: "CustomTool",
};

const mockMultipleDenials: PermissionDenial[] = [
  mockDenialTool,
  mockDenialFileAccess,
  mockDenialWithPath,
];

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("PermissionDenialBanner", () => {
  describe("visibility", () => {
    it("returns null when denials is empty", () => {
      const { toJSON } = render(
        <PermissionDenialBanner denials={[]} onDismiss={jest.fn()} onAccept={jest.fn()} />
      );
      expect(toJSON()).toBeNull();
    });

    it("returns null when denials is null/undefined (handled by length check)", () => {
      const { toJSON } = render(
        <PermissionDenialBanner
          denials={null as unknown as PermissionDenial[]}
          onDismiss={jest.fn()}
          onAccept={jest.fn()}
        />
      );
      expect(toJSON()).toBeNull();
    });

    it("renders when there is one denial", () => {
      render(
        <PermissionDenialBanner
          denials={[mockDenialTool]}
          onDismiss={jest.fn()}
          onAccept={jest.fn()}
        />
      );
      expect(screen.getByText("Permission denied")).toBeTruthy();
    });

    it("renders when there are multiple denials", () => {
      render(
        <PermissionDenialBanner
          denials={mockMultipleDenials}
          onDismiss={jest.fn()}
          onAccept={jest.fn()}
        />
      );
      expect(screen.getByText("Permissions denied")).toBeTruthy();
    });
  });

  describe("content: single denial (tool / bash)", () => {
    it("shows summary 'Permission denied' and tool name for Bash", () => {
      render(
        <PermissionDenialBanner
          denials={[mockDenialTool]}
          onDismiss={jest.fn()}
          onAccept={jest.fn()}
        />
      );
      expect(screen.getByText("Permission denied")).toBeTruthy();
      expect(screen.getByText("Bash")).toBeTruthy();
    });

    it("shows tool name when only tool is set", () => {
      render(
        <PermissionDenialBanner
          denials={[mockDenialUnknown]}
          onDismiss={jest.fn()}
          onAccept={jest.fn()}
        />
      );
      expect(screen.getByText("CustomTool")).toBeTruthy();
    });
  });

  describe("content: file access denial", () => {
    it("shows tool and file_path in detail", () => {
      render(
        <PermissionDenialBanner
          denials={[mockDenialFileAccess]}
          onDismiss={jest.fn()}
          onAccept={jest.fn()}
        />
      );
      expect(screen.getByText("Permission denied")).toBeTruthy();
      expect(screen.getByText(/Read/)).toBeTruthy();
      expect(screen.getByText(/secret\.txt/)).toBeTruthy();
    });

    it("shows tool and path when tool_input.path is used", () => {
      render(
        <PermissionDenialBanner
          denials={[mockDenialWithPath]}
          onDismiss={jest.fn()}
          onAccept={jest.fn()}
        />
      );
      expect(screen.getByText(/Edit/)).toBeTruthy();
      expect(screen.getByText(/App\.tsx/)).toBeTruthy();
    });
  });

  describe("content: multiple denials", () => {
    it("shows 'Permissions denied' and all tools/paths", () => {
      render(
        <PermissionDenialBanner
          denials={mockMultipleDenials}
          onDismiss={jest.fn()}
          onAccept={jest.fn()}
        />
      );
      expect(screen.getByText("Permissions denied")).toBeTruthy();
      expect(screen.getByText(/Bash/)).toBeTruthy();
      expect(screen.getByText(/Read/)).toBeTruthy();
      expect(screen.getByText(/Edit/)).toBeTruthy();
    });
  });

  describe("actions: Dismiss", () => {
    it("calls onDismiss when Dismiss is pressed", () => {
      const onDismiss = jest.fn();
      render(
        <PermissionDenialBanner
          denials={[mockDenialTool]}
          onDismiss={onDismiss}
          onAccept={jest.fn()}
        />
      );
      fireEvent.press(screen.getByText("Dismiss"));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe("actions: Accept & retry", () => {
    it("calls onAccept when Accept & retry is pressed", () => {
      const onAccept = jest.fn();
      render(
        <PermissionDenialBanner
          denials={[mockDenialTool]}
          onDismiss={jest.fn()}
          onAccept={onAccept}
        />
      );
      fireEvent.press(screen.getByText("Accept & retry"));
      expect(onAccept).toHaveBeenCalledTimes(1);
    });
  });
});
