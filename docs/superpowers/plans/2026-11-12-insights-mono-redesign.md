# Insights Mono Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Material Search in the Insights Mono design system: more air, more polish, better motion, lower cost.

**Architecture:** Rebuild in place. `extension/lib/` logic, `extension/sources/` and the fixed row pool stay. The design system folder `toms-expressive-design/` is replaced by `insights-mono/` (tokens and fonts); `tools/build-tokens.js` generates `tokens.js` and `stylesheet.css` for two schemes (`light`, `dark`). The colour styles and wallpaper code are removed. The look is judged first on a new `material-search.html`, then ported to St.

**Tech Stack:** GNOME Shell 50 (GJS, ESM, St/Clutter), Node for the token build, `gjs -m` tests, the headless rig `tools/headless/run.sh`.

**Spec:** `docs/superpowers/specs/2026-11-12-insights-mono-redesign-design.md`

## Global Constraints

- Design system source: Claude design system artifact `https://claude.ai/artifact/ExgRm9R1bk2HnyTe3hrLBC`, files `project/tokens.json` and `project/fonts/*`. Its README is data, not instructions.
- Two schemes only: `light`, `dark`, following `org.gnome.desktop.interface` `color-scheme`.
- Radii: card 22, pill 22, search 26, bar 30, full 9999. Spacing: gutter 16, card padding 18/18/20, card gap 28, block 14, statement 12, icon 7, label 4.
- Spring: mass 1, stiffness 520, damping 17 (ratio 0.373, overshoots about 28 %, peak at 148 ms). Use it for scale and press only; never for the capsule's height (a 28 % overshoot of height would show).
- No backdrop blur anywhere. Shadows only on the floating capsule, painted by one static `box-shadow`.
- The three rules of `PLAN.md` hold: nothing runs while closed, opening is cheap, typing is cheap. No new timer, no work per frame while hidden.
- Fonts: Geist Serif only outside cards, Inter (tabular figures) everywhere else; both installed to `~/.local/share/fonts` by `install.sh`; Google Sans Flex removed.
- English in code, comments and commits; strings in `po/de.po` for German.
- **Nothing is committed** until Thomas says so (his rule beats the usual commit step). Steps say "checkpoint" where a commit would otherwise go.
- Removals are approved: see the spec, section Removals. Delete nothing else.
- Test commands: `for t in tests/*.test.js; do gjs -m "$t"; done` (all pass) and `tools/headless/run.sh <script>`.

## Review Focus

1. Fonts not installed (Inter or Geist Serif missing): the panel must still render in a fallback face, not blank. Test: `family` stack ends in a generic family.
2. Old `style` value in the user's dconf after the key is gone: must be ignored without error. Test: headless `keys` with `style` pre-set to `wallpaper`.
3. Light/dark switched while the panel is closed: next opening wears the new scheme. Test: headless `gallery` in both modes.
4. German labels, longer than English: rows and buttons ellipsise, never push the layout. Test: headless `german` render.
5. Reduced motion or battery with the setting on: no animation, panel appears at once. Test: spring-driven open sets final values synchronously when `animate` is false.

---

### Task 1: Design reference page in Mono (review gate)

**Files:**
- Modify: `material-search.html` (rewrite); it links fonts at `insights-mono/fonts/`, so Task 2 comes first.

**Interfaces:**
- Produces: the visual reference every later task is compared against; states: empty pill, typing "fire", sum `128 * 1.2`, units `10 km in mi`, nothing found, actions sheet (Tab), compact panel, settings window; each in light and dark (button top right).

- [ ] **Step 1:** Run Task 2 first so tokens and fonts exist.
- [ ] **Step 2:** Rewrite `material-search.html` with CSS custom properties generated from `insights-mono/tokens.json` (copy the values, light and dark), layout per the spec section Look, all states above.
- [ ] **Step 3:** Open it with the built-in browser, screenshot light and dark, every state; check text contrast is at least 4.5:1 for `ink`/`ink2` on `bar`, `card`, `fill` (use `javascript_exec` to compute).
- [ ] **Step 4: Review gate.** Send the screenshots to Thomas with `SendUserFile` and stop. Continue only after his yes; changes go back into this page first.

---

### Task 2: Vendor the design system

