# ParaCard v0.3.0 — the Projection primitive

*Renamed from StoryCard (7/13/2026). Function names keep the `SC_` prefix — they operate on AID story cards.*

**v0.3.1 — the Event Log.** `SC_report(owner, line)` gives the engine a classic RPG event log: a rolling window of the last **10 engine events, newest first** (story card entries render top-down, so the freshest event sits at the top), each line stamped with its turn — `T42 [GateKit] ruling: major difficulty → partial (leaping) · luck 68`. Stateless trick: *the card is the archive* — events are parsed back from the entry itself, so ParaCard keeps no state. Retry re-posts dedupe by exact line; an Erase (actionCount rewinds) drops events from erased turns. Keys stay title-scoped: the log is player UI, never model context. GateKit v0.6.1 is the first reporter; Inventory posts its mutations next.

**v0.2.0 — the Codex.** Combed from Pokémon Mystery Dungeon's Pokédex registry: `SC_codex(index, text, opts)` materializes cards from a data catalog the moment their subject enters the story. Hand it an index of `{title, entry, type?, aliases?}` and whatever text you want scanned (input, output, or both); it builds real cards on contact — deterministic, data-driven, Auto-Cards' living-world effect without generation cost. Two-tier scan keeps PMD's speed and fixes its latent bug: a native-`includes` prescreen (no regex in the hot loop) followed by a boundary-regex confirm on hits only, so "Mew" no longer materializes when "Mewtwo" walks in. Already-built titles skip via one Set; per-call `max` cap available; aliases become the card's trigger keys. Measured: 1,026-entry codex scans a long turn in ~2.5 ms.

**The idea.** Gameplay state lives in `state.vars`; story cards are *renderings* of it — built by code, shown to player and model, never parsed back into state. Proven by SIS's Inventory card, RESR's Condition card, PMD's roster. The one sanctioned reverse direction is the **config card**: a card the player edits and code reads, making story cards the engine's settings UI (the Auto-Cards convention).

Stateless by design: pure functions over the `storyCards` array. No hooks, no state namespace, nothing persisted — the only primitive that can say that. Creation goes through the platform API (`addStoryCard`), never raw pushes; index drift is real.

## Seams

```js
SC_get(title)                    // → card | null
SC_find(pred, all)               // predicate lookup, single or all
SC_ensure(title, opts)           // idempotent create → card
                                 //   opts: {type, keys, entry, description}
SC_render(title, entry, opts)    // projection write — creates if missing,
                                 //   writes only on change (no updatedAt churn)
SC_remove(title)                 // delete by title → bool
SC_config(title, defaults, opts) // editable settings card (below)
SC_codex(index, text, opts)      // materialize cards from an index on contact
SC_report(owner, line)           // post to the "Event Log" card (per-turn log)
SC_ALWAYS_ON                     // "." — keys value that triggers every turn
```

## Config cards

`SC_config("GateKit Config", GK_SETTINGS)` gives a module player-editable settings for one call:

- **First call** creates the card, rendering each default as a `Label: value` line (`CRIT_LOW` → `Crit Low: 5`).
- **Every call** parses the player-edited entry back, with types inferred from the defaults — booleans accept `true/false/on/off/yes/no/1/0`, numbers reject garbage, strings pass through. Invalid or deleted lines silently fall back to that key's default.
- **Healing:** a missing line is appended back with its default — so module upgrades can add settings without wiping player edits, and a mangled card self-repairs.
- Config keys default to the title (UI card, not lore) — pass `keys: SC_ALWAYS_ON` only for cards that *should* enter context every turn (Condition-style projections).

## The Event Log

`SC_report("GateKit", "ruling: major difficulty → partial (leaping) · luck 68")` produces (over a few turns):

```
# Event Log — most recent first
T42 [Inventory] rock x1 removed (/throw) — outcome pending
T42 [GateKit] ruling: major difficulty → partial (leaping) · luck 68
T41 [GateKit] ruling: trivial difficulty → success · luck 12
```

Any module posts one-line events; the newest prepends, the window holds 10, older events scroll off the bottom. The card itself is the archive (events parse back from the entry), so ParaCard stays stateless; retry re-posts dedupe by exact line, and erased turns drop from the log.

## Who uses it

- **Any module's settings card.** Proven by the (since-retired) Dice module's config card; GateKit Config is the live instance; Inventory/RandomEvents/Reputation configs follow.
- **Codex consumers:** bestiaries (PMD's Pokédex is the proven instance), NPC casts, spell compendia, location gazetteers — any authored world that should reveal itself card-by-card. RandomEvents can materialize the monster it just spawned.
- **Event Log reporters:** GateKit (rulings) now; Inventory (mutations), RandomEvents (intrusions) next.
- **Inventory / RandomEvents / Reputation** (planned) use `SC_render` for their projection cards.

## Verification

Harnesses: 19 assertions (core: idempotent ensure, change-only render, config round-trip/garbage/healing), 11 (codex incl. Mew/Mewtwo both directions and the 1,026-entry timing), 15 (Event Log: turn reset, multi-owner, retry dedupe, GateKit integration, no-ParaCard degradation). `node --check` clean. Status: harness-passed; live proof rides GateKit v0.6.1's one-playthrough validation.
