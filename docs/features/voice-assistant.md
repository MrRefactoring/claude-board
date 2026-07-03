# Voice Assistant

Hands-free board control via speech: create tasks, check status, and move tasks through a conversational flow (voice or typed).

## Behavior
- Opened via the floating mic button (bottom-right) or **Alt+V**, which also toggles the mic while the panel is open.
- Built as a plugin-style command registry: each command declares its trigger patterns, a multi-step flow state machine, and an execute function; new commands just get added to `commands/index.js` — no other files change.
- Voice and typed input are parsed identically through the intent parser; entity extractors pull out type/priority/model from free text.
- Text-to-speech reads responses aloud (mutable via the speaker icon); a Web Audio–driven waveform visualizer shows mic input; rising/falling beeps mark listen start/stop; idle state shows clickable command-hint chips.

## Commands
- **"Create task"** — multi-step flow: title → description (or "skip") → type → priority → confirm
- **"List tasks"** — reports task counts by status
- **"Change status"** — guided flow to move a task to a new status
- **"Help"** — lists available commands
- **"Cancel"** — aborts any active flow

## Edge cases
- Speech recognition requires the Web Speech API: full support in Chrome/Edge, synthesis-only in Safari (no recognition), limited in Firefox. If recognition isn't available, the mic button is disabled but text input still works.
- Voice dictation on the task creation modal's title/description fields is a separate, simpler mic feature — independent of the assistant panel.

## Key code
- `client/src/features/voice/VoiceAssistant.tsx` — FAB + panel shell, Alt+V binding
- `client/src/features/voice/VoiceAssistantProvider.tsx` — state machine / context
- `client/src/features/voice/engine/` — `ttsEngine.ts`, `sttEngine.ts`, `soundEffects.ts`
- `client/src/features/voice/intent/` — `intentParser.ts`, `entityExtractors.ts`
- `client/src/features/voice/commands/` — `commandRegistry.ts` + one file per command
- `client/src/features/voice/i18n/` — command patterns and strings per language