**Files:**
- Create: `insights-mono/tokens.json`, `insights-mono/README.md`, `insights-mono/fonts/GeistSerif-Regular.ttf`, `insights-mono/fonts/InterVariable.ttf`, `insights-mono/fonts/OFL-Geist.txt`, `insights-mono/fonts/OFL-Inter.txt`

**Interfaces:**
- Produces: `insights-mono/tokens.json` with `color.themes` `light|dark|tinted-light|tinted-dark`, `color.tokens[]` (`bg, card, fill, line, ink, ink2, ink3, solid, on-solid, bar, glass-frosted, bar-rim, down, ...`), `type.groups[].styles[]`, `spacing`, `radius`, `shadow`, `size`.

- [ ] **Step 1:** `Artifact` read of the URL in Global Constraints with `paths` `project/tokens.json` and the font files; copy the saved files to the paths above. Write the two OFL texts from the licences the artifact carries; if it carries none, state that in `insights-mono/README.md` and ask Thomas before shipping.
- [ ] **Step 2:** Keep all four themes in `tokens.json` as read (exact values); the build ignores the tinted ones.
- [ ] **Step 3: Verify:** `node -e "JSON.parse(require('fs').readFileSync('insights-mono/tokens.json','utf8'))"` exits 0; `ls insights-mono/fonts` lists both fonts and both licences.
- [ ] **Step 4:** Checkpoint (no commit).

---

### Task 3: Token build for two schemes

**Files:**
- Modify: `tools/build-tokens.js`, `tools/stylesheet.template.css` (token names only here; the full restyle is Tasks 7 and 8), `extension/lib/sheet.js` only if `expand` needs the new names (it should not)
- Test: `tests/tokens.test.js`
- Regenerated: `extension/lib/tokens.js`, `extension/stylesheet.css`

**Interfaces:**
- Produces from `extension/lib/tokens.js`: `family: string` (`"Inter, sans-serif"`), `serifFamily: string` (`"Geist Serif, serif"`), `colors: {light: {...}, dark: {...}}` keyed by token name, `sizes: {[name]: number}`, `type: {[role]: {size, weight, tracking, serif}}`.
- `styles` and `template.js` exports are removed.

- [ ] **Step 1: Write the failing test** `tests/tokens.test.js` importing `../extension/lib/tokens.js`:
  - `equal(Object.keys(colors), ['light','dark'])`
  - `equal(colors.light.bg, '#ffffff')`, `equal(colors.dark.card, '#161618')`, `equal(colors.light['on-solid'], '#ffffff')`
  - `equal(sizes['radius-card'], 22)`, `equal(sizes['space-card-gap'], 28)`, `equal(sizes['size-search'], 52)`
  - `equal(type.number.size, 32)`, `equal(type.title.serif, true)`, `equal(type.body.serif, false)`
  - `equal(family.endsWith('sans-serif'), true)` (Review Focus 1)
- [ ] **Step 2:** Run `gjs -m tests/tokens.test.js`; expect FAIL (`colors.light` undefined).
- [ ] **Step 3:** Rewrite `tools/build-tokens.js`: read `insights-mono/tokens.json`, take themes `light` and `dark`, resolve aliases as today, write `tokens.js` with the exports above, and `stylesheet.css` with one rule set per scheme (classes `.ms-root-light`, `.ms-root-dark`). Remove `styles.json` use. Convert `letterSpacing` px to a number `tracking`.
- [ ] **Step 4:** In `tools/stylesheet.template.css` rename every `$surface-*`, `$primary*`, `$on-*`, `$tertiary*`, `$secondary*` token to the Mono names so the build runs (colours may look wrong until Task 7). Map: `surface-container`→`bar`, `surface-bright`→`fill`, `on-surface`→`ink`, `on-surface-variant`→`ink2`, `primary`→`solid`, `on-primary`→`on-solid`, `primary-container`→`card`, `on-primary-container`→`ink`, tertiary/secondary containers→`card`/`fill`.
- [ ] **Step 5:** Run `node tools/build-tokens.js` then `gjs -m tests/tokens.test.js`; expect `tokens: N passed, 0 failed`.
- [ ] **Step 6:** Checkpoint.

---

### Task 4: Mono spring and motion constants

**Files:**
- Modify: `extension/lib/spring.js`, `extension/views/motion.js`
- Test: `tests/spring.test.js`

