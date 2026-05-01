# Changelog

## v2.0.1

- **Sound on finish** — plays a soft chime when a run transitions to `success` / `error`. Picker dropdown in the run toolbar with **6 options** (Off, Chime, Marimba, Bell, Pluck, Soft beep), each previewable via a ▶ button. All sounds are generated on the fly through the Web Audio API — no audio files, no external assets. Default: Chime. Setting persists in `localStorage`. Dropdown renders through a React portal so it isn't clipped by run cards underneath.
- **Run button is no longer disabled while a generation is running.** Pressing it now queues another prompt — the label switches to "Queue more" / "В очередь" and the request goes straight to ComfyUI's queue.
- **New starter pack — 505 tags** in 11 categories (was 374 in 10):
  - Anime girls — added Oshi no Ko, Lycoris Recoil, Kaguya-sama, Vocaloid / Idols, Toilet-Bound Hanako-kun and a few new characters in existing folders (e.g. Konosuba: Eris, Chris).
  - Game girls — added Witcher / Skyrim, League of Legends, Apex / Valorant, Tomb Raider, Bayonetta / DMC, Dead or Alive / SoulCalibur, Baldur's Gate 3.
  - Poses — more standing/sitting/lying tags, new "Action" subcategory (sword stance, gun pose, magic cast, etc.), more suggestive tags.
  - Clothing — many new casual items (oversized sweater, leather jacket, trench, overalls, pajamas), expanded sensual / beach (corset, babydoll, off-shoulder, underboob, wet white shirt, …) and a new "Cosplay" subcategory (nurse, stewardess, ninja, angel, demon, mermaid, cyborg…).
- **New category — View & Camera (Ракурс и камера)** — separates camera angle (from above/below/behind/side, POV, dutch angle, bird's eye…), framing (portrait / cowboy / full body / wide / extreme close-up / group), and depth/focus (bokeh, shallow / deep DOF, telephoto, fisheye). Removed the old "Camera framing" subfolder from Poses.

## v2.0.0

- **Prompt builder** — floating, draggable, resizable window with a two-level tag library (Categories → Subcategories → Tags) and ~370 starter tags across 10 categories. Tags are `{ label, labelRu, value }` so a short Russian/English name like `Aqua` can stand for a long Booru-style string, while final prompts always go to the model in English. Free text input, prefix/suffix, full-library search (EN label, RU label, value), bind any STRING input on the panel via 🔗 toggle.
- **Iterate / Random** modes per category and subcategory — cycle the next tag or pick a random one on every Run. Works inside batch runs too.
- **Batch runs** — number-of-runs field next to Run; queues N consecutive prompts with seed-control and iterate/random applied between each.
- **Persistent runs** — current and recent runs (with their final images) survive a page reload.
- **Run names from prompt builder** — active builder tags are stored on the run and shown in the run cards, live preview and Gallery.
- **Per-run interrupt** — every queued/running card has its own ◻ button. Toolbar's Interrupt clears the entire pending queue.
- **Output source filters** — main panel uses multi-select checkboxes; live-preview window (PiP / pinned) has an independent single-source selector (native `<select>` so it works inside Document Picture-in-Picture).
- **Lightbox** — full-screen viewer with prev/next/keyboard navigation, thumbnails, download.
- **Drag & drop reordering** of node cards, **per-block colors** (11-color palette), **1 / 2 / 3 column** view switcher.
- **Bilingual UI** — English / Русский, switchable in the header. Tag labels carry an optional Russian display name.
- ComfyUI DNS-rebinding 403 properly bypassed for both REST and WS via the bundled `server.js` (Origin/Referer rewrite + WebSocket proxy).
- Soft "Web 2.0" pastel palette in the prompt builder, slightly larger base font for readability.

## v1.0.0

- Initial release: dashboard, workflow import (drag & drop, file, paste, "import from history/queue"), dynamic panel with all input widgets (slider/number/textarea/select-with-filter/switch/seed), runner with WebSocket live progress, gallery, presets.
