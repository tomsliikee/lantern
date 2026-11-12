# Material Search: Plan

> 2026-11-09. Status: M2 to M5 built and *tested* in a headless GNOME Shell 50.6 on the laptop (i5-8350U); not yet run in the real session. Sections 1 to 5 are the plan as written; section 8 says where the build differs and what was measured.

A launcher for GNOME Shell 50 in the manner of Spotlight: one shortcut, one field, and the right app, file, window, setting or answer under the cursor before the hand leaves the keyboard. Built in Insights Mono (since 2026-11-12; earlier in Toms Expressive Design), next to Tally, Ledge and Ember.

The three rules that decide every trade-off, in this order:

1. **Fast.** Open and answer within one frame where the data is in memory.
2. **Free at rest.** While closed it costs nothing: no timer, no poll, no redraw.
3. **Frugal when used.** Work only for what is on screen, cancel what is no longer wanted.

## 1. What It Does

- **Open:** `Super+Space` by default. GNOME already uses `Super+Space` to switch input sources, so the settings offer `Ctrl+Space` and a free key, and the extension says when the key is taken.
- **Close:** `Esc`, a click outside, or opening a result.
- **Where:** a floating panel in the upper third of the primary monitor, above windows. It is not the overview and does not start it.
- **Keys:** arrows move, `Enter` opens, `Ctrl+Enter` shows a file in its folder, `Tab` opens the actions of the selected row, `Ctrl+C` copies an answer.

## 2. Design (from `material-search.html`)

Open the file from `~/git/material-search/` so the font path `insights-mono/fonts/` resolves. The button at the top right switches light and dark.

### Panel

> Superseded in look by section 9 (Insights Mono); kept as the record of the first design.

| Part | In the HTML | Design system |
| --- | --- | --- |
| Panel | 760 px wide, 8 px inner padding, soft large shadow | `surface-container`, `radius-extra-large-increased` (32) |
| Search field | 56 px pill, search icon, query in a heavier, wider cut, `Esc` key hint | `surface-bright`, `radius-full`, type near `title` |
| Top hit | One row in the tone's container with a 48 px cookie and "Open" | `primary-container` / `on-primary-container`: the one loud thing |
| Groups | Apps, Files, Settings under small section labels | `ListGroup` + `ListItem`: 4 px apart, outer corners 24, inner corners 8 |
| Row icon | Icon at half size on a 40 px shape | Icon badge (`size-badge`), neutral for files, secondary for apps |
| Selection | Neutral tint, title in bold | No accent glow, no bar, no outline |
| Match | The matched letters in weight 800 | Same family, weight only |
| Preview | Right column, 280 px: shape with the app, name, use count, Open and New window, open windows | `surface-bright`, `radius-extra-large`, `Button` filled + tonal |
| Footer | Key hints and "6 results in 4 ms" | `aside` (slant), `on-surface-variant` |

### States shown

1. **Opened, nothing typed**: only the search pill, 760 px wide, centred, on its own floating capsule (`surface-container`, `radius-full`). No recent apps, no files, no suggestions.
2. **Typing "fire"**: the pill grows downwards into the panel; top hit, three groups, preview of the app.
3. **A sum** (`128 * 1.2`): the answer as a `metric-xl` number beside a sunny shape in `tertiary`, "Worked out on this computer." as the honest label.
4. **Nothing found**: one calm sentence, then "Search the web" (selected) and "Search in Files" (the slower, explicit full-text search).

### Still to design

The actions sheet behind `Tab`, unit and currency answers, the settings window (shortcut, sources, compact mode), and the compact panel without a preview (the small frames in the HTML show its width). Emptying the field again shrinks the panel back to the pill.

### Motion

