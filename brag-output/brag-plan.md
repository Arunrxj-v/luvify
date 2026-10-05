# Brag Plan: Luvify studio

## What is this app?
Luvify is an AI website builder studio: you describe your business in a short chat interview, and it generates a specification, builds a real multi-page website, shows a live preview, and exports or publishes it — all from one validated document.

## The angle
Treat a mundane builder flow like a blockbuster origin story. "Describe your business. Get a website." is stated with trailer-scale gravity, then the video proves it by running the actual product: a giant serif interview question, an answer typed in, a requirements meter climbing to "Ready to build", a click on **Build website**, and a real generated bakery site arriving on screen. The epic claim and the quiet, editorial studio UI are the same object — that contrast is the joke and the brag.

## Hook (first 2-3 seconds)
The product's own empty-state headline lands out of darkness, word by word, in the studio's Lora display serif at trailer scale: **"Describe your business."** then, in brand orange-red, **"Get a website."** Slow push-in, warm cream light rising behind the type. Earns the rest because it is a promise the next 18 seconds have to keep.

## Key moments (the middle)
- The real interview workspace: the 64px Lora question **"What is your business called?"** with its help line, then **"Harbour Bakery"** typed character-by-character into the composer and sent.
- The Requirements meter climbing — label ticking **68% → 100%**, chip flipping to **"Ready to build"**, then the **Build website** button press.
- The generated site landing in the Preview tab: **"Fresh bread, every morning"** with the harbourside subline and the **Place a pre-order** CTA, in the bakery's own amber palette.

## Outro / punchline
Action chips **Export .zip** and **Publish** fire, then the brand mark slams onto cream and the line lands: **"All from the same validated document."** Music swell, bell hit, hold.

## User flow worth showing
Entry → key action → result, all real product UI:
1. Answer the interview question in the composer (type "Harbour Bakery", Send).
2. Requirements meter hits 100% → click **Build website**.
3. Preview tab opens on the generated Harbour Bakery homepage; **Export .zip / Publish** available in the action row.

## Tone
- Preset: cinematic
- Creative direction: "editorial product film" — a blockbuster trailer built entirely out of a warm, print-shop-quiet studio interface
- Interpretation: wide framing, big Lora display type, slow pushes and dramatic wipes instead of fast cuts; short declarative on-screen lines that each settle and hold; restraint everywhere except scale — no flash frames, no hype the product cannot back up.

## Format: landscape — 1920x1080
## Duration: 21.5s

## Visual identity (from the project)
- Background: `#f8f5ee` (warm cream canvas), surfaces `#fffdf8` / `#ffffff`
- Accent: `#d34318` (brand orange-red), accent tint `#f5a17f`, selection `#fbe3d7`
- Text: `#29251f` primary, `#60594f` secondary, borders `#cfc6b8`
- Generated-site palette (Harbour Bakery): primary `#b45309`, accent `#f59e0b`, warm style
- Display font: **Lora** (serif) — project titles, interview questions, section headings
- Body font: **Inter** — interface, labels, buttons
- Strongest visual element: the editorial interview workspace — giant serif question, 2×2 option tiles, hairline-bordered panels, sharp 3px corners, and the orange Requirements meter. Secondary: the Preview tab iframe showing the generated site.

## Share copy (draft)
Describe your business, answer a few questions, and Luvify hands you the spec, the site, a live preview and an export — one document all the way down.

## Audio direction
- Role: cinematic support — low bed with a slow swell, restrained motion-matched accents
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (steady, clean — the bundled track recommended for `cinematic`)
- Music treatment: fade in under the hook from 0.0s at ~0.32 volume, never above 0.4; let it swell into the outro, hold one beat past the final bell, fade out by the last frame
- Music cue guidance: preset read at `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.*` — tempo ~109.96 BPM, beat grid ~0.55s. Strong cues to target: **8.74s** (Build website click / wipe), **13.11s** (generated site reveal), **18.56s** (logo slam). Beat-grid windows for sequential events: page-plan rows in Scene 3 (~9.4–12.5s), meter ticks in Scene 2 (~6.0–8.4s).
- Audio-reactive treatment: subtle — music RMS/bass gently breathes the cream background warmth and the brand-mark glow; no waveform or equalizer visuals
- SFX posture: sparse-to-moderate, motion-matched — 2-3 big ones (cinematic profile): a deep bell on the final logo, a soft impact on the hook slam and the site reveal, plus light key ticks for the typed answer and one click for the button press
- Audio-coupled moments: typed "Harbour Bakery" (per-character key ticks), meter count-up, page-plan rows arriving one by one, the Build website press, the preview reveal, the outro bell
- Restraint rule: no risers, no whooshes stacked on every cut, nothing louder than the music bed; one bell maximum in the outro

