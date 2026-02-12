/**
 * Unit tests for claudeEventStrategies.
 * Tests the event dispatcher and handlers for Claude stream events.
 */

import { createClaudeEventDispatcher, ClaudeEventContext } from "../claudeEventStrategies";
import type { PermissionDenial, PendingAskUserQuestion } from "../types";

interface MockContext extends ClaudeEventContext {
  calls: Record<string, unknown[][]>;
  getAssistantContent: () => string;
}

function createMockContext(): MockContext {
  const calls: Record<string, unknown[][]> = {
    setPermissionDenials: [],
    setPendingRender: [],
    setModelName: [],
    setWaitingForUserInput: [],
    setPendingAskQuestion: [],
    addMessage: [],
    appendAssistantText: [],
  };
  const state = { assistantContent: "" };

  return {
    calls,
    getAssistantContent: () => state.assistantContent,
    setPermissionDenials: (denials: PermissionDenial[] | null) => {
      calls.setPermissionDenials.push([denials]);
    },
    setPendingRender: (value: { command: string; url: string } | null) => {
      calls.setPendingRender.push([value]);
    },
    setModelName: (name: string) => {
      calls.setModelName.push([name]);
    },
    setWaitingForUserInput: (value: boolean) => {
      calls.setWaitingForUserInput.push([value]);
    },
    setPendingAskQuestion: (value: PendingAskUserQuestion | null) => {
      calls.setPendingAskQuestion.push([value]);
    },
    addMessage: (role: string, content: string, codeReferences?: unknown[]) => {
      calls.addMessage.push([role, content, codeReferences]);
      return "msg-id";
    },
    appendAssistantText: (chunk: string) => {
      state.assistantContent += chunk;
      calls.appendAssistantText.push([chunk]);
    },
    getCurrentAssistantContent: () => state.assistantContent,
    deduplicateDenials: (denials: PermissionDenial[]) => denials,
  };
}

