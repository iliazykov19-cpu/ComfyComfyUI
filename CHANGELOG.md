# Changelog

## v2.5.0

### New
- **Run button in the live preview window.** PiP and pinned previews now have a Play button next to Interrupt — same logic as the panel's Run (batch counter, iterate / random tag modes, seed control). You can keep PiP open in a corner and queue more without going back to the main window.
- **Gallery filters by category, subcategory and tag.** New row of filter pills above the gallery (Categories / Subcategories / Tags). Multi-select with checkboxes; tag picker has search across EN label, RU label, value, and parent names; selected tags float to the top of the list with a preview thumbnail. Toggle "Match all / Match any" picks how multiple selections combine. Counter shows "filtered / total". Filtering uses `builderTagIds` for runs queued in v2.5.0+; older runs fall back to label-based matching.
- **Compact queue strip.** Above the active run card a one-line strip now renders one tiny square per run with a colour-coded status (queued / running / success / error / cancelled). Click jumps to the run card, hover shows tags. Big batches (50+) no longer feel like the app froze — every run is visible at a glance. The full Run history block auto-collapses when there are more than 5 runs so the page stays light.
- **Tag preview thumbnails in Prompt Builder.** Tag buttons can now carry a preview image of the character/concept. Each generated image in a run card has a "Use as preview" button; pick a tag from the list of tags used in that run and the picture sticks to that tag's button. Hover a tag button — the picture also pops up enlarged next to the cursor (320px) so you can see it clearly.
- **Active-selection markers on category and subcategory chips.** Each chip in Prompt Builder gets an amber border and a small badge with the count of selected tags inside it. No more hunting through every category to remember what you already picked.

### Library
- **+320 tags across anime, games, and erotic clothing.** Anime girls grew with new subcategories (Fate, Highschool DxD, Fairy Tail, Akame ga Kill, Cowboy Bebop / Trigun, Black Lagoon / Hellsing, Kakegurui, Steins;Gate / Monogatari, Code Geass / 86, Dungeon Meshi / Apothecary, Eminence in Shadow / Solo Leveling, Quintessential Quintuplets / Bunny Senpai, Dandadan / Yofukashi, Black Clover / Fire Force, Goblin Slayer / Konosuba+, Mushoku Tensei / Re:Zero+, How NOT to Summon a Demon Lord) plus extra characters in existing folders (Naruto, Demon Slayer, JJK, MHA, Chainsaw Man, AoT, Re:Zero, Frieren, Spy x Family, Evangelion). Game girls picked up Zenless Zone Zero, Wuthering Waves, Nikke, Arknights / Azur Lane, Blue Archive (adults), Path / Diablo / Last Epoch, Other FPS / Action, Destiny / Halo / Warhammer, plus much more Genshin (20 added: Hu Tao, Mona, Yelan, Eula, Ningguang, Yae Miko, Raiden, Furina, Arlecchino, Clorinde, Mavuika…), Honkai Star Rail (14 added), expanded Resident Evil, Overwatch, Cyberpunk / Mass Effect, Witcher / Skyrim, League of Legends + Arcane, Valorant, Tekken / MK, FF, P5, BG3. Erotic clothing got 36 new entries (micro/sling bikini, sheer mesh, latex catsuit, shibari rope harness, body chain, bunny suit, cupless / peek-a-boo, side-tie thong, bath towel only, oversized shirt only…).

### Fixes
- **Bind-preview dialog layout.** The "Use as preview" modal had a broken layout — image, helper text and tag list overflowed because the base `DialogContent` grid fought the inner `space-y` blocks. Rewritten as a fixed-height flex column (header / hero / scrollable list) with explicit padding and `max-h: 80vh`.
- **Gallery filter dropdowns no longer get clipped.** The popovers were rendered inside `<Card>`, which has `overflow: hidden`, so the picker list was cut off. The popover now portals to `document.body` and positions itself with measured `getBoundingClientRect`, so it's never trapped by an ancestor's overflow.
- **PiP and pinned preview survive page navigation.** Previously the PiP window closed when leaving `/panel` because `PreviewWindow` (and therefore the PiP portal) lived inside that page. The PiP window plus its `LivePreview` portal are now mounted at the providers level, with state in a Zustand store. Switching between `/panel` and `/gallery` keeps the PiP window open; `object_info` is read from the shared react-query cache.
- **Random mode now actually feels random.** A sliding window of recent picks (~½ of the group size) is excluded from the next draw, so the same tag can no longer come up two or three times in a row. With small groups (e.g. 5 tags) at least the previous 2 are blocked; with larger groups the cooldown is wider.
- **Interrupt during batch runs no longer freezes the PiP preview.** Previously `currentPromptId` pointed to the *last queued* run, so live previews were attached to a queued run rather than to the actually-running one. Pressing Interrupt in PiP marked that queued run as `cancelled`, and the next run that ComfyUI started was not picked up by the preview window. `currentPromptId` is now updated on `execution_start`, so it always reflects the currently executing prompt — the next run in a batch is shown in PiP immediately after an interrupt.

## v2.0.2

### UX
- **Click the lightbox image to close it.** Tapping the picture (or the dimmed area around it) now closes the viewer — no need to hunt for the ✕ button. Hover shows a `zoom-out` cursor as a hint. Navigation arrows and the thumbnail strip continue to work as before.

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
