/**
 * Unit tests for claudeStream utility functions.
 * Tests ANSI stripping, regex patterns, type guards, and helper functions.
 */

import {
  stripAnsi,
  stripTrailingIncompleteTag,
  extractRenderCommandAndUrl,
  isAskUserQuestionPayload,
  isClaudeStream,
  deniedToolToAllowedPattern,
  getAllowedToolsFromDenials,
  RENDER_CMD_REGEX,
  RENDER_URL_REGEX,
  NEED_PERMISSION_REGEX,
} from "../claudeStream";

describe("claudeStream utilities", () => {
  describe("stripAnsi", () => {
    it("returns empty string for empty input", () => {
      expect(stripAnsi("")).toBe("");
    });

    it("returns empty string for null/undefined input", () => {
      expect(stripAnsi(null as unknown as string)).toBe("");
      expect(stripAnsi(undefined as unknown as string)).toBe("");
    });

    it("returns plain text unchanged", () => {
      expect(stripAnsi("Hello, World!")).toBe("Hello, World!");
    });

    it("strips basic ANSI color codes", () => {
      expect(stripAnsi("\x1B[31mRed text\x1B[0m")).toBe("Red text");
      expect(stripAnsi("\x1B[32mGreen\x1B[0m")).toBe("Green");
    });

    it("strips multiple ANSI codes", () => {
      expect(stripAnsi("\x1B[1m\x1B[31mBold Red\x1B[0m")).toBe("Bold Red");
    });

    it("strips cursor control sequences", () => {
      expect(stripAnsi("\x1B[2KCleared line")).toBe("Cleared line");
      expect(stripAnsi("\x1B[HHome position")).toBe("Home position");
    });

    it("strips OSC sequences (window title, etc.)", () => {
      expect(stripAnsi("\x1B]0;Window Title\x07Normal text")).toBe("Normal text");
    });

    it("handles mixed content correctly", () => {
      const input = "\x1B[32m✓\x1B[0m Test passed \x1B[31m(1ms)\x1B[0m";
      expect(stripAnsi(input)).toBe("✓ Test passed (1ms)");
    });
  });

  describe("stripTrailingIncompleteTag", () => {
    it("returns input unchanged for null/undefined", () => {
      expect(stripTrailingIncompleteTag(null as unknown as string)).toBeNull();
      expect(stripTrailingIncompleteTag(undefined as unknown as string)).toBeUndefined();
    });

    it("returns input unchanged for non-string values", () => {
      expect(stripTrailingIncompleteTag(123 as unknown as string)).toBe(123);
    });

    it("returns text unchanged when no incomplete tag", () => {
      expect(stripTrailingIncompleteTag("Hello world")).toBe("Hello world");
      expect(stripTrailingIncompleteTag("<div>Complete</div>")).toBe("<div>Complete</div>");
    });

    it("strips incomplete tag at end", () => {
      expect(stripTrailingIncompleteTag("Some text <u")).toBe("Some text");
      expect(stripTrailingIncompleteTag("Content <url")).toBe("Content");
      expect(stripTrailingIncompleteTag("Text <div")).toBe("Text");
    });

    it("preserves whitespace before tag", () => {
      expect(stripTrailingIncompleteTag("Text  <u")).toBe("Text");
    });

    it("does not strip complete tags", () => {
      expect(stripTrailingIncompleteTag("Text <u>underline</u>")).toBe("Text <u>underline</u>");
    });
  });

  describe("RENDER_CMD_REGEX", () => {
    it("matches valid render command format", () => {
      const text = 'Run the following command for render: "npm run dev"';
      const match = text.match(RENDER_CMD_REGEX);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe("npm run dev");
    });

    it("is case insensitive", () => {
      const text = 'RUN THE FOLLOWING COMMAND FOR RENDER: "yarn start"';
      const match = text.match(RENDER_CMD_REGEX);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe("yarn start");
    });

    it("handles commands with flags", () => {
      const text = 'Run the following command for render: "npx serve -p 3000"';
      const match = text.match(RENDER_CMD_REGEX);
      expect(match?.[1]).toBe("npx serve -p 3000");
    });
  });

  describe("RENDER_URL_REGEX", () => {
    it("matches valid URL format", () => {
      const text = 'URL for preview: "http://localhost:3000"';
      const match = text.match(RENDER_URL_REGEX);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe("http://localhost:3000");
    });

    it("is case insensitive", () => {
      const text = 'URL FOR PREVIEW: "http://localhost:8080"';
      const match = text.match(RENDER_URL_REGEX);
      expect(match?.[1]).toBe("http://localhost:8080");
    });
  });

  describe("NEED_PERMISSION_REGEX", () => {
    it("matches permission needed text", () => {
      const text = "Need permission for the following commands: npm install";
      expect(NEED_PERMISSION_REGEX.test(text)).toBe(true);
    });

    it("is case insensitive", () => {
      const text = "NEED PERMISSION FOR THE FOLLOWING COMMANDS:";
      expect(NEED_PERMISSION_REGEX.test(text)).toBe(true);
    });
  });

  describe("extractRenderCommandAndUrl", () => {
    it("returns null for null/undefined input", () => {
      expect(extractRenderCommandAndUrl(null)).toBeNull();
      expect(extractRenderCommandAndUrl(undefined)).toBeNull();
    });

    it("returns null for non-string input", () => {
      expect(extractRenderCommandAndUrl(123 as unknown as string)).toBeNull();
    });

    it("returns null when text contains permission needed phrase", () => {
      const text = `Need permission for the following commands: npm run dev
Run the following command for render: "npm run dev"
URL for preview: "http://localhost:3000"`;
      expect(extractRenderCommandAndUrl(text)).toBeNull();
    });

    it("returns null when command is missing", () => {
      const text = 'URL for preview: "http://localhost:3000"';
      expect(extractRenderCommandAndUrl(text)).toBeNull();
    });

    it("returns null when URL is missing", () => {
      const text = 'Run the following command for render: "npm run dev"';
      expect(extractRenderCommandAndUrl(text)).toBeNull();
    });

    it("extracts both command and URL when present", () => {
      const text = `Run the following command for render: "npm run dev"
URL for preview: "http://localhost:3000"`;
      const result = extractRenderCommandAndUrl(text);
      expect(result).toEqual({
        command: "npm run dev",
        url: "http://localhost:3000",
      });
    });

    it("trims whitespace from extracted values", () => {
      const text = `Run the following command for render: "  npm start  "
URL for preview: "  http://localhost:5000  "`;
      const result = extractRenderCommandAndUrl(text);
      expect(result).toEqual({
        command: "npm start",
        url: "http://localhost:5000",
      });
    });
  });

  describe("isAskUserQuestionPayload", () => {
    it("returns false for null", () => {
      expect(isAskUserQuestionPayload(null)).toBe(false);
    });

    it("returns false for non-object types", () => {
      expect(isAskUserQuestionPayload("string")).toBe(false);
      expect(isAskUserQuestionPayload(123)).toBe(false);
      expect(isAskUserQuestionPayload(undefined)).toBe(false);
    });

    it("returns false when tool_name is not AskUserQuestion", () => {
      expect(isAskUserQuestionPayload({ tool_name: "Bash" })).toBe(false);
      expect(isAskUserQuestionPayload({ tool_name: "Write" })).toBe(false);
    });

    it("returns false when tool_input.questions is missing", () => {
      expect(isAskUserQuestionPayload({ tool_name: "AskUserQuestion" })).toBe(false);
      expect(isAskUserQuestionPayload({
        tool_name: "AskUserQuestion",
        tool_input: {},
      })).toBe(false);
    });

    it("returns false when questions is empty array", () => {
      expect(isAskUserQuestionPayload({
        tool_name: "AskUserQuestion",
        tool_input: { questions: [] },
      })).toBe(false);
    });

    it("returns true for valid AskUserQuestion payload", () => {
      expect(isAskUserQuestionPayload({
        tool_name: "AskUserQuestion",
        tool_input: {
          questions: [{ header: "Test", question: "What?" }],
        },
      })).toBe(true);
    });
  });

  describe("isClaudeStream", () => {
    it("returns false for null", () => {
      expect(isClaudeStream(null)).toBe(false);
    });

    it("returns false for non-object types", () => {
      expect(isClaudeStream("string")).toBe(false);
      expect(isClaudeStream(123)).toBe(false);
    });

    it("returns true for known type values", () => {
      expect(isClaudeStream({ type: "system" })).toBe(true);
      expect(isClaudeStream({ type: "assistant" })).toBe(true);
      expect(isClaudeStream({ type: "result" })).toBe(true);
      expect(isClaudeStream({ type: "user" })).toBe(true);
      expect(isClaudeStream({ type: "input" })).toBe(true);
      expect(isClaudeStream({ type: "permission_request" })).toBe(true);
      expect(isClaudeStream({ type: "stream_event" })).toBe(true);
    });

    it("returns false for unknown type", () => {
      expect(isClaudeStream({ type: "unknown" })).toBe(false);
    });

    it("returns true when permission_denials array is present", () => {
      expect(isClaudeStream({ permission_denials: [] })).toBe(true);
      expect(isClaudeStream({ permission_denials: [{ tool_name: "Bash" }] })).toBe(true);
    });

    it("returns true for AskUserQuestion payload", () => {
      expect(isClaudeStream({
        tool_name: "AskUserQuestion",
        tool_input: { questions: [{ header: "Test" }] },
      })).toBe(true);
    });
  });

  describe("deniedToolToAllowedPattern", () => {
    it("returns null for null/undefined/non-string input", () => {
      expect(deniedToolToAllowedPattern(null)).toBeNull();
      expect(deniedToolToAllowedPattern(undefined)).toBeNull();
      expect(deniedToolToAllowedPattern(123 as unknown as string)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(deniedToolToAllowedPattern("")).toBeNull();
    });

    it("returns Bash(*) for Bash tool", () => {
      expect(deniedToolToAllowedPattern("Bash")).toBe("Bash(*)");
      expect(deniedToolToAllowedPattern("  Bash  ")).toBe("Bash(*)");
    });

    it("returns tool name unchanged for Write, Edit, Read", () => {
      expect(deniedToolToAllowedPattern("Write")).toBe("Write");
      expect(deniedToolToAllowedPattern("Edit")).toBe("Edit");
      expect(deniedToolToAllowedPattern("Read")).toBe("Read");
    });

    it("returns tool name unchanged for other tools", () => {
      expect(deniedToolToAllowedPattern("WebFetch")).toBe("WebFetch");
      expect(deniedToolToAllowedPattern("CustomTool")).toBe("CustomTool");
    });
  });

  describe("getAllowedToolsFromDenials", () => {
    it("returns empty array for empty/null input", () => {
      expect(getAllowedToolsFromDenials([])).toEqual([]);
      expect(getAllowedToolsFromDenials(null as unknown as [])).toEqual([]);
    });

    it("extracts tool patterns from denials with tool_name", () => {
      const denials = [
        { tool_name: "Bash" },
        { tool_name: "Write" },
      ];
      expect(getAllowedToolsFromDenials(denials)).toEqual(["Bash(*)", "Write"]);
    });

    it("extracts tool patterns from denials with tool property", () => {
      const denials = [
        { tool: "Read" },
        { tool: "Edit" },
      ];
      expect(getAllowedToolsFromDenials(denials)).toEqual(["Read", "Edit"]);
    });

    it("prefers tool_name over tool property", () => {
      const denials = [
        { tool_name: "Bash", tool: "Write" },
      ];
      expect(getAllowedToolsFromDenials(denials)).toEqual(["Bash(*)"]);
    });

    it("deduplicates tool patterns", () => {
      const denials = [
        { tool_name: "Bash" },
        { tool_name: "Bash" },
        { tool_name: "Write" },
        { tool_name: "Write" },
      ];
      expect(getAllowedToolsFromDenials(denials)).toEqual(["Bash(*)", "Write"]);
    });

    it("preserves order of first occurrence", () => {
      const denials = [
        { tool_name: "Write" },
        { tool_name: "Bash" },
        { tool_name: "Read" },
      ];
      expect(getAllowedToolsFromDenials(denials)).toEqual(["Write", "Bash(*)", "Read"]);
    });

    it("skips denials with empty tool names", () => {
      const denials = [
        { tool_name: "" },
        { tool_name: "Bash" },
        { tool: "" },
      ];
      expect(getAllowedToolsFromDenials(denials)).toEqual(["Bash(*)"]);
    });
  });
});
