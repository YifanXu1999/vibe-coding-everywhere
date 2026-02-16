#!/usr/bin/env node
/**
 * Print the full system prompt that would be sent to Claude (--system-prompt).
 * Run from repo root: npm run prompt:print   or   node scripts/print-system-prompt.mjs
 */
import { getChatSystemPrompt } from "../server/prompts/index.js";

const prompt = getChatSystemPrompt();
console.log(prompt);