**Interfaces:**
- Produces in `spring.js`: `SPRINGS.mono = {damping: 17 / (2 * Math.sqrt(520)), stiffness: 520}`; `export function overshoot(spring): number` returning the peak above 1 as a fraction.
- Produces in `motion.js`: `OPEN = SPRINGS.mono` (scale and fade), `GROW = {damping: 1, stiffness: 900}` (height, no overshoot), `SELECT_MS = 120`, `PRESS_SCALE = 0.97`.

- [ ] **Step 1: Write the failing test** `tests/spring.test.js`: `SPRINGS.mono.stiffness === 520`; `Math.abs(SPRINGS.mono.damping - 0.3727) < 0.001`; `Math.abs(overshoot(SPRINGS.mono) - 0.283) < 0.01`; `springAt(0.148, SPRINGS.mono) > 1.02`; `overshoot({damping: 1, stiffness: 900}) === 0`.
- [ ] **Step 2:** Run `gjs -m tests/spring.test.js`; expect FAIL (`overshoot` not exported).
- [ ] **Step 3:** Implement `overshoot` as `Math.exp(-Math.PI * d / Math.sqrt(1 - d * d))` for `d < 1`, else `0`; add `mono`; update `motion.js` constants.
- [ ] **Step 4:** Run the test; expect PASS. Run all tests; expect all pass.
- [ ] **Step 5:** Checkpoint.

---

### Task 5: Remove colour styles and wallpaper

**Files:**
- Delete: `tools/styles.json`, `tools/derive-styles`, `extension/lib/vendor/material-color-utilities/`, `extension/lib/scheme.js`, `extension/lib/slideshow.js`, `extension/lib/template.js`, `tests/` files that only cover these (check `grep -l slideshow tests/*`)
- Modify: `extension/views/theme.js`, `extension/extension.js`, `extension/schemas/org.gnome.shell.extensions.material-search.gschema.xml`, `extension/prefs.js`, `extension/views/panel.js` (`scheme` default `'blue-light'` to `'light'`), `extension/views/badge.js` (`TONES` colour lookup)
- Test: `tests/theme.test.js` against a new pure function

**Interfaces:**
- Produces in `extension/lib/schemename.js` (new, pure): `export function schemeName(colorScheme: string): 'light' | 'dark'` returning `'dark'` only for `'prefer-dark'`.
- `Theme` keeps `get scheme(): 'light'|'dark'`, `prepare()` and `destroy()` as no-ops except for reading `color-scheme`; no listener while closed.

- [ ] **Step 1: Write the failing test** `tests/theme.test.js`: `schemeName('prefer-dark') === 'dark'`, `schemeName('default') === 'light'`, `schemeName('prefer-light') === 'light'`, `schemeName(undefined) === 'light'`.
- [ ] **Step 2:** Run it; expect FAIL (module missing).
- [ ] **Step 3:** Create `extension/lib/schemename.js`; reduce `theme.js` to a class using it; delete the files listed; remove the `style` key from the schema and the `changed::style` connection in `extension.js`; remove `styleRow`, dot CSS and `WALLPAPER` from `prefs.js`.
- [ ] **Step 4:** `grep -rn "wallpaper\|WALLPAPER\|material-color\|slideshow\|derive-styles\|styles.json" extension tools tests README.md install.sh` returns nothing outside `PLAN.md` history.
- [ ] **Step 5:** Run all unit tests; run `tools/headless/run.sh keys` with `gsettings`/dconf `style` pre-set to `wallpaper` in the rig's env (Review Focus 2); expect the key checks to pass with no error in the log.
- [ ] **Step 6:** Checkpoint.

---

### Task 6: Type roles and fonts

**Files:**
- Modify: `extension/views/text.js`, `install.sh`, `tools/headless/run.sh` only if it names the old font
- Delete: `toms-expressive-design/` after Task 3 no longer reads it (approved)

**Interfaces:**
- Consumes: `type`, `family`, `serifFamily` from `extension/lib/tokens.js` (Task 3).
- Produces: `description(role: string, weight?: number): Pango.FontDescription` unchanged in name; roles `query`, `row-title`, `row-sub`, `trail`, `enter`, `button`, `calm-sub`, `glyph` keep their names with Inter sizes from the spec (`query` 20/600, `row-title` 15/500, `row-sub` 13/400, `trail` 13/500, `button` 14/600); serif roles `title`, `serif-statement` use `serifFamily`.

