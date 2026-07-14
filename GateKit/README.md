# GateKit v0.6.1 — the Check primitive

**v0.6.1 — reports to the Event Log.** Each judged turn posts a player-readable line to ParaCard's "Event Log" card (`[GateKit] ruling: major difficulty → partial (leaping) · luck 68`), including honest "no ruling captured" and "bookkeeping turn" entries. Live **Report** switch in the config card; no ParaCard, no post, no throw.

**v0.6.0 — the Inventory-ready release.**

- **`/check` removed.** The GateKit Config card superseded it; its deprecation tour ended with honors (found RegexLib's normalizer bug on the way out). The **Enabled** switch is now *live* — read from the config card every turn, so editing the card mid-game toggles the checker. No command needed.
- **New seam: `GK_markCommandTurn()`** — any module can stamp the current turn as pure bookkeeping (a swallowed slash command, a meta action) and the arbiter skips it. Built for Inventory's `none`-policy verbs per the design proposal; usable by anything.
- **`DEBUG_FOOTER` ships `false`** — scenarios are clean out of the box; playtesting flips it on via the card.
- State migration sweeps the dead v0.5 fields (`on`, `echo`). 17-assertion harness.

**v0.5.1 (historical) — Core consumer.** `/check` parsing now routes through RegexLib's `RX_command` when Core is present: framing scrub, Say-quote handling, and verb filtering come from the Grammar instead of an inline regex (a foreign verb like `/roll` is now cleanly ignored instead of best-effort matched). The inline fallback keeps GateKit standalone-capable. This touches a live-proven path — the live checklist below includes a `/check` round-trip re-proof.

**v0.5.0 — player-editable settings via the "GateKit Config" story card.** When the StoryCard primitive is pasted in the same Library, `GK_cfg()` reads all settings from an auto-created, self-healing config card: luck range (the arbiter prompt's bounds update dynamically), toast, and both debug channels — so playtest instrumentation turns off with a card edit, not a code edit. `Enabled By Default` governs fresh adventures only; `/check on|off` remains the runtime toggle. Without StoryCard, GateKit runs on built-in defaults (verified: no card, no throw). Paste order doesn't matter — function declarations hoist within the Library. Config reads are cached per hook execution. 13-assertion stack harness.

**v0.4.3 — never fail a correct answer on punctuation.** Third live capture proved premise-first works: the model emitted `difficulty: impossible; check: fail; skill: N/A` — right order, right ruling, grounded narration, no coercion needed — but used **colons**, so the `=`-only regex missed it and the verdict leaked into the story. Both parsers now accept `=` or `:` as delimiter (and `;` or `,` as separator). Harness includes the exact live line, plus a false-positive guard for prose that merely mentions "check" and "difficulty".

**v0.4.2 — premise before conclusion.** Second live capture showed `check=success; difficulty=impossible;` *persisting despite the v0.4.1 rules line* — and the narration followed the bad verdict onto the moon while the coerced state said fail. Root cause: field order. An autoregressive model commits to the first field before assessing the rest, and luck (56 that turn) flavors an unconditioned `check=`. The schema is now **difficulty-first** (`difficulty=…; check=…; skill=…;`) so the verdict is generated conditioned on the difficulty tokens already emitted — one-line chain-of-thought. Rules tightened to match ("impossible always fails. Trivial always succeeds. Luck sways only minor and major attempts."). The parser accepts both orders (legacy check-first still parses, correctly mapped), and the impossible⇒fail backstop remains as insurance for downstream consumers.

**LIVE-PROVEN 7/13/2026** — first capture on Dynamic Large: `check=success; difficulty=impossible;` on a moon-leap, verdict stripped, narration grounded.

**v0.4.1 tuning (from that capture):** the prompt now forbids contradictory rulings (`impossible ⇒ fail`, `trivial ⇒ success`) and tells the model to omit the skill field when none applies; the parser normalizes `skill=none/n\/a/-` to `null` and deterministically coerces `impossible` rulings to `fail` as a logged backstop — so consumers of `GK_lastCheck()` never see a self-contradictory verdict, regardless of model mood.

**v0.4 hardening (live-playtest driven):**

- **Schema-migrating state.** `GK_state()` backfills field-by-field instead of trusting whatever shape an earlier version persisted — a stale `state.vars.GK` from rapid iteration can no longer silently disable injection (missing `on`) or throw on `/check` (missing `log`).
- **Delivery-first capacity policy.** Near `info.maxChars`, the arbiter block is no longer skipped: the oldest *Recent Story* sentences are trimmed to make room (the AC precedent). No Recent Story header → inject anyway (maxChars is an estimate) and log the overflow. Delivery is the primitive's job; vanishing quietly in mature adventures was a defect.
- **Command turns are non-adjudicable.** `/check` stamps its turn; the Context pass skips it — the model is never asked to rule on the act of typing a command.
- **Semantic injection guard.** Inject only when the latest history entry is a real player action (`do`/`say`/`story`); starts, Continues, and see-turns skip by type instead of by counter guesswork.

**The idea, generalized — not the old implementations.** Code cannot judge whether an action is consistent with the story; the model can. GateKit is that judgment turned into an engine primitive:

> Pose one question about the player's action in the strongest context position → the model rules in one machine-readable line before it narrates → the ruling is captured, hidden from the player, and exposed as engine state.

Silent DM reached for exactly this and stopped short of finishing it. SIS's take-approval, RESR's edibility check, and PMD's recruit evaluation were all scenario-specific instances of the same idea. None of their machinery is in here — no gate registry, no pending-op plumbing, no migration shims. ~165 lines.

## What it does

Every player action gets silently adjudicated:

```
check=success|partial|fail; difficulty=trivial|minor|major|impossible; skill=name;
```

- **Input** — `/check on|off` toggle (command swallowed), and one luck roll per action (1–100; retries of the same action keep their roll).
- **Context** — appends the arbiter block at the very end of assembled context with `{{LUCK}}` substituted. Skips turn 0, Continue turns (nothing new to judge), the off state, and anything that would exceed `info.maxChars`. Never touches `state.memory.frontMemory`.
- **Output** — captures the verdict line, strips it from the prose, stores it in `state.vars.GK.lastCheck`, and (optionally) toasts it. If the model skips the line, the turn passes through untouched — the checker degrades to nothing, never to breakage.

## Wiring

```js
// Input tab:    text = GK_onInput(text);
// Context tab:  text = GK_onContext(text);      // LAST, after other passes
// Output tab:   text = GK_onOutput(text);       // FIRST, before other passes
//               text = GK_onOutputDebug(text);  // optional, while playtesting
```

## Playtest debugging (v0.3.2)

All instrumentation lives in the library — hooks stay thin. `GK_onOutputDebug`, wired after `GK_onOutput`, appends a fenced footer to each output (checker on/off, turn, luck, verdict-this-turn or `NONE CAPTURED`, and the model's raw pre-strip first line — the tell for "ignored the prompt" vs "answered off-format") and mirrors the same to the editor's CONSOLE LOG. Gated by `DEBUG_FOOTER` / `DEBUG_CONSOLE` in `GK_SETTINGS`, so the call can stay wired and silenced; the whole section is comment-fenced for deletion once the Check is trusted. The footer enters story history — playtest in a throwaway adventure.

`/check` (v0.3.1) now answers through three channels — toast, console, and a bracketed status line prepended to the next output — and blanks the whole command turn so Do-mode framing (`> You /check.`) leaves no `> You .` residue for the model to narrate. **Phoenix note:** `state.message` is "not yet implemented" in the current UI (per the [official scripting docs](https://help.aidungeon.com/faq/how-do-i-write-scripts-and-use-scripting)), so the echoed status line is the only player-visible reply channel that actually renders.

## Troubleshooting: "scripts do nothing"

Platform facts (verified against the official scripting guide): scripts attach to the Scenario and are **shared by existing adventures** started from it — no re-creation needed after edits. Multiple Choice parents can't hold scripts; each child option's scripts are independent. Hooks run sandboxed: 16 MB, 2-second timeout.

If a command like `/check` survives verbatim into the story with no error banner, the Input pass never ran. Check in order:

0. **IS SCRIPTING ENABLED?** New scenarios ship with the SCRIPTING toggle **off by default** ("Scripts Disabled", on the scenario's Details tab above EDIT SCRIPTS). Everything downstream — editor, saves, Script Test panels — looks fully functional while the toggle silently no-ops all four scripts in live play. This cost us a full debugging session on 7/13/2026. Check the toggle before checking anything else.
1. **Saved?** A white dot next to a script tab marks unsaved changes; the editor has an explicit Save button.
2. **Right scenario?** Confirm the adventure came from the exact scenario (or exact MC child option) whose scripts you edited.
3. **Load canary (v0.3.3).** The Library logs `[GateKit] library loaded` on every hook run. Open the editor's Console Log panel next to a live playtest tab (logs stream in real time, kept 15 min, only from adventures you started). No canary → the Library isn't attached or isn't executing.
4. **Script Test.** Select the Input script; the Script Test panel's Submit sends the input + Library + script to the server and shows `text`, `stop`, `logs`, `state` — the cleanest way to separate bad code from a live adventure not using the scripts you think it is.
5. Only after the Input hook is proven should context injection be inspected (INSPECT button: most recent model context + game state, 15-min expiry).

## Composing with other primitives

The whole point of a shared primitive is its seams:

```js
const check = GK_lastCheck();
// → { result: "partial", difficulty: "major", skill: "lockpicking", luck: 62, turn: 41 } | null
```

- **Consume the ruling.** Any module reads `GK_lastCheck()` and reacts: an events module escalates after a `fail`, an injury module keys off `difficulty`, a progression module tallies `skill` mentions. GateKit doesn't know or care who's listening.
- **Supply the chance.** `GK_setLuck(n)` lets a Dice primitive own randomness (advantage/disadvantage, modifiers, blessings) and feed the checker, replacing the internal roll. Clamped to range, per-action.
- **Tune the question.** `GK_PROMPT` and `GK_VERDICT_RX` are one constant and one regex — the question/answer contract is data, not architecture.

## Deliberately out of scope

Deferred commits (rule first, mutate state after), multi-field structured verdicts, multiple concurrent checks, per-domain gate types. Those are higher-level modules that will *consume* this primitive when the engine needs them — they don't belong inside it.

## Verification

20-assertion harness: turn-0/Continue/off/ceiling skips, luck stability across retries, tail placement + substitution, verdict capture/strip with and without `skill`, toggle round-trip, Dice seam (supply + clamp), graceful pass-through when the model ignores the schema. `node --check` clean. frontMemory verified untouched throughout.
