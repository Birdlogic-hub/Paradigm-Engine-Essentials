# ~ SlashInventory — How It Works ~

*Your pockets, kept honest.*

## What is SlashInventory?

SlashInventory tracks what your character actually has — items and money — so the AI can't quietly forget your sword or invent a fortune you never earned. You manage it with slash commands; the story handles everything else.

The golden rule: **your commands always work; the world decides what they mean.** When you `/throw rock at goblin`, the rock *definitely* leaves your pack — but whether it hits the goblin is up to the story's silent referee (GateKit). Bookkeeping is certain. Consequences are earned.

## The commands

| Type this | What happens |
|---|---|
| `/take 3 torches` | Add items to your pack (any name you like) |
| `/collect 50 gold` | Add money to your wallet |
| `/drop 2 torches` | Remove items — no questions asked |
| `/give 20 gold to the guard` | Hand something over |
| `/throw rock at the goblin` | Spend an item at a target |
| `/use potion` | Consume exactly one |
| `/undo` | Reverse your last inventory change |
| `/inventory` or `/inv` | See everything you're carrying |

Amounts work in either order (`/drop 3 potions` and `/drop potions 3` both work), multi-word items are fine (`/take key to the cellar`), and the command turn is rewritten into normal story text — the AI sees "You throw the rock at the goblin," never the slash.

## Winning, losing, and the referee

Each verb follows one of three rules, set by the scenario creator (and editable in the **Inventory Config** card):

- **none** — pure bookkeeping. The action happens, the referee doesn't even look up. (Default for `/drop`.)
- **outcome** — the default for most verbs. Your change is applied immediately, and the referee rules on what it *causes*. Throw a rock on a bad roll: the rock is gone (you did throw it), it just misses. Try to `/take` something implausible on a bad roll: you'll see `{You failed to get the golden idol.}` — the reach happened, the grab didn't.
- **gated** — the strict mode. Nothing changes hands until the referee allows it. `/take ten dragon eggs` in a gated scenario gets you `{The attempt fails — nothing gained.}` and empty pockets.

One asymmetry worth knowing: on a failed ruling, *getting* things rolls back, but *spending* things never refunds. You can fail to grab a lantern; you cannot un-throw a rock.

## Your cards

- **Inventory** — your pack and wallet, always current:

  ```
  ## Wallet
  - gold: 30

  ## Inventory
  - Potion x 2
  - rope x 1
  ```

- **Inventory Config** — the rules panel. Change a verb's arbitration (`none` / `outcome` / `gated`), or set `Inventory In Context: true` if you want the AI always aware of your holdings (costs a little context each turn). Edits apply next action; broken lines heal back to defaults.
- **Event Log** — every inventory change shows up as a `[Inventory]` line alongside the referee's rulings: `T42 [Inventory] rock x1 removed (/throw)`.

## Things worth knowing

**Retry is safe.** Retrying a command turn won't double-drop or double-take — the engine replays the same result instead of re-running it.

**You can't overspend.** `/drop 5 rope` when you have one gets a polite `{You only have 1 rope.}` and nothing changes.

**`/undo` is your friend.** It reverses the last change (up to 20 back), and it's never judged by the referee — it's bookkeeping, not story.

**Unknown items are refused, not judged.** `/use excalibur` when you don't have one just tells you so.

## FAQ

**I threw something and missed — where's my item?**
Spent. The throw happened; the hit didn't. That's the `outcome` rule working as intended. If your scenario uses `gated` instead, failed attempts cost nothing.

**Why didn't `/take` give me the item?**
Either the referee ruled the grab a failure (check the Event Log for `rolled back`), or the scenario runs `gated` and the ruling didn't allow it.

**Can I rename or organize items?**
Item names are exactly what you typed when you took them — `/take Rusty Key` and `/take rusty key` are the same item (matching ignores case, display keeps your first spelling).

---

*SlashInventory is a Paradigm Engine module by bottledfox, rebuilt from the Stackable Inventory System. It plays best with GateKit (the referee) — without it, everything still works and every command simply succeeds.*
