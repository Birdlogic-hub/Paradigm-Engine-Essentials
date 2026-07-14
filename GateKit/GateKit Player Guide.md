# ~ GateKit — How It Works ~

*A silent referee for your adventure.*

## What is GateKit?

GateKit is an invisible dungeon master sitting between you and the story. Every time you take an action, it quietly asks the AI one question before anything gets written: *"Given the story so far — and a bit of luck — does this actually work?"*

The AI rules on your action first, then writes the story to match its own ruling. You never see the machinery. You just notice that the world has rules now: bold plans can fail, desperate gambles can pay off, and leaping to the moon from your dorm room gets you a confused look instead of a lunar landing.

## How a turn plays out

1. **You act.** Type your action as you normally would — "You pick the lock", "You try to talk your way past the guard."
2. **Luck is rolled.** Behind the scenes, your action gets a luck score from 1 to 100. You don't choose it and you can't see it coming — that's the dice-under-the-table part.
3. **The referee rules.** The AI weighs your action against the story (Is this plausible? Is it hard? Does luck even apply?) and decides: **success**, **partial**, or **fail** — and how difficult the attempt was: **trivial**, **minor**, **major**, or **impossible**.
4. **The story obeys.** The narration you read already reflects the ruling. A *partial* on lockpicking might get the first tumbler to click before the pick slips. A *fail* on sweet-talking the guard means the guard isn't having it. An *impossible* keeps your feet on the ground, no matter how hard you jump.

## Things worth knowing

**Luck sticks to the action.** If you hit Retry, the same luck score applies — you get a different telling of the same fate, not a fresh roll. Rewording your action won't fish a better number out of the bag.

**Trivial and impossible actions ignore luck.** Opening an unlocked door doesn't need a good roll, and no roll is good enough to breathe in space. Luck matters in the contested middle, where it should.

**Only your actions are judged.** The referee rules on what *you* attempt (Do / Say / Story turns). It stays silent when the AI is just continuing the scene.

**It's a fairness layer, not a stat system.** GateKit doesn't track health, inventory, or skills — it just makes outcomes honest. Other systems can build on its rulings.

## The GateKit Config card

If the scenario includes the StoryCard module, a story card named **GateKit Config** appears in your cards list on your first action. It's the referee's settings panel — edit the values right in the card's entry:

```
# GateKit Config
> Edit the values after each colon, then continue your story.

Enabled: true
Report: true
Luck Min: 1
Luck Max: 100
Show Toast: false
Debug Console: true
Debug Footer: false
```

What each one does:

- **Enabled** — the referee's on/off switch, live: edit it any time and it applies on your next action.
- **Report** — whether the referee writes to the Event Log card (below).
- **Luck Min / Luck Max** — the luck range rolled for each action. The referee is told the range too, so shrinking it (say, 1–20) genuinely changes how swingy fate feels. Max must be above Min.
- **Show Toast** — reserved; AID's toast display isn't implemented in the current UI.
- **Debug Console** — logs referee activity to the scripting editor's Console Log. Invisible to players; harmless to leave on.
- **Debug Footer** — appends a diagnostic box to every output. Playtesting only — turn this **off** for real play, since the footer becomes part of the story history.

The card heals itself: edits take effect on your next action, anything invalid (like `Luck Max: banana`) quietly falls back to its default, and if you delete a line it grows back. You can't break the referee from here — worst case, it shrugs and uses defaults.

## The Event Log card

The engine's event log — like the combat log in a classic RPG. The **Event Log** story card keeps the last 10 engine events, newest at the top (story cards read top-down), each stamped with the turn it happened on:

```
# Event Log — most recent first
T42 [Inventory] rock x1 removed (/throw)
T42 [GateKit] ruling: major difficulty → partial (leaping) · luck 68
T41 [GateKit] ruling: trivial difficulty → success · luck 12
```

Each engine module writes its own bracketed lines (inventory changes will appear here too, once that module is installed). Old events scroll off the bottom; erased turns vanish from the log. It rewrites itself as you play.

## FAQ

**Why did my action fail? It wasn't even hard.**
Some combination of difficulty and an unlucky roll. Partial successes and occasional failures are the point — they're what make the successes feel earned.

**Something printed a "GK DEBUG" box in my story. What is that?**
The scenario creator left playtest instrumentation on. It's harmless, but tell them to set `DEBUG_FOOTER: false` in the library settings for release.

---

*GateKit is a Paradigm Engine module by bottledfox. Look for a **GateKit Config** story card in your adventure — luck range and toggles are editable right in the card's entry, and any line you break quietly heals back to its default.*
