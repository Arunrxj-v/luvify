# Hyperframes Composition Brief: Luvify studio

## Objective
Create a short launch-style brag video for Luvify studio — an AI website builder — in a cinematic, trailer-scale register, built entirely out of the product's real editorial interface.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 21.5s (scene durations in the plan sum to 21.4s; stay inside 15–25s)

## Source Material
- Project root: `/Users/arunrajv/Documents/projects/luvify`
- Primary files read: `apps/web/index.html`, `apps/web/src/styles.css`, `apps/web/src/App.tsx`, `apps/server/src/interview.ts`, `apps/server/src/seed.ts`, `packages/shared/src/answers.ts`, `packages/site-renderer/src/components/hero.tsx`, `packages/site-renderer/src/theme.ts`, `package.json`
- Product name: **Luvify** (interface wordmark: `Luvify` + weak `studio`, brand mark tile `L`)
- Tagline / strongest claim: "Describe your business. Get a website."
- Key UI or visual moment to recreate: the Interview tab workspace — 64px Lora question, help line, 2×2 option tiles, composer, right-hand Requirements panel with the orange meter; then the Preview tab iframe with the generated site
- Copy that must appear verbatim:
  - "Describe your business. Get a website."
  - "What is your business called?"
  - "The name that should appear in the logo and the footer."
  - "Harbour Bakery"
  - "Requirements 100%" / "Ready to build"
  - "Build website"
  - "Website architecture" / "4 pages"
  - "Home /" "Menu /menu" "About /about" "Contact /contact"
  - "Fresh bread, every morning"
  - "Sourdough, pastries and cakes baked on the harbourside"
  - "Place a pre-order"
  - "Export .zip" / "Publish"
  - "Luvify studio"
  - "All from the same validated document."

## Creative Direction
- Tone preset: cinematic
- Creative direction: "editorial product film" — a blockbuster trailer assembled from a warm, print-quiet studio interface
- Interpretation: wide framing, big Lora display type, slow pushes and dramatic wipes instead of fast cuts; short declarative on-screen lines that slam in and then hold; restraint everywhere except scale. Nothing flashes; everything arrives with weight.
- Angle: the product's own claim is stated at trailer scale, then the video proves it by running the real flow — question → typed answer → meter to 100% → Build website → live preview of the generated site → export/publish. The epic claim and the modest interface are the same object.
- Hook: out of near-black, cream light rises and "Describe your business." slams in, then "Get a website." settles in brand orange-red; slow push-in.
- Outro / punchline: `L` brand mark slams full-screen, "Luvify studio", then "All from the same validated document."
- Avoid:
  - Generic SaaS language ("streamline", "supercharge", "10x", any invented metric or claim)
  - Abstract filler visuals, color washes, waveform/equalizer graphics
  - Unrelated visual redesign — the composition must read as the actual Luvify studio

## Visual Identity
- Background: `#f8f5ee` (canvas), surfaces `#fffdf8`, `#ffffff`, secondary surface `#ebe5d9`
- Text: `#29251f` primary, `#60594f` secondary, `#71685c` muted; borders `#cfc6b8`
- Accent: `#d34318` (brand), hover `#b93610`, tint `#f5a17f`, selection `#fbe3d7`
- Generated-site palette (Harbour Bakery): primary `#b45309`, accent `#f59e0b`, warm style
- Display font: **Lora** (Google Fonts) — questions, project titles, section headings; fall back to Georgia, serif
- Body font: **Inter** (Google Fonts) — interface, labels, buttons; fall back to system sans
- Visual references from the project:
  - `.question` — Lora 64px/1.08, letter-spacing -0.024em
  - `.project-title` — Lora 76px; `.summary-block h3` — Lora 28px
  - `.brand-mark` — 40×40 `#d34318` tile, white 700 20px "L", 3px radius
  - `.option` tiles — 56px tall, 1px `#cfc6b8` border, 3px radius, selected = `#fbe3d7` fill + `#d34318` border
  - `.meter` — 4px bar, `#cfc6b8` track, `#d34318` fill
  - `.btn.primary` — `#d34318` fill, white, 44px, 3px radius
  - `.tab.active` — `#d34318` text with 3px `#d34318` underline
  - `.preview-frame` — white frame, 1px `#cfc6b8` border, 640px tall
  - Hairline rules, sharp 3px corners, generous cream negative space everywhere

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. The claim — 3.6s — "Describe your business." slams in, "Get a website." settles in `#d34318`; slow push-in on cream light rising from black
2. The interview — 5.1s — full studio workspace reveals: Luvify studio header, Lora question + help line, option tiles; "Harbour Bakery" types into the composer, Send pressed, Requirements meter climbs to 100% → "Ready to build"
3. The build — 4.4s — "Build website" pressed; Specification tab's "Website architecture" + "4 pages" tag; page rows Home `/` · Menu `/menu` · About `/about` · Contact `/contact` arrive one by one and hold as a set
4. The result — 5.4s — Preview tab: page tabs, white browser frame, generated Harbour Bakery homepage (hero "Fresh bread, every morning", subline, "Place a pre-order" CTA in `#b45309`); slow push-in, hero settles last
5. Outro — 2.9s — "Export .zip" and "Publish" chips fire, cut to cream, `L` mark slams, "Luvify studio", "All from the same validated document."