describe("createClaudeEventDispatcher", () => {
  describe("system event", () => {
    it("sets model name from system event", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        type: "system",
        model: "claude-sonnet-4",
        session_id: "sess-123",
        cwd: "/workspace",
      });

      expect(ctx.calls.setModelName).toEqual([["claude-sonnet-4"]]);
    });

    it("does not call setModelName if model is missing", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        type: "system",
        session_id: "sess-123",
      });

      expect(ctx.calls.setModelName).toEqual([]);
    });
  });

  describe("assistant event", () => {
    it("appends text from assistant message content", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Hello, " },
            { type: "text", text: "world!" },
          ],
        },
      });

      expect(ctx.getAssistantContent()).toBe("Hello, world!");
    });

    it("ignores non-text content blocks", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Text content" },
            { type: "tool_use", id: "tool-1" },
          ],
        },
      });

      expect(ctx.getAssistantContent()).toBe("Text content");
    });

    it("appends only delta when content already exists", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      // First message
      dispatch({
        type: "assistant",
        message: { content: [{ type: "text", text: "Hello" }] },
      });

      // Second message with full text (simulating stream end)
      dispatch({
        type: "assistant",
        message: { content: [{ type: "text", text: "Hello, world!" }] },
      });

      expect(ctx.getAssistantContent()).toBe("Hello, world!");
      expect(ctx.calls.appendAssistantText).toEqual([["Hello"], [", world!"]]);
    });

    it("does nothing when content is empty", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        type: "assistant",
        message: { content: [] },
      });

      expect(ctx.calls.appendAssistantText).toEqual([]);
    });
  });

  describe("stream_event", () => {
    it("appends text from content_block_delta events", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "streaming " },
        },
      });

      dispatch({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "text" },
        },
      });

      expect(ctx.getAssistantContent()).toBe("streaming text");
    });

    it("ignores non-content_block_delta events", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        type: "stream_event",
        event: { type: "message_start" },
      });

      expect(ctx.calls.appendAssistantText).toEqual([]);
    });
  });

  describe("input event", () => {
    it("sets waiting for user input and adds system message", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        type: "input",
        tool_name: "UserInput",
        prompt: "Please enter your name",
      });

      expect(ctx.calls.setWaitingForUserInput).toEqual([[true]]);
      expect(ctx.calls.addMessage).toHaveLength(1);
      expect(ctx.calls.addMessage[0][0]).toBe("system");
      expect(ctx.calls.addMessage[0][1]).toContain("UserInput request:");
      expect(ctx.calls.addMessage[0][1]).toContain("Please enter your name");
    });

    it("uses fallback tool name when missing", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        type: "input",
        prompt: "Enter something",
      });

      expect(ctx.calls.addMessage[0][1]).toContain("Tool request:");
    });

    it("uses description when prompt is missing", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        type: "input",
        tool_name: "CustomTool",
        description: "Tool description here",
      });

      expect(ctx.calls.addMessage[0][1]).toContain("Tool description here");
    });
  });

  describe("permission_request event", () => {
    it("handles permission_request same as input", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        type: "permission_request",
        tool_name: "Bash",
        message: "Run command?",
      });

      expect(ctx.calls.setWaitingForUserInput).toEqual([[true]]);
      expect(ctx.calls.addMessage[0][1]).toContain("Bash request:");
    });
  });

  describe("user and result events", () => {
    it("handles user event without action", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({ type: "user", content: "user message" });

      // user handler is a no-op
      expect(ctx.calls.addMessage).toEqual([]);
    });

    it("handles result event without action", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({ type: "result", status: "success" });

      // result handler is a no-op
      expect(ctx.calls.addMessage).toEqual([]);
    });
  });

  describe("permission_denials handling", () => {
    it("sets permission denials from data", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      const denials: PermissionDenial[] = [
        { tool_name: "Bash" },
        { tool_name: "Write" },
      ];

      dispatch({ permission_denials: denials });

      expect(ctx.calls.setPermissionDenials).toEqual([[denials]]);
      expect(ctx.calls.setPendingRender).toEqual([[null]]);
    });

    it("sets permission denials to null when filtered list is empty", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      // AskUserQuestion denials are filtered out
      dispatch({
        permission_denials: [
          {
            tool_name: "AskUserQuestion",
            tool_use_id: "tool-1",
            tool_input: { questions: [{ header: "Test", options: [] }] },
          },
        ],
      });

      expect(ctx.calls.setPermissionDenials).toEqual([[null]]);
    });

    it("extracts AskUserQuestion from denials and sets pending", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        permission_denials: [
          {
            tool_name: "AskUserQuestion",
            tool_use_id: "tool-ask-1",
            tool_input: {
              questions: [
                { header: "Purpose", question: "What should this do?", options: [{ label: "A" }] },
              ],
            },
          },
        ],
      });

      expect(ctx.calls.setPendingAskQuestion).toHaveLength(1);
      const pending = ctx.calls.setPendingAskQuestion[0][0] as PendingAskUserQuestion;
      expect(pending.tool_use_id).toBe("tool-ask-1");
      expect(pending.questions).toHaveLength(1);
      expect(pending.questions[0].header).toBe("Purpose");
      expect(ctx.calls.setWaitingForUserInput).toEqual([[true]]);
    });

    it("preserves non-AskUserQuestion denials while extracting AskUserQuestion", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        permission_denials: [
          { tool_name: "Bash" },
          {
            tool_name: "AskUserQuestion",
            tool_use_id: "tool-ask-1",
            tool_input: { questions: [{ header: "Q", options: [] }] },
          },
          { tool_name: "Write" },
        ],
      });

      const denials = ctx.calls.setPermissionDenials[0][0] as PermissionDenial[];
      expect(denials).toHaveLength(2);
      expect(denials.map((d) => d.tool_name)).toEqual(["Bash", "Write"]);
    });
  });

  describe("AskUserQuestion payload (direct)", () => {
    it("sets pending ask question from direct payload", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        tool_name: "AskUserQuestion",
        tool_use_id: "direct-ask-1",
        tool_input: {
          questions: [
            {
              header: "Style",
              question: "Choose style",
              options: [{ label: "Modern" }, { label: "Classic" }],
              multiSelect: false,
            },
          ],
        },
      });

      expect(ctx.calls.setPendingAskQuestion).toHaveLength(1);
      const pending = ctx.calls.setPendingAskQuestion[0][0] as PendingAskUserQuestion;
      expect(pending.tool_use_id).toBe("direct-ask-1");
      expect(pending.questions[0].header).toBe("Style");
      expect(pending.questions[0].options).toHaveLength(2);
      expect(ctx.calls.setWaitingForUserInput).toEqual([[true]]);
    });

    it("returns early after processing AskUserQuestion (does not run type handler)", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      dispatch({
        type: "assistant", // This type handler should NOT run
        tool_name: "AskUserQuestion",
        tool_use_id: "ask-1",
        tool_input: {
          questions: [{ header: "Q", options: [{ label: "A" }] }],
        },
      });

      // Should set pending but NOT append assistant text
      expect(ctx.calls.setPendingAskQuestion).toHaveLength(1);
      expect(ctx.calls.appendAssistantText).toEqual([]);
    });
  });

  describe("unknown event type", () => {
    it("does not crash for unknown type", () => {
      const ctx = createMockContext();
      const dispatch = createClaudeEventDispatcher(ctx);

      expect(() => dispatch({ type: "unknown_type" })).not.toThrow();
    });
  });
});