## Storyboard

### Scene 1 — The claim — 3.6s
Out of near-black, warm cream light rises. The studio's own empty-state headline arrives in Lora display serif at trailer scale: **"Describe your business."** slams in (scale 0.95 → 1.0), then **"Get a website."** settles beneath it in `#d34318`. Slow push-in throughout; a faint vignette holds the edges. Product material: verbatim copy from `apps/web/src/App.tsx` empty state.
Sequential/interaction: yes — two lines arrive one after the other, each fully settled before the next.
Audio intent: low swell opening the video, weight without noise.
Audio-coupled idea: first line lands on a soft impact; second line gets no extra hit, the color change is the accent.
Music: bed fades in under the swell.
Transition mood: dramatic wipe with scale → Scene 2

### Scene 2 — The interview — 5.1s
The full studio workspace reveals: header with the `L` brand mark and **"Luvify studio"**, the giant Lora question **"What is your business called?"** with help line *"The name that should appear in the logo and the footer."*, the 2×2 option tiles, and the Requirements panel at the right. Then the interaction: **"Harbour Bakery"** types character-by-character into the composer, **Send** is pressed (button press / cursor), and the Requirements meter climbs to 100% with the chip flipping to **"Ready to build"**. Product material: interview question + help copy verbatim from `apps/server/src/interview.ts`, composer and requirements panel from `apps/web/src/App.tsx`.
Sequential/interaction: yes — typed answer, Send press, then the meter ticks up and the stage chip changes.
Audio intent: quiet focus; the product working, not performing.
Audio-coupled idea: per-character key ticks for the typing, one click on Send, meter ticks on consecutive beats.
Music: bed continues, restrained.
Transition mood: dramatic wipe → Scene 3

### Scene 3 — The build — 4.4s
Focus pulls to the action row: **Build website** (primary orange) is pressed. The Specification panel answers: **"Website architecture"** with the **"4 pages"** tag, and the page rows arrive one by one — **Home `/` · Menu `/menu` · About `/about` · Contact `/contact`** — each with its path in mono. Product material: spec tab architecture block from `App.tsx`, page names/paths from `packages/shared/src/answers.ts`, seeded pages from `apps/server/src/seed.ts`.
Sequential/interaction: yes — cursor presses Build website, then 4 page rows arrive in order (hold the full set on screen ~1.5s so every row is readable).
Audio intent: momentum building; each row is a small confirmation.
Audio-coupled idea: one press click at the transition, soft drop/tick per row snapped to the beat grid, nothing on rows 2-3 if it crowds.
Music: bed swells toward the reveal.
Transition mood: dramatic crossfade with scale → Scene 4

### Scene 4 — The result — 5.4s
The Preview tab: page tabs (Home · Menu · About · Contact), the browser frame, and the generated **Harbour Bakery** homepage inside it — hero **"Fresh bread, every morning"**, subline **"Sourdough, pastries and cakes baked on the harbourside"**, CTA **"Place a pre-order"**, all in the site's own amber `#b45309` on warm cream. Slow push-in across the live preview; the hero headline settles last. This is the centerpiece: the product doing its thing.
Sequential/interaction: none beyond the slow push — let the generated site simply be on screen long enough to read (headline ~1.2s settled, subline follows).
Audio intent: the payoff; bed opens up, one soft impact as the preview lands.
Audio-coupled idea: reveal hit locked to a strong cue; subtle RMS breathing on the preview's warm background.
Music: fullest point of the bed.
Transition mood: slow crossfade → Scene 5

### Scene 5 — Outro — 2.9s
Two action chips fire in sequence — **Export .zip**, **Publish** — then cut to cream. The `L` brand mark slams in at full scale with **"Luvify studio"**, and the final line settles beneath: **"All from the same validated document."** Hold to the end frame.
Sequential/interaction: yes — two chips, then the mark, then the line.
Audio intent: the last word; deep bell on the mark, music resolves.
Audio-coupled idea: chip clicks on the beat, one `impactBell` on the logo slam, ring out over the bed.
Music: swell into the slam, fade through the final 0.6s.
Transition mood: end

**Music mood for this video:** cinematic
**Audio summary:** A steady bed fades in under an epic claim, stays quiet while the product works, opens up when the generated site lands, and resolves on a single bell under the logo.
