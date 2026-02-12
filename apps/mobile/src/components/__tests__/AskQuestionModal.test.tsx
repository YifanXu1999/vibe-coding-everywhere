/**
 * UI behavior tests: AskUserQuestion modal
 *
 * Covers the flow when Claude uses AskUserQuestion (e.g. "What should the Python file do?").
 * Mock data and expected UI are based on sequences in workspace/claude-output.log:
 *
 * Log sequence that leads to modal:
 * - Line 5: type "assistant", message.content[0] = { type: "tool_use", id, name: "AskUserQuestion", input: { questions } }
 * - Line 8: type "result", permission_denials[0] = { tool_name: "AskUserQuestion", tool_use_id, tool_input: { questions } }
 * When the app processes either shape (after normalization), setPendingAskQuestion is called and this modal shows.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { AskQuestionModal } from "../AskQuestionModal";
import type { PendingAskUserQuestion, AskUserQuestionItem } from "../../core/types";

// ─── Mock data: from claude-output.log sequences ─────────────────────────────
// Single-question payload (normalized from log line 5 assistant.content[0] or line 8 result.permission_denials[0])

const singleQuestion: AskUserQuestionItem = {
  header: "Purpose",
  question: "What should the Python file do or contain?",
  options: [
    { label: "Script template", description: "A basic Python script with main function and argument parsing" },
    { label: "Class template", description: "A Python file with a sample class structure" },
    { label: "Flask/FastAPI app", description: "A basic web application template" },
    { label: "Utility functions", description: "A module with common utility functions" },
  ],
  multiSelect: false,
};

/** Normalized pending from log: toolu_01Cf9n8KP5qwg4itxRSkinvx (line 5 / line 8). */
const mockPendingSingle: PendingAskUserQuestion = {
  tool_use_id: "toolu_01Cf9n8KP5qwg4itxRSkinvx",
  questions: [singleQuestion],
};

const twoQuestions: PendingAskUserQuestion = {
  tool_use_id: "toolu_01N9Q6a2dwmxrpzZJXTeVMZW",
  questions: [
    {
      header: "Purpose",
      question: "What is the landing page for?",
      options: [
        { label: "Product/SaaS", description: "Showcase and sell a software product or service" },
        { label: "Portfolio", description: "Personal or business portfolio showcasing work" },
      ],
      multiSelect: false,
    },
    {
      header: "Style",
      question: "What style do you prefer for the design?",
      options: [
        { label: "Modern minimal", description: "Clean lines, lots of whitespace, simple colors" },
        { label: "Dark theme", description: "Dark background with contrasting elements" },
      ],
      multiSelect: false,
    },
  ],
};