- Opening: the pill scales from 0.97 and fades in on a spatial spring, about 180 ms. Closing: 120 ms fade, no spring.
- First character: the pill's capsule grows downwards into the panel (height only, one spring, about 200 ms); the field itself does not move.
- Selection: the tint moves on an effect spring that does not overshoot.
- Rows appear at once. No line-by-line entrance, no counting numbers, no travelling waves: the launcher is used dozens of times a day, and motion there costs time.
- With reduced motion, or on battery when the setting says so, the panel simply appears.

## 3. Performance, Battery, Speed

### Targets

| Measure | Target | How it is measured |
| --- | --- | --- |
| Key press to visible panel | under 50 ms, first frame within 1 frame of the key | timestamps in a debug build, headless rig |
| Keystroke to updated list (apps, windows, settings, calculator) | under 8 ms of work, shown in the next frame | `GLib.get_monotonic_time()` around the search |
| Keystroke to first file results | under 150 ms | same, with LocalSearch |
| CPU while closed | 0 % (indistinguishable from the extension disabled) | headless rig, 60 s idle, like Ledge |
| Wake-ups while closed | none caused by the extension | `powertop` / `perf sched` on the laptop |
| Memory | under 15 MB above the shell without it | `smaps` of `gnome-shell` before and after enable |

Reference machine: the laptop (i5-8350U, integrated graphics), because what is fast there is fast on the desktop.

### Rules

**Nothing runs while closed.**
- No `GLib.timeout_add`, no `setInterval`, no polling of any kind. The only listeners while closed are the key binding and a few change signals (apps installed, settings).
- Change signals only mark an index as stale; it is rebuilt the next time the panel opens, not when the signal arrives.
- The panel's actors are hidden (`hide()`, out of the stage tree's paint), never left at opacity 0, so the compositor does not paint them.
- No clock, no animation timeline, no frame callback while hidden.

**Opening is cheap.**
- The actor tree (field, about 12 rows, preview) is built once at `enable()` and reused. Opening only shows the pill and grabs the keyboard; the result area stays hidden and unpainted until the first character.
- Because the empty state is only the pill, opening queries no source at all: no recent files, no app list, no thumbnails.
- The first open after login builds the in-memory indexes. To keep that open fast too, the app index is built during the first idle moment after `enable()` with `GLib.idle_add` at low priority, once.

**Typing is cheap.**
- A fixed pool of row actors: a keystroke changes text, icons and visibility, never creates or destroys actors.
- In-memory sources (apps, open windows, settings panels, calculator, system actions) search synchronously in plain JS on prepared lowercase strings and prefix/word tables. At most 6 results per group, 1 top hit; ranking stops when the groups are full.
- Icons are looked up once per GIcon and kept in a small map; nothing is rasterised per keystroke.
- The list is laid out once per keystroke. A result that arrives later is appended to its group below the fold or into a reserved slot, never pushing the top hit or the selected row.

**Slow sources wait and give way.**
- Files (LocalSearch via D-Bus) are asked only after 2 characters and 80 ms without a key. Every new keystroke cancels the previous query (`Gio.Cancellable`).
- Full-text search inside documents only on request ("Search in Files"), never as you type.
- GNOME's own search providers (other apps) are optional per provider, asked after the fast sources have answered, with the same debounce and cancel, and dropped if they do not answer within 300 ms.

**Battery.**
- On battery: no opening animation (setting, on by default), file results limited to names, no thumbnail decoding in the preview.
- Thumbnails come only from the existing GNOME thumbnail cache; the launcher never generates one.
- No network at all, except when you choose "Search the web", which hands the query to the default browser.

**Storage.**
- Use counts for ranking (opened result per query prefix) in one small JSON file in `~/.local/share/material-search/`, capped at a few hundred entries, written at most once per close and never while typing. Nothing leaves the machine.

**Drawing.**
- The panel shadow is a static `box-shadow` on one actor; no blur of what lies behind, no effects recomputed per frame.
- Badges are circles from the stylesheet; nothing is drawn in code.

## 4. Architecture

