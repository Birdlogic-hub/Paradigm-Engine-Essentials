# RegexLib v0.1.1 — the Grammar primitive

**v0.1.1 — first live-found bug, courtesy of GateKit's `/check`.** Live AID input ends with a newline the harness never simulated; v0.1.0 stripped trailing punctuation *before* trimming, so `"/check.\n"` kept its period and failed the command grammar (the model then adjudicated the player's perception of a nervous cat boy — working as designed, on the wrong input). Fix: trim first, then strip all trailing junk (whitespace, auto-punctuation, Say-quotes) as one order-immune class. Regression tests now use live-shaped inputs. Lesson absorbed into practice: harnesses must simulate the platform's *actual* text shapes, not idealized ones.

**The idea.** Player text is hostile — AID wraps it in narration (`> You /take sword.`), auto-punctuates, and quotes Say turns — and the nouns worth matching are arbitrary strings no fixed grammar can anticipate. So the grammar is *data*: callers hand in their live candidate lists (inventory, NPC names, spell books) and RegexLib turns free text into clean commands and canonical nouns.

Combed from the Endless Backrooms SIS parsing layer — the part the SIS Technical Reference called the crown jewel — and generalized per doctrine (idea, not implementation):

- **Candidates are injected.** `matchItem` read `state.vars.inventory` directly; `RX_matchOne(candidates, text)` reads nothing — any module matches its own nouns.
- **Commas survive normalization.** SIS stripped all `[.,]`, which made PMD-style comma args (`/recruit species, nickname`) unparseable. RegexLib strips only trailing punctuation and Say-quote residue.
- **The wallet fallthrough stayed behind.** SIS's `matchItem || matchWallet` chain was inventory plumbing, not grammar — callers compose their own fallthroughs.

Stateless like StoryCard: pure functions, no hooks, no state namespace.

## Seams

```js
RX_escape(s)                        // regex-literal escape — the enabler for data-driven matching
RX_normalize(text)                  // scrub AID framing (command parsing only, not general text)
RX_command(text, names?)            // "/verb args" → {name, args} | null; names filters to your verbs
RX_matchOne(candidates, text)       // canonical noun at START of text → {match, remainder} | null
RX_findIn(candidates, text)         // canonical noun ANYWHERE → match | null (trigger detection)
RX_amount(args, def?)               // leading integer → {amount, remainder}
RX_nounAndAmount(candidates, args)  // "3 potions" / "potions 3" / "potion" → {name, amount, tail} | null
RX_csv(s)                           // comma list, trimmed, de-perioded, no empties
RX_tail(s)                          // leftover text as narration tail (" on the table")
RX_keyValue(line)                   // "Key: value" / "key=value" → {key, value} | null
```

## The load-bearing tricks (inherited and kept)

1. **Longest-first ordering** — owning both `key` and `key to the cellar`, `/drop key to the cellar` always takes the long one. One sort defuses the bug that kills naïve matchers.
2. **Lookahead boundary, not `\b`** — `(?=[\s,.;:!?)'"”]|$)` behaves around names ending in `)`, `+`, `'` and consumes nothing, so the remainder stays intact for tails. Also why `key` can't match `keyboard`.
3. **Case-insensitive identity, case-preserving display** — matching ignores case; the returned name is the canonical candidate.

## Consumers

- **Inventory** (next) — commands, noun matching, amounts: this module *is* most of its parser.
- **GateKit** — `/check` currently uses its own inline regex; adopting `RX_command` is optional and deferred, since GateKit is live-proven and re-touching it means re-validating (rule 8).
- **RandomEvents / Reputation** — `RX_findIn` for trigger and name detection; `RX_csv` for config lists.

## Verification

26-assertion harness: the AID framing gauntlet (Do/Say/auto-punctuation, comma survival), command parsing with verb filters, all three crown-jewel matcher behaviors (longest-first, metacharacter names, boundary strictness — `keyboard` test included), interior-punctuation names (`St. John's Wort`), both amount ergonomics with trailing-amount re-check and narration tails, `findIn` boundary respect, csv/tail/keyValue dialects, and null-not-throw on empty inputs. `node --check` clean. Status: harness-passed; live proof rides the first consumer (Inventory).
