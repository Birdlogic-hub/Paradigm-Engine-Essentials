# Paradigm Engine Essentials

A modular scripting engine for [AI Dungeon](https://aidungeon.com): four small modules that work alone or together, plus ready-to-paste bundles.

## Engine Modules

- **RegexLib** — Shared parsing and command grammar.
- **CardLib** — Story card projection and configuration.
- **GateKit** — Silent action adjudication and skill checks.
- **InventoryKit** — Deterministic inventory and currency management.
- **BridgeKit** — Compatibility shim for running the Essentials alongside [Inner Self](https://github.com/LewdLeah/Inner-Self) (included only in the Inner Self bundle).

## Installation

Each scenario has four scripting tabs (Library, Input, Context, Output). Pick ONE flavor:

**PE Essentials (standalone):** paste the four `PE Essentials - *.js` files into their matching tabs.

**PE Characters** (the full character stack): paste the four `PE Characters - *.txt` files. Everything above plus [Inner Self + Auto-Cards](https://github.com/LewdLeah/Inner-Self) (NPC memory and agency), [Living Characters](https://github.com/LivingNarratives/LivingCharacters) (autonomous NPC social pressures + Thought Cards), and SlowBurn (NPC personality evolution via an editable Evolution Stages card — dormant until you fill in a Character Name). Do not also install any of the included scripts separately.

Editable settings appear in-game as story cards (`GateKit Config`, `Inventory Config`) from your first action; the `Event Log` card shows what the engine is doing as you play.

## Player Guides

The *GateKit* and *InventoryKit* folders contain guides for how to use either module.

## Development

Module sources live one folder per module; the paste bundles are generated — never edit bundles directly:

```
node make-bundle.js   # regenerates both Library bundles from module sources
node test/run.js      # runs all harness suites (also runs in CI on every push)
```

## Credits & licenses

- Paradigm Engine Essentials by **bottledfox** — see [LICENSE](LICENSE).
- The `PE Characters` bundle redistributes **[Inner Self](https://github.com/LewdLeah/Inner-Self) v1.0.2 (with bundled Auto-Cards) by LewdLeah**, pinned unmodified — free and open source, all credit to her. If you only want Inner Self, get it from her repository.
- It additionally redistributes **[Living Characters](https://github.com/LivingNarratives/LivingCharacters) v2.59c by LivingNarratives** (MIT — see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md); their GitHub is the source of truth for standalone use) and **SlowBurn**, a community script of unknown authorship, included unmodified — author, if that's you: say the word for credit or removal.