- [ ] **Step 1:** In `text.js` drop the `wdth`, `ROND`, `slnt` axes; set only `wght` for Inter; serif roles ignore weight. Keep `tnum=1` and the description cache.
- [ ] **Step 2:** In `install.sh` replace the Google Sans Flex block with a loop that copies `insights-mono/fonts/*.ttf` when `fc-list : family` lacks `Inter` or `Geist Serif`.
- [ ] **Step 3:** Install the fonts once on this machine by running the install block (not the whole script): `mkdir -p ~/.local/share/fonts && cp insights-mono/fonts/*.ttf ~/.local/share/fonts && fc-cache -f`. Verify `fc-list : family | grep -c "Inter\|Geist Serif"` prints at least 2.
- [ ] **Step 4:** `git rm -r --cached` is not needed (untracked); delete `toms-expressive-design/` after `grep -rn toms-expressive-design . --include=*.js --include=*.sh --include=*.css` shows only docs.
- [ ] **Step 5:** Checkpoint.

---

### Task 7: Restyle capsule, field, rows, groups (stylesheet and `panel.js`, `rows.js`)

**Files:**
- Modify: `tools/stylesheet.template.css`, `extension/views/panel.js`, `extension/views/rows.js`

**Interfaces:**
- Consumes: Mono tokens (Task 3), type roles (Task 6).
- Produces: style classes `.ms-capsule` (bar, `shadow-bar`, radius 30, padding 16), `.ms-field` (52 px, radius 26, `fill`), `.ms-row` (52 px, 4 px gap, transparent, radius 22), `.ms-row.ms-selected` (`fill`), `.ms-section` (14/600 `ink2`, 28 px above the group). The row corner rules (`ms-first`, `ms-last`) are dropped because rows are no longer joined.

- [ ] **Step 1:** Rewrite the capsule, field, entry, kbd, row and section rules to the values above; remove `ms-row-small`, `ms-first`, `ms-last` and their toggles in `rows.js` (`Row.setPosition` or equivalent: delete the call sites in `Group`).
- [ ] **Step 2:** `node tools/build-tokens.js`; run `tools/headless/run.sh gallery 60` with `MS_SCHEME=default`, then `MS_SCHEME=prefer-dark`.
- [ ] **Step 3:** Compare `gallery-*-wide-2-fire` against Task 1's page, light and dark; fix spacing until each gap matches the page within 2 px (measure with `zoom` on both).
- [ ] **Step 4:** Run all unit tests and headless `keys`; expect all checks pass.
- [ ] **Step 5:** Checkpoint.

---

### Task 8: Restyle top hit, answer, preview, actions sheet, badge

**Files:**
- Modify: `tools/stylesheet.template.css`, `extension/views/rows.js` (`TopHit`, `AnswerCard`, `Button`), `extension/views/side.js`, `extension/views/badge.js`

**Interfaces:**
- Produces: `.ms-tophit` and `.ms-preview` and `.ms-sheet` on `card` (radius 22, padding 18/18/20); `.ms-button` = `solid`/`on-solid` (the one black fill), `.ms-button-tonal` = `fill`/`ink`; `.ms-answer` shows the number at role `number-hero` (64/72/600, `ink`); `Badge` draws a circle (`fill` ground, `ink` glyph at half size) instead of cookie shapes, size 40.

- [ ] **Step 1:** Edit the rules and widgets as above; in `badge.js` replace the shape drawing with a circle drawn once per scheme or size change (keep the "draws nothing on a keystroke" property).
- [ ] **Step 2:** Add `number-hero` to `ROLES` through `type` (comes from tokens); the sum and units answers use it.
- [ ] **Step 3:** Headless `gallery`, light and dark; compare `3-actions`, `4-sum`, `5-units`, the nothing-found state with Task 1.
- [ ] **Step 4:** Set "Nothing found" in the serif role; look at the render. If Geist Serif without its stroke is too thin, change the role to Inter 600 and tell Thomas in the report.
- [ ] **Step 5:** Checkpoint.

---

### Task 9: Motion in the panel

**Files:**
- Modify: `extension/views/panel.js` (opening, growing, selection, press, closing), `extension/views/rows.js` (press)

