/**
 * Component tests for MessageBubble.
 * Tests rendering for different message roles, code references, and terminated state.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { MessageBubble } from "../MessageBubble";
import type { Message } from "../../core/types";

describe("MessageBubble", () => {
  describe("user messages", () => {
    it("renders user message with content", () => {
      const message: Message = {
        id: "1",
        role: "user",
        content: "Hello, Claude!",
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText("Hello, Claude!")).toBeTruthy();
    });
  });

  describe("assistant messages", () => {
    it("renders assistant message with content", () => {
      const message: Message = {
        id: "2",
        role: "assistant",
        content: "Hello! How can I help you today?",
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText("Hello! How can I help you today?")).toBeTruthy();
    });
  });

  describe("system messages", () => {
    it("renders system message with content", () => {
      const message: Message = {
        id: "3",
        role: "system",
        content: "Claude needs your input.",
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText("Claude needs your input.")).toBeTruthy();
    });
  });

  describe("code references", () => {
    it("renders code reference pills", () => {
      const message: Message = {
        id: "4",
        role: "user",
        content: "Check this code",
        codeReferences: [
          { path: "/src/components/App.tsx", startLine: 10, endLine: 20 },
        ],
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText(/App\.tsx/)).toBeTruthy();
      expect(screen.getByText(/10-20/)).toBeTruthy();
    });

    it("shows single line number when start equals end", () => {
      const message: Message = {
        id: "5",
        role: "user",
        content: "",
        codeReferences: [
          { path: "/src/utils.ts", startLine: 5, endLine: 5 },
        ],
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText(/utils\.ts \(5\)/)).toBeTruthy();
    });

    it("renders multiple code reference pills", () => {
      const message: Message = {
        id: "6",
        role: "user",
        content: "Multiple refs",
        codeReferences: [
          { path: "/src/a.ts", startLine: 1, endLine: 5 },
          { path: "/src/b.ts", startLine: 10, endLine: 15 },
          { path: "/src/c.ts", startLine: 20, endLine: 20 },
        ],
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText(/a\.ts/)).toBeTruthy();
      expect(screen.getByText(/b\.ts/)).toBeTruthy();
      expect(screen.getByText(/c\.ts/)).toBeTruthy();
    });

    it("shows diamond icon for code references", () => {
      const message: Message = {
        id: "7",
        role: "assistant",
        content: "See file",
        codeReferences: [
          { path: "/src/file.ts", startLine: 1, endLine: 10 },
        ],
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText("◇")).toBeTruthy();
    });

    it("renders message with only code references (no content)", () => {
      const message: Message = {
        id: "8",
        role: "user",
        content: "",
        codeReferences: [
          { path: "/src/important.ts", startLine: 100, endLine: 150 },
        ],
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText(/important\.ts/)).toBeTruthy();
      expect(screen.getByText(/100-150/)).toBeTruthy();
    });
  });

  describe("terminated label", () => {
    it("applies terminated style when isTerminatedLabel is true", () => {
      const message: Message = {
        id: "9",
        role: "assistant",
        content: "Terminated",
      };

      render(<MessageBubble message={message} isTerminatedLabel />);

      const text = screen.getByText("Terminated");
      expect(text).toBeTruthy();
      // The text should not be selectable when terminated
      expect(text.props.selectable).toBe(false);
    });

    it("renders assistant content with markdown (not terminated)", () => {
      const message: Message = {
        id: "10",
        role: "assistant",
        content: "Regular content",
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText("Regular content")).toBeTruthy();
    });
  });

  describe("file name extraction", () => {
    it("extracts filename from path with forward slashes", () => {
      const message: Message = {
        id: "11",
        role: "user",
        content: "",
        codeReferences: [
          { path: "/home/user/project/src/deep/nested/File.tsx", startLine: 1, endLine: 1 },
        ],
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText(/File\.tsx/)).toBeTruthy();
    });

    it("extracts filename from path with backslashes", () => {
      const message: Message = {
        id: "12",
        role: "user",
        content: "",
        codeReferences: [
          { path: "C:\\Users\\dev\\project\\Component.tsx", startLine: 1, endLine: 1 },
        ],
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText(/Component\.tsx/)).toBeTruthy();
    });

    it("handles path with trailing slash", () => {
      const message: Message = {
        id: "13",
        role: "user",
        content: "",
        codeReferences: [
          { path: "/src/folder/", startLine: 1, endLine: 1 },
        ],
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText(/folder/)).toBeTruthy();
    });

    it("handles simple filename without path", () => {
      const message: Message = {
        id: "14",
        role: "user",
        content: "",
        codeReferences: [
          { path: "index.ts", startLine: 1, endLine: 1 },
        ],
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText(/index\.ts/)).toBeTruthy();
    });
  });

  describe("empty states", () => {
    it("renders without content when content is empty", () => {
      const message: Message = {
        id: "15",
        role: "assistant",
        content: "",
      };

      const { toJSON } = render(<MessageBubble message={message} />);

      // Should still render the bubble structure (placeholder for empty assistant content)
      expect(toJSON()).not.toBeNull();
      expect(screen.getByText("…")).toBeTruthy();
    });

    it("renders with empty code references array", () => {
      const message: Message = {
        id: "16",
        role: "user",
        content: "Message",
        codeReferences: [],
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText("Message")).toBeTruthy();
      expect(screen.queryByText("◇")).toBeNull();
    });
  });
});
