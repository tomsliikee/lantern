# Material Search in Insights Mono: Design

> 2026-11-12. Status: approved in conversation, spec awaiting review. Nothing built yet.

## Goal

Rebuild the look of Material Search in the **Insights Mono** design system (Claude design system artifact `ExgRm9R1bk2HnyTe3hrLBC`, synced from Pulse and Horizont on 2026-11-06). The launcher should feel more valuable: more air, more polish, better motion, better performance.

Kept as it is: pure logic in `extension/lib/`, all sources, the fixed row pool, the key map, the three rules of `PLAN.md` (fast, free at rest, frugal when used) and the 49 unit tests.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Colour styles | **Mono only.** Light and dark follow the system. | Thomas chose it; Mono says colour only where it means something. |
| Approach | Rebuild in place: new tokens, stylesheet, type roles, motion, views. | Keeps the tested keys and sources. |
| Glass | Translucent, **no backdrop blur**. The existing see-through option stays, off by default. | Blur costs frames on the laptop's integrated graphics and breaks "nothing at rest". |
| Order | New `material-search.html` in Mono first, reviewed by Thomas, then the port. | The design is judged on a page before it is built in St. |

## Look

- **Panel:** a floating capsule on `bar` with `shadow-bar`, radius 30, 760 px wide, 16 px inner padding.
- **Search field:** 52 px pill, radius 26, icon 22 px, query in Inter.
- **Top hit and preview:** flat `card` (radius 22), padding 18 / 18 / 20, no border, no shadow.
- **Rows:** free on the ground, 52 px high, 4 px apart; groups 28 px apart. No separators. Selection is a soft `fill` pill (radius 22), title keeps its weight; matched letters are heavier.
- **Action:** the one black thing is the main button ("Open"), `solid` on `on-solid`.
- **Type:** Inter with tabular figures for everything inside cards and rows. Geist Serif only for statements outside cards ("Nothing found", settings title). A sum's answer is set at `number-hero` (64/72, 600).
- **Colour:** `ink`, `ink2` for subs and units, `ink3` only for chevrons and placeholders. No accent colours. Errors in the calculator use the `down` pair with a word.
- **Icons:** the bundled Material Symbols, filled, 22 px in the field, 18 px in headers.
- **Settings window:** same tokens, serif title, cards 28 px apart, controls stay plain switches and rows (no draggable segmented thumb).

## Motion

- Open: scale 0.96 to 1 and fade on the Mono spring (mass 1, stiffness 520, damping 17), about 200 ms, slight overshoot.
- First character: the capsule grows downwards, height only, one spring; the field does not move.
- Selection: the `fill` pill glides between rows in 120 ms, no overshoot.
- Press: the row squashes 3 % wider, springs back.
- Close: 120 ms fade, no spring.
- Rows still appear at once; no staggered entrance.
- Reduced motion, or battery with the setting on: the panel simply appears.

## Performance

- Stylesheet generated for **two** schemes instead of twelve.
- Removed code is memory and start-up saved: wallpaper style, `material-color-utilities`.
- One static shadow actor, no per-frame effects, no blur.
- Keep the fixed pool, the per-role Pango description cache and the lazy result area.
- Measured before and after in the headless rig (`cost`, `keys`) on the laptop and held to the targets of `PLAN.md` section 3. Open frame time is added as a measure.

## Fonts

Geist Serif and Inter (variable) are copied with their OFL files from `~/git/pulse` into the repository and installed to `~/.local/share/fonts` by `install.sh`, as Google Sans Flex is today. Google Sans Flex is removed.

**Risk:** the design system draws the missing serif weight as a stroke under the fill; St cannot. Geist Serif is used at its single weight and judged in the render. If it is too thin, the serif is dropped for Inter at 600 and this is reported.

## Removals (approved by Thomas)

- `tools/styles.json`, `tools/derive-styles`, `extension/lib/vendor/material-color-utilities`.
- The wallpaper part of `extension/views/theme.js`; the colour dots in the settings window and the `style` setting in the schema.
- `toms-expressive-design/`, replaced by Mono tokens and fonts.
- `readmestuff/*.png`, regenerated.

## Work Order

1. New `material-search.html` in Mono, light and dark, all states (empty, typing, sum, nothing found, actions sheet, compact, settings). Thomas reviews.
2. Mono `tokens.json`, `tools/build-tokens.js`, stylesheet template.
3. Type roles in `views/text.js`, motion in `views/motion.js`.
4. Panel, rows, side, badge, theme.
5. Settings window, schema, German strings.
6. Fonts and `install.sh`.
7. Tests, headless renders, measurements, README screenshots, `PLAN.md` and vault state.

## Verification

- `for t in tests/*.test.js; do gjs -m "$t"; done` stays green.
- Headless: `keys`, `sources`, `gallery`, `german`, `seethrough`, `cost`; renders in light and dark compared with the HTML.
- Not verifiable here: feel on a real screen and `powertop`; reported as such.

## Out of Scope

Charts, rings, gauge, FloatingBar, Flex and tinted variants, new features, new sources.

## Git

Nothing is committed until Thomas says so.