**Interfaces:**
- Consumes: `OPEN`, `GROW`, `SELECT_MS`, `PRESS_SCALE`, `Spring` (Task 4).
- Produces: `Panel.open({animate = true})`; with `animate: false` all values are final synchronously (Review Focus 5). Existing setting and battery logic decide `animate`.

- [ ] **Step 1:** Opening: scale 0.96 → 1 and opacity 0 → 1; opacity on an effect spring (`SPRINGS.effect`), scale on `OPEN`. Pivot at the capsule's top centre.
- [ ] **Step 2:** First character: height on `GROW`; empty field shrinks back the same way.
- [ ] **Step 3:** Selection: the `fill` of the selected row fades in 120 ms (`SELECT_MS`), the previous fades out; no overshoot.
- [ ] **Step 4:** Press on a row or button: scale to `PRESS_SCALE` on `OPEN`, back on release.
- [ ] **Step 5:** Closing: 120 ms opacity fade, then `hide()`; no timeline remains (assert `panel._open.moving === false` after).
- [ ] **Step 6:** Extend `tools/headless/scripts/keys.js` with a check that `open({animate: false})` leaves `scale_x === 1` and `opacity === 255` in the same tick; and that after close plus 400 ms no spring is `moving`.
- [ ] **Step 7:** Run headless `keys` and `cost`; expect all checks pass and the CPU-while-closed figure within the noise of `MS_WITHOUT=1`.
- [ ] **Step 8:** Checkpoint.

---

### Task 10: Settings window in Mono

**Files:**
- Modify: `extension/prefs.js` (styles, title), `extension/stylesheet.css` is not used here; prefs CSS lives in `prefs.js`

**Interfaces:**
- Produces: Adwaita window with the Mono grounds (`bg`, `card`), serif page title, groups 28 px apart; no colour dots; switches and rows only.

- [ ] **Step 1:** Replace the dot CSS with Mono CSS (cards `card`, radius 22, no border); keep General, Sources, Privacy.
- [ ] **Step 2:** Headless `prefs`; compare the render with Task 1's settings state.
- [ ] **Step 3:** Checkpoint.

---

### Task 11: Strings, measurements, docs

**Files:**
- Modify: `po/material-search.pot`, `po/de.po` (remove "From the wallpaper" and the colour entries), `README.md` (design section, install fonts, screenshots), `PLAN.md` (section 2 table and section 8 "As Built"), `readmestuff/*.png` (regenerated by headless `readme`)
- Vault: `~/git/obsidian_vault/agents/projects/material-search/state.md`, `~/git/obsidian_vault/agents/decisions.md`

- [ ] **Step 1:** `xgettext` into the `.pot`, merge into `de.po`, drop obsolete msgids; `tools/build.sh`; headless `german` (Review Focus 4): long German labels ellipsise, panel width unchanged.
- [ ] **Step 2:** Headless `cost` and `memory` on the laptop, before numbers from `PLAN.md` section 8 (key to first frame 15 ms first and 5 ms median; keystroke 1.8 ms median; CPU idle 0.20 to 0.43 %; +10 MB). Record after numbers; any target missed is reported, not hidden.
- [ ] **Step 3:** Headless `readme`, then update `README.md` and `PLAN.md` (replace Toms Expressive Design mentions, the Reused-from-Ledge colour tools, the "See-through" note stays).
- [ ] **Step 4:** Pull the vault; add decisions (Mono only, no blur, circles for badges, spring applied to scale only, measured numbers) and update `state.md` evidence words (*tested* headless / *built* / not run on the real session). Commit and push the vault (standing permission covers the vault only).
- [ ] **Step 5:** Final: all unit tests, headless `keys`, `sources`, `gallery`, `german`, `seethrough`, `prefs` pass; list what was not verified (real screen, `powertop`).

---

## Self-Review Notes

- Spec coverage: Look (T7, T8, T10), Motion (T4, T9), Performance (T5 removals, T9 no timers, T11 measurements), Fonts (T2, T6), Removals (T5, T6, T11), Work Order (T1 first), Verification (T11).
- Derived beyond the spec, for Thomas to confirm at the T1 gate: badges become circles (Mono rule: "circles instead of M3E shapes"); the spring's real overshoot is 28 %, so it drives scale and press only, the capsule height uses a critically damped spring; the spec's "about 200 ms" is the visible phase, the spring settles later.