## Audio
- Audio role: cinematic support — low bed with a slow swell, restrained motion-matched accents
- Audio arc: quiet claim → focused work rhythm while the product runs → bed opens on the generated-site reveal → resolves on one bell under the logo, fading through the last 0.6s
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (copied into the composition)
- Music treatment: fade in from 0.0s under the hook, bed volume 0.30–0.38 (never above 0.4), swell into the outro, hold one beat past the final bell, fade out by the last frame
- Music cue guidance: bundled preset copied to `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (tempo ≈109.96 BPM, beat ≈0.55s). Strong-cue targets: **8.74s** (Build website press / wipe), **13.11s** (generated site reveal), **18.56s** (logo slam). Beat-grid windows for sequential events: meter ticks ~6.0–8.4s, page rows ~9.4–12.5s, outro chips ~18.6–19.6s. Cues are hints — readability and pacing win.
- Audio-reactive treatment: subtle — music RMS/bass gently breathes the cream background warmth and the brand-mark/preview glow; no waveform, equalizer, or particle visuals
- Audio-coupled moments:
  - Scene 1 — hook line landing on a soft impact; second line gets no extra hit (color is the accent)
  - Scene 2 — per-character key ticks for "Harbour Bakery", one click on Send, meter ticks on consecutive beats
  - Scene 3 — one press click on Build website, soft drop/tick per page row (accent first and last if it crowds), full row set holds
  - Scene 4 — one reveal hit as the preview lands, subtle RMS breathing on the warm preview background
  - Scene 5 — two chip clicks, then one deep bell on the logo slam ringing over the bed
- SFX selection guidance: cinematic profile = 2–3 big ones. Available in `assets/sfx/`: `impact/impactSoft_medium_000–004` (hook/reveal), `impact/impactBell_heavy_000` and `_003` (hero + outro, one bell only in the outro), `interface/click_001–003`, `interface/drop_001–002`, `interface/bong_001`, `ui/mouseclick1`, `casino/card-place-*` for row arrivals, `keyboard/keypress-001–032` randomized per character. Align every SFX to the start of its animation.
- SFX analysis guidance: `<skill-dir>/assets/sfx/sfx-analysis.md` and `.json` (skill dir: `/Users/arunrajv/.config/opencode/skills/brag`) — prefer low/medium high-frequency-risk files for the repeated typing and row ticks
- Exact SFX choice: Hyperframes should choose filenames, timestamps, density, and volume based on the implemented animation; keep the total sparse
- Audio files: music and a candidate SFX palette are already copied into `brag-output/composition/assets/`; copy any additional selections into the same tree

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and `hyperframes-cli` (lint/check/render). /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project — the Interview workspace and the generated preview are both required.
- Keep all text readable in the final render: short label ≈0.8s settled; a sentence ≈0.3s per word. Slam in fast, then hold. Never flash text.
- Keep the video within 15–25 seconds (target 21.5s).
- Include the planned music/SFX layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual animation exists.
- Treat music cue metadata as optional timing hints. Lock 1–3 major moments to strong cues within ±0.15s, mark them `// beat-locked`; snap sequential events to `beats[]` within ±0.10s, marked `// beat-grid`. Drop any snap that hurts readability.
- When music is present, follow the Hyperframes audio-reactive workflow: extract per-frame audio data and wire at least one visual element to it (background warmth / glow breathing). If extraction is unavailable, note it here and continue.
- Use local assets for audio; no remote or publishing workflows — creation and rendering stay local.
- Run `hyperframes check` before render — this is brag's single gate.

## Build notes (post-render)

- Audio-reactive extraction **succeeded**: `hyperframes-creative/scripts/extract-audio-data.py` (python3 venv + numpy, since `uv` is unavailable) ran against `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` at 30 fps / 16 bands, truncated to the 22s cut (660 frames) and written as `assets/audio-data.js` (`window.__AUDIO_DATA`). Wired to the `#atmos-glow` / `#atmos-glow-b` warmth breathing via the sanctioned per-frame `tl.call()` loop.
- `hyperframes check` gate: passed — 0 layout errors, contrast 83/83 WCAG AA, motion clean. Remaining warnings are intentional crossfade transients and decorative atmos overflow.
- Render: `brag.mp4` 1920×1080, 30 fps, 22.0s, h264+AAC; poster frame (3.3s, settled claim beat) baked as frame 0.