const multiSelectQuestion: PendingAskUserQuestion = {
  tool_use_id: "toolu_multi",
  questions: [
    {
      header: "Features",
      question: "Select all that apply",
      options: [
        { label: "A" },
        { label: "B" },
        { label: "C" },
      ],
      multiSelect: true,
    },
  ],
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("AskQuestionModal", () => {
  describe("visibility", () => {
    it("returns null when pending is null", () => {
      const { toJSON } = render(
        <AskQuestionModal pending={null} onSubmit={jest.fn()} onCancel={jest.fn()} />
      );
      expect(toJSON()).toBeNull();
    });

    it("returns null when pending has no questions", () => {
      const { toJSON } = render(
        <AskQuestionModal
          pending={{ tool_use_id: "x", questions: [] }}
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      expect(toJSON()).toBeNull();
    });

    it("renders modal when pending has questions", () => {
      render(
        <AskQuestionModal
          pending={mockPendingSingle}
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      expect(screen.getByText("Please choose")).toBeTruthy();
      expect(screen.getByText("What should the Python file do or contain?")).toBeTruthy();
    });

    it("log sequence: after pending set from result.permission_denials (log line 8), modal shows", () => {
      const { rerender } = render(
        <AskQuestionModal pending={null} onSubmit={jest.fn()} onCancel={jest.fn()} />
      );
      expect(screen.queryByText("Please choose")).toBeNull();

      rerender(
        <AskQuestionModal
          pending={mockPendingSingle}
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      expect(screen.getByText("Please choose")).toBeTruthy();
      expect(screen.getByText("What should the Python file do or contain?")).toBeTruthy();
      expect(screen.getByText("Script template")).toBeTruthy();
      expect(screen.getByText("Confirm")).toBeTruthy();
      expect(screen.getByText("Cancel")).toBeTruthy();
    });

    it("log sequence: when pending cleared (e.g. after submit/exit), modal disappears", () => {
      const { rerender } = render(
        <AskQuestionModal
          pending={mockPendingSingle}
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      expect(screen.getByText("Please choose")).toBeTruthy();

      rerender(
        <AskQuestionModal pending={null} onSubmit={jest.fn()} onCancel={jest.fn()} />
      );
      expect(screen.queryByText("Please choose")).toBeNull();
    });
  });

  describe("content: single question", () => {
    it("shows header and question text and all options", () => {
      render(
        <AskQuestionModal
          pending={mockPendingSingle}
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      expect(screen.getByText("Purpose")).toBeTruthy();
      expect(screen.getByText("What should the Python file do or contain?")).toBeTruthy();
      expect(screen.getByText("Script template")).toBeTruthy();
      expect(screen.getByText("Class template")).toBeTruthy();
      expect(screen.getByText("Flask/FastAPI app")).toBeTruthy();
      expect(screen.getByText("Utility functions")).toBeTruthy();
    });

    it("shows option descriptions when present", () => {
      render(
        <AskQuestionModal
          pending={mockPendingSingle}
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      expect(screen.getByText(/A basic Python script with main function/)).toBeTruthy();
    });
  });

  describe("content: multiple questions (flashcard)", () => {
    it("shows first question with stepper; Next reveals second question", () => {
      render(
        <AskQuestionModal pending={twoQuestions} onSubmit={jest.fn()} onCancel={jest.fn()} />
      );
      expect(screen.getByText("What is the landing page for?")).toBeTruthy();
      expect(screen.getByText("Product/SaaS")).toBeTruthy();
      expect(screen.getByText("1 of 2")).toBeTruthy();
      expect(screen.getByText("Next →")).toBeTruthy();

      fireEvent.press(screen.getByText("Portfolio"));
      fireEvent.press(screen.getByText("Next →"));
      expect(screen.getByText("What style do you prefer for the design?")).toBeTruthy();
      expect(screen.getByText("Modern minimal")).toBeTruthy();
      expect(screen.getByText("2 of 2")).toBeTruthy();
      expect(screen.getByText("Confirm")).toBeTruthy();
    });
  });

  describe("selection: single-select", () => {
    it("Confirm does nothing when no option selected; after selecting one, Confirm submits", () => {
      const onSubmit = jest.fn();
      render(
        <AskQuestionModal
          pending={mockPendingSingle}
          onSubmit={onSubmit}
          onCancel={jest.fn()}
        />
      );
      fireEvent.press(screen.getByText("Confirm"));
      expect(onSubmit).not.toHaveBeenCalled();

      fireEvent.press(screen.getByText("Script template"));
      fireEvent.press(screen.getByText("Confirm"));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0][0].selected).toEqual(["Script template"]);
    });

    it("selecting another option replaces selection (single-select)", () => {
      const onSubmit = jest.fn();
      render(
        <AskQuestionModal
          pending={mockPendingSingle}
          onSubmit={onSubmit}
          onCancel={jest.fn()}
        />
      );
      fireEvent.press(screen.getByText("Script template"));
      fireEvent.press(screen.getByText("Class template"));
      fireEvent.press(screen.getByText("Confirm"));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0][0].selected).toEqual(["Class template"]);
    });
  });

  describe("selection: multi-select", () => {
    it("allows selecting multiple options and submit includes all", () => {
      const onSubmit = jest.fn();
      render(
        <AskQuestionModal
          pending={multiSelectQuestion}
          onSubmit={onSubmit}
          onCancel={jest.fn()}
        />
      );
      fireEvent.press(screen.getByText("A"));
      fireEvent.press(screen.getByText("B"));
      fireEvent.press(screen.getByText("Confirm"));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0][0].selected).toContain("A");
      expect(onSubmit.mock.calls[0][0][0].selected).toContain("B");
      expect(onSubmit.mock.calls[0][0][0].selected).toHaveLength(2);
    });
  });

  describe("actions: Cancel", () => {
    it("calls onCancel when Cancel is pressed", () => {
      const onCancel = jest.fn();
      render(
        <AskQuestionModal
          pending={mockPendingSingle}
          onSubmit={jest.fn()}
          onCancel={onCancel}
        />
      );
      fireEvent.press(screen.getByText("Cancel"));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("does not call onSubmit when Cancel is pressed", () => {
      const onSubmit = jest.fn();
      const onCancel = jest.fn();
      render(
        <AskQuestionModal
          pending={mockPendingSingle}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      );
      fireEvent.press(screen.getByText("Script template"));
      fireEvent.press(screen.getByText("Cancel"));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("actions: Confirm / Submit", () => {
    it("calls onSubmit with answers when Confirm is pressed after selection", () => {
      const onSubmit = jest.fn();
      render(
        <AskQuestionModal
          pending={mockPendingSingle}
          onSubmit={onSubmit}
          onCancel={jest.fn()}
        />
      );
      fireEvent.press(screen.getByText("Utility functions"));
      fireEvent.press(screen.getByText("Confirm"));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [answers] = onSubmit.mock.calls[0];
      expect(answers).toHaveLength(1);
      expect(answers[0].header).toBe("Purpose");
      expect(answers[0].selected).toEqual(["Utility functions"]);
    });

    it("calls onSubmit with one selected per question for two questions (flashcard flow)", () => {
      const onSubmit = jest.fn();
      render(
        <AskQuestionModal pending={twoQuestions} onSubmit={onSubmit} onCancel={jest.fn()} />
      );
      fireEvent.press(screen.getByText("Portfolio"));
      fireEvent.press(screen.getByText("Next →"));
      fireEvent.press(screen.getByText("Dark theme"));
      fireEvent.press(screen.getByText("Confirm"));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [answers] = onSubmit.mock.calls[0];
      expect(answers).toHaveLength(2);
      expect(answers[0]).toEqual({ header: "Purpose", selected: ["Portfolio"] });
      expect(answers[1]).toEqual({ header: "Style", selected: ["Dark theme"] });
    });

    it("allows going back to edit choice before confirming", () => {
      const onSubmit = jest.fn();
      render(
        <AskQuestionModal pending={twoQuestions} onSubmit={onSubmit} onCancel={jest.fn()} />
      );
      fireEvent.press(screen.getByText("Portfolio"));
      fireEvent.press(screen.getByText("Next →"));
      fireEvent.press(screen.getByText("Dark theme"));
      fireEvent.press(screen.getByText("← Back"));
      fireEvent.press(screen.getByText("Product/SaaS"));
      fireEvent.press(screen.getByText("Next →"));
      fireEvent.press(screen.getByText("Confirm"));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [answers] = onSubmit.mock.calls[0];
      expect(answers[0]).toEqual({ header: "Purpose", selected: ["Product/SaaS"] });
      expect(answers[1]).toEqual({ header: "Style", selected: ["Dark theme"] });
    });

    it("calls onSubmit with multiple selected for multiSelect question", () => {
      const onSubmit = jest.fn();
      render(
        <AskQuestionModal
          pending={multiSelectQuestion}
          onSubmit={onSubmit}
          onCancel={jest.fn()}
        />
      );
      fireEvent.press(screen.getByText("A"));
      fireEvent.press(screen.getByText("C"));
      fireEvent.press(screen.getByText("Confirm"));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [answers] = onSubmit.mock.calls[0];
      expect(answers[0].selected).toContain("A");
      expect(answers[0].selected).toContain("C");
      expect(answers[0].selected).toHaveLength(2);
    });

    it("does not call onSubmit when Confirm is pressed with no selection", () => {
      const onSubmit = jest.fn();
      render(
        <AskQuestionModal
          pending={mockPendingSingle}
          onSubmit={onSubmit}
          onCancel={jest.fn()}
        />
      );
      const confirmBtn = screen.getByText("Confirm");
      fireEvent.press(confirmBtn);
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