- **UUID:** `material-search@thomashaiden`. GNOME Shell 50, ESM modules, GJS.
- **Layout of the repository** (as Ledge and Tally):
  - `extension/extension.js`: enable, disable, key binding.
  - `extension/views/`: panel, field, row pool, preview, footer.
  - `extension/lib/`: pure logic without shell imports: matcher, ranking, calculator, units, usage history. Unit tested.
  - `extension/sources/`: one module per source, each with `prepare()`, `search(query, cancellable)`, and its cost class (`instant` or `slow`).
  - `tools/`, `tests/`, `insights-mono/`, `README.md`.
- **Reused from Ledge** (`~/git/ledge`): `tools/build-tokens.js` with `tools/stylesheet.template.css` (St has no CSS variables, so one rule set per scheme, light and dark, is generated), `extension/lib/spring.js` for the springs, and the headless GNOME Shell rig in `tools/headless/` for renders, virtual keyboard tests and CPU measurements.
- **Tests:** `gjs -m tests/<name>.test.js` for matcher, ranking, calculator and units; the headless rig for opening, typing and the zero-at-rest measurement.

## 5. Sources, in Order of Cost

| Source | Cost | Data |
| --- | --- | --- |
| Apps | instant | `Shell.AppSystem`, `installed-changed` marks stale |
| Open windows | instant | `global.display` window list, read on open |
| Settings panels | instant | the `.desktop` files of GNOME Settings panels, read once |
| Calculator and units | instant | own parser in `lib/`, no `eval` |
| System actions | instant | lock, log out, suspend, restart, power off (with confirmation) |
| Files by name | slow | LocalSearch (`org.freedesktop.LocalSearch3`), debounced and cancelled |
| Search providers | slow | GNOME's `org.gnome.Shell.SearchProvider2`, opt-in per provider |
| Web | none | hands the text to the default browser on request |

## 6. Milestones

1. **M1 Design**: `material-search.html` and this plan. Done; the actions sheet was added to the HTML after it was built.
2. **M2 Skeleton**: extension with the panel in St, shortcut, keys, fixed row pool. *Tested* headless (`keys`, `cost`).
3. **M3 Instant sources**: apps, windows, settings, calculator, actions; ranking by use. *Tested*: 49 unit tests, headless `keys` and `gallery`.
4. **M4 Slow sources**: files by name, inside documents, search providers; debounce, cancel, late results below. *Tested* headless (`sources`, `cost`).
5. **M5 Settings and polish**: settings window, compact mode, battery switches, German, README with screenshots. *Tested* headless (`prefs`, `german`, `readme`).
6. **Next**: install in the real session, watch the motion, `powertop` on the laptop, click the first-enable notification.

Each milestone ends with the measurements of section 3 on the laptop.

## 7. Answered Questions

- **Default shortcut:** Super+Space, asked once. On the first enable, when Super+Space also switches input sources, the launcher takes Ctrl+Space and a notification offers to take Super+Space (removed from `switch-input-source`; Shift+Super+Space keeps switching). The settings give it back.
- **Compact mode:** by screen. Without the preview below 1400 logical pixels; the setting can say always or never.
- **Search providers:** every installed one is listed in the settings, all off by default.
- **Search in Files:** LocalSearch's full-text index, shown in the panel, only on request.
- **Also decided:** GSettings for the settings; Google as the default web search, switchable; the calculator does arithmetic and units, no currencies (they would need the network); system actions confirm in GNOME's own dialog; use counts fade with a half-life of 14 days; Enter on an app raises its last window; no top bar icon; English with a German translation; MIT.

## 8. As Built

**Where it differs from the plan above:**

