
# Substrate — visual rebuild: "Editorial Infra"

The current dashboard reads as generic AI/infra: slate-black background, cyan + magenta neon, all-monospace UI. You want energy and personality, on a light surface. Below is the direction I'd commit to, then where it lands in the code.

## Direction

Think *Bloomberg terminal meets Kinfolk magazine* — a bright, opinionated working surface, not a darkroom.

- **Surface**: warm off-white "paper" (`#F6F1E8`) with subtle grain. Not pure white.
- **Ink**: near-black `#111111` for primary text and node borders. Real contrast, no mid-grays for body copy.
- **One electric accent**: vivid signal-orange `#FF4D1F` used sparingly for the Substrate wordmark, the active view tab, and live event highlights. This is the "energy" — it should feel almost too saturated against the paper.
- **Agent palette** (replacing cyan/magenta):
  - Producer → deep cobalt `#1E3AFF` (confident, structural)
  - Consumer → acid lime `#B8FF2E` (reactive, hungry)
  - Both read clearly on paper and against each other; neither is the accent.
- **Working-context states** (recolored for paper):
  - Draft → mustard `#E0A800`
  - Decision → forest `#0B6B3A`
  - Claim → tomato `#D4351C`
  - Investigation → indigo `#4530B8`
  - Open question → graphite `#3A3A3A` outlined, no fill
- **Edges**: thin solid ink for structural, dashed cobalt or lime for authorship, animated dashed orange for the active retrieval path.

## Typography

The current all-mono treatment is a big part of why it looks "AI plastic". Switch to a real editorial pairing:

- **Display / wordmark / section headers**: *Fraunces* (variable serif, optical size 144) — heavy, slightly weird, very alive. Big "SUBSTRATE" wordmark in the header, ~36px.
- **Body / node labels**: *Inter Tight* — neutral, modern, dense.
- **Numerals / timestamps / IDs**: *JetBrains Mono* — kept for monospace where it earns its keep (the activity log, file paths, IDs only).

Loaded from Google Fonts in `index.html`. No more mono-everywhere.

## Composition changes

- **Header**: wordmark "Substrate" set in Fraunces 36px black, with a tiny orange dot before the org name. View switcher becomes underlined text links (no pill buttons) — active view gets a thick orange underline. Connection state and Demo/Live become small caps text, no chips.
- **Graph canvas**: paper background with a faint dotted grid (ink at 8% opacity), much sparser than the current 32px dots. A thin ink rule across the top of the canvas with the org name set flush-left in serif — gives it the feel of a printed broadsheet.
- **Service nodes**: white card, 1px ink border, no shadow. Service name in Inter Tight 14 bold; the word `SERVICE` set above in 9px Fraunces small caps, letter-spaced. Team name in lime or cobalt depending on which agent owns it most. On glow: ink border thickens to 2px and a 4px orange underline appears beneath the card.
- **File nodes**: smaller, no card — just the filename in mono with a thin ink underline. Claim badge becomes a tiny colored square left of the name (cobalt or lime).
- **Working-context pills**: keep the rounded shape but flatten — no shadow, 1.5px colored border, white fill, the type label set in Fraunces small caps in the state color, summary in Inter Tight. Superseded ones go to 30% opacity with a strikethrough on the summary.
- **Person nodes**: replace the avatar circle with a square portrait frame (1px ink), initial set in Fraunces 24, name underneath in Inter Tight.
- **Agent nodes**: drop the "P" / "C" letter circles. Replace with horizontal labels "Producer ▸" and "◂ Consumer" set in Fraunces 18 italic, in their respective brand colors, anchored to the canvas edges. Reads more like a byline than an icon.
- **Activity stream**: keep mono, but on the paper surface — alternating row tint (`paper` and `paper-2`), agent name colored, action verb in orange. Looks like a stock ticker, not a log file.
- **Reset / mode toggle**: text links in the top-right, not buttons.

## Motion

The current pulse-glow is generic. Replace with:

- **Retrieval highlight**: a thick orange dashed line traces the path with `stroke-dashoffset` animation, like ink being drawn. Each touched node gets a 1-frame ink-flash (brief inversion: ink fill, paper text), then settles back. Far more "alive" than soft glows.
- **New working-context pill**: scales in from 92% with a small overshoot, accompanied by a 2px orange underline that sweeps left-to-right under it once.
- **Supersedes**: old pill fades to 30% and drops 8px; new pill rises into place. Old → new edge is drawn with the same ink-line animation.
- **Collision**: file node shakes 4px laterally twice, claim badge flashes tomato.
- **Header**: when an event lands, the orange dot next to the org name briefly expands and contracts. Subtle ambient signal.

## Files I'll touch

Technical detail, in case you want to look:

- `src/index.css` — replace all CSS variables (`--background`, `--ink`, `--agent-*`, `--state-*`, `--edge-*`), drop the `.dark` block (we're light by default), add a paper grain via SVG data-URI, redefine `.glow-soft` etc. as ink-flash + orange underline utilities, add `.font-display` (Fraunces) and `.font-body` (Inter Tight) utility classes.
- `index.html` — Google Fonts link for Fraunces + Inter Tight + JetBrains Mono.
- `tailwind.config.ts` — add `fontFamily.display`, `fontFamily.body`, `fontFamily.mono`; add new keyframes `ink-flash`, `underline-sweep`, `shake`, `dash-trace`; remove `pulse-glow` (replaced).
- `src/components/dashboard/Header.tsx` — wordmark in Fraunces, view switcher as underlined links, mode/reset as text links, orange-dot pulse on event.
- `src/components/dashboard/nodes/*.tsx` — restyle every node per spec above (ServiceNode, FileNode, PersonNode, WorkingContextNode, ArtifactNode, AgentNode).
- `src/components/dashboard/GraphCanvas.tsx` — sparser dotted background, paper color; replace `glow` boolean styling on edges with the dashed-orange retrieval trace; add ink-flash trigger on highlight steps.
- `src/components/dashboard/ActivityStream.tsx` — paper rows, colored agent names, orange action verbs.
- `src/components/dashboard/Dashboard.tsx` — the demo-mode pill becomes a small caps text label, top-right.

## What stays the same

- All data, store, mock script, SSE, layout math, view modes (Structure / Activity / Grounded), focus/click-to-zoom.
- Component structure and props — this is a paint job, not a refactor.

## Out of scope (call out if you want them)

- Custom illustrated logo mark (currently we'll just set the wordmark).
- Dark mode toggle (removing the dark theme entirely per your note; can re-add as an option later).
- Sound design on events.

If this direction lands, I'll build it in one pass. If you want a different mood — say, brutalist (heavy black rules, all-caps Helvetica, no color), or maximalist (gradients, big numbers, photographic textures) — tell me and I'll re-spec.
