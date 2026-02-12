# Mobile app test suite

## Structure

- **`sequences/`** – Claude output log fixtures for mock replay. Each `.log` file is one session. See `sequences/README.md` for file descriptions.
- **`src/components/__tests__/`** – Component unit tests (AskQuestionModal, PermissionDenialBanner, etc.).

## Running tests

```bash
cd apps/mobile
npm test
```

## Replay a sequence (mock mode)

From repo root:

```bash
MOCK_CLAUDE=1 MOCK_CLAUDE_LOG=apps/mobile/__tests__/sequences/ask-single-python-purpose.log npm start
```