- **Group order:** the slow groups (Files, other apps) come after all instant groups, also after Settings; the HTML showed Files between Apps and Settings. That is what keeps late results below what is shown.
- **Selection:** the tint fades from row to row (120 ms, no overshoot) instead of travelling between them; rows in groups have different corners.
- **Stale lists** are rebuilt in the idle moment right after the panel's first frame, not inside the opening: GNOME announces installed apps once after login, and rebuilding then cost the first keystroke 20 ms.
- **Files:** no order and no folder join in the LocalSearch query (1 to 3 ms instead of 100 to 600 ms on 163 000 files); a name without an ending is asked of the disk whether it is a folder. A sum asks no slow source.
- **Icons:** the launcher's own are Material Symbols shipped in `extension/icons/`, because several of the Adwaita names were missing here; app and provider icons are their own.
- **The answer** is copied by Enter as well as Ctrl+C, and the panel closes.
- **See-through** (added 2026-11-09 on request): as in Halo, the capsule at 78 % of `surface-container`, inner surfaces solid, no blur, setting `see-through`, off by default.

**Measured** (headless, laptop, 1600x1000): key to first frame 15 ms the first time, 5 ms median; keystroke work 1.8 ms median, 9.3 ms the first; first file results about 97 ms after the last key (80 ms of it the pause); CPU while closed within the noise of the shell without the extension (0.20 to 0.43 % against 0.33 % of one core over 30 s); memory +10 MB after the first search.


## 9. Redesign in Insights Mono (2026-11-12)

Spec `docs/superpowers/specs/2026-11-12-insights-mono-redesign-design.md`, plan beside it. `material-search.html` is the visual truth; the extension follows its values.

- **Dropped:** the five colour styles, the wallpaper style (and `material-color-utilities`), the colour dots and the `style` key, `toms-expressive-design/`. An old `style` value in dconf is ignored (*tested*: the rig pre-sets it).
- **Look:** capsule on `bar` (radius 30, one static shadow, no blur), flat `card`s (22), free rows 52 px high 4 px apart, selection a `fill` pill, badges as 40 px circles, one black main button. Serif (Geist Serif, one weight, no stroke possible in St) for the empty field's "Search anything", the query, group headings, the preview's name, "Actions", the calm sentence and the settings window's headings; Inter for the rest, matched letters in rows at weight 800.
- **Motion:** the Mono spring (mass 1, stiffness 520, damping 17, about 28 % overshoot) drives the opening scale (0.96 to 1, pivot at the top) and the press (0.97) only; the capsule's height uses a spring without overshoot; selection fades in 120 ms through the stylesheet; closing fades out in 120 ms. `open({animate: false})` (reduced motion, battery) sets every value at once. No timeline exists while closed (*tested*: `keys`).
- **Fonts:** Inter and Geist Serif from `insights-mono/fonts/`, installed by `install.sh`; both stacks end in a generic family, so a missing font still draws (*tested*: unit test on the stacks; not tested with the fonts removed from the rig).
- **Measured** (headless, laptop, 1600x1000, 2026-11-12, **while another process held the load average at about 15**, so every wall-clock figure is inflated and not comparable with the 2026-11-09 numbers above): CPU while closed 0.73 % with and 0.73 % without the extension over 30 s (same); memory at rest +10.4 MB against the shell without it (251.9 vs 241.5 MB; +10 MB before), +2 to 4 MB after one search; key to first painted frame median 22 ms (first 52 to 82 ms; 5 ms median and 15 ms first before); opening work median 18 to 20 ms, of which the backdrop's first show about 7 ms and the modal grab 8 to 24 ms; keystroke work median 7 ms (1.8 ms before); first file results once 290 ms, once none arrived. Targets for open and keystroke time are **not shown to be met**; a rerun on an idle machine is open. CPU and memory targets hold.
- **Measured again** (same day, load average about 5, closer to idle): CPU while closed 0.63 % (0.20 % after use); key to first painted frame median 9.2 ms (first 22 ms); opening work median 6.4 ms; keystroke work median 2.7 ms (first 12.8 ms); first file results about 112 ms after the last key. Slower than the 2026-11-09 figures (5 ms, 1.8 ms) but the machine was still not idle; read the earlier line as an upper bound.
