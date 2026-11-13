# AI prefixes: ask Claude or agy from the Lantern field

Date: 2026-11-13. Status: draft, waiting for approval. Nothing is built.

## Intent

Typing `claude: question` or `agy: question` in the field and pressing Enter
sends the text after the colon to that CLI. The answer streams, word by word,
into a card inside Lantern, in the same fonts and colours as the rest of the
panel. A short question gets a short answer without opening a terminal.

## Behaviour (Thomas's words, as understood)

- A known prefix turns normal search off. The field shows a small chip with
  the provider's name; the rest of the text is the prompt.
- Enter sends. While the answer comes in, a "thinking" pulse shows until the
  first text arrives, then the text streams in.
- With an answer showing, new text plus Enter is a follow-up in the same
  conversation.
- Esc removes the prompt and the answer card, the field is empty and normal
  search is back. The conversation is over. A running request is cancelled by
  that first Esc. Esc in normal search closes the panel as today.

## Goals / non-goals / anti-goals

- Goals: streaming answer in the panel; follow-ups; providers as a small list
  so another prefix is one entry.
- Non-goals: tools or file access for the model, markdown rendering beyond
  paragraphs and code blocks, keeping conversations after Esc, a terminal
  hand-off key (can come later).
- Anti-goal: the normal search must not get slower or change behaviour when no
  prefix is typed.

## Approaches

- A. One process per question, streamed JSON, follow-ups by resuming the
  session. Chosen. Simple, nothing lives between questions.
- B. One long-lived process per conversation fed through stdin. Faster
  follow-ups, but process lifetime and crash handling for little gain.
- C. Plain text output. No streaming, so no animation. Rejected.

## Design

- `lib/ai.js` (pure, tested): the provider list, prefix parsing
  (`claude:` / `agy:`, case-insensitive, the prompt is what follows), the
  command line for a new or a resumed turn, and a parser that turns one JSON
  line into `{kind: 'thinking' | 'text' | 'done' | 'error', ...}`.
- `sources/ai.js`: runs the process with `Gio.Subprocess` (stdout read line by
  line, cancellable), keeps the session id, kills the process on Esc or close.
- `views/panel.js`: a mode "ask" next to normal search. Enter in the mode sends;
  Esc leaves the mode. The answer card reuses the calculator answer card's
  look; it grows with the existing spring and scrolls when long.
- `views/motion.js` and `stylesheet.css`: the thinking pulse and a soft
  per-chunk fade-in. Reduced motion shows the text at once.
- Claude: `claude -p <prompt> --output-format stream-json
  --include-partial-messages --verbose --tools ""`, follow-ups with
  `--resume <session_id>`. Seen in a test: `thinking_delta` events, then
  `text_delta` events, session id on every line. *Tested* by hand, not yet from
  the extension.
- agy: `agy -p <prompt> --output-format stream-json`, follow-ups with
  `--conversation <conversation_id>`. Seen in a test: `step_update` events with
  `text_delta`, a final `result`. *Tested* by hand, not yet from the extension.
- Working directory is the home folder.

## Open points for the builder (my calls unless Thomas objects)

- Claude loads the user's hooks and plugins on every start (the test printed
  SessionStart hooks). That costs seconds. Try to start it without them
  (settings sources / bare mode) and measure; keep it only if it does not
  break login.
- agy has no `--tools` flag. Find out how to keep it from using tools
  (`--mode plan` or settings); until that is solved, `agy:` may be shipped
  second.
- Sessions: `--no-session-persistence` cannot be used for follow-ups, so
  Claude sessions of Lantern appear in its history. Accepted.
- Error cases (CLI missing, not logged in, non-zero exit) show one plain
  sentence in the card.

## Verification

- Unit tests (existing `tests/` harness) for prefix parsing, command lines and
  the stream parser, using recorded lines from both CLIs.
- Manual in a nested GNOME Shell session: stream, follow-up, Esc during a
  run, Esc after an answer, reduced motion. Anything not run is reported as
  not verified.
