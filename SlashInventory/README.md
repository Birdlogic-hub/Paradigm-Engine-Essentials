# Inventory v0.1.0 — the Possession

**The idea.** What the player holds, held honestly: *bookkeeping is deterministic; consequences are adjudicated.* A slash command never fails — code can verify possession perfectly — while what the deed causes in the world belongs to the Check, which rules on the rewritten action like any other turn. The rock leaves your hand with certainty; where it lands is up to the arbiter.

Lineage: SIS core (Endless Backrooms). Everything SIS proved is here — flat-array items (quantity-as-repetition), wallet, the full verb set, undo ring buffer, card projection, over-spend refusal — rebuilt on the engine. What's deliberately *not* here: SIS's APPROVE/REJECT gate machinery (~200 lines of prompts, flags, and a bespoke parser), because GateKit's per-turn verdict subsumes it. The `gated` policy delivers the same protection with zero added latency and zero added prompt.

Built per the approved design proposal (`Documentation/Design Proposals/`), including Cragin's arbitration-policy layer.

## Commands

| Command | Default policy | Effect |
|---|---|---|
| `/take [n] <name>` | outcome | acquire; free-text name (≤40 chars) |
| `/collect [n] <currency>` | outcome | acquire into wallet |
| `/drop [n] <item>` | none | spend (bookkeeping only) |
| `/give [n] <item> to X` | outcome | spend; recipient rides the stub |
| `/throw [n] <item> at X` | outcome | spend; the rock-misses-the-goblin case |
| `/use <item>` | outcome | spend exactly 1 |
| `/undo` | meta | reverse last operation (never judged) |
| `/inventory`, `/inv` | meta | echo holdings (never judged) |

Items and currencies share one matcher space (items win ties); parsing is entirely RegexLib (`RX_command` verb filter, `RX_nounAndAmount` both-order amounts, longest-first multiword item names).

## The policy layer

Per-verb arbitration in the **Inventory Config** card — `none` / `outcome` / `gated`, live-editable, garbage falls back:

- **none** — commit at input, turn stamped non-adjudicable (`GK_markCommandTurn`).
- **outcome** *(default)* — commit at input; the Check rules the rewritten stub. **Asymmetry:** acquisitions roll back on a `fail` ruling (you reached, you didn't get it); expenditures never refund (the deed happened — the rock is gone, it just missed).
- **gated** — nothing commits until output, and only if the ruling isn't `fail`. The old SIS gate, rebuilt at zero marginal cost.

## Integration

- **The rewrite:** `/throw rock at goblin` → "You throw the rock at the goblin." GateKit adjudicates the sentence; it never learns Inventory exists. Gated ops read as attempts ("You attempt to take the iron key.").
- **Event Log:** every mutation posts — `torches x3 added (/take)`, `/take rolled back (ruling: fail)`, `gated /take cancelled (ruling: fail)` — joining GateKit's ruling lines.
- **Cards:** "Inventory" (## Wallet / ## Inventory, `- Name x N`, alpha-sorted, pure projection) and "Inventory Config". `Inventory In Context: true` flips the card's keys to always-on for scenarios that want the model permanently aware of holdings.
- **Retry guard (fixes SIS's latent hazard):** a re-run of the same turn replays the recorded stub without re-mutating — no more double-drops on Retry. (An *edited* retry issuing a different command re-processes; `/undo` covers the rare double. Documented limitation.)
- **Degradation:** no GateKit → verdicts never arrive, policies behave as `none`, bookkeeping fully functional. No ParaCard → state and commands work, cards/config/log unavailable. No RegexLib → commands inert, module dormant.

## Wiring

```js
// Input tab:    text = INV_onInput(text);   // FIRST: rewrite/mutate/stamp
//               text = GK_onInput(text);
// Context tab:  text = GK_onContext(text);  // Inventory has no context pass
// Output tab:   text = GK_onOutput(text);   // verdict captured first
//               text = INV_onOutput(text);  // commits/rollbacks/echoes
//               text = GK_onOutputDebug(text);
```

## Verification

31-assertion full-stack harness (all four modules loaded, simulated turns end-to-end, live-shaped inputs with trailing newlines and Say-framing): optimistic commit + keep on success, rollback on fail, spend-never-refunds, none-policy marking, over-spend and unknown-item refusals, wallet credit/debit with tails, gated block and gated commit (including an impossible-coerced ruling), retry stub replay without double mutation, undo both directions, `/inventory` echo, card projection + in-context toggle, and no-GateKit degradation. `node --check` clean. Status: harness-passed; live proof is the playthrough in the design proposal's definition of done.
