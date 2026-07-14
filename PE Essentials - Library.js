// ===== RegexLib v0.1.1 =====
// script by bottledfox
//
// Paradigm Engine primitive: THE GRAMMAR.
// Player text is hostile: AID wraps it in narration ("> You /take sword."),
// auto-punctuates it, and quotes it in Say turns — and the nouns worth
// matching (items, NPCs, spells) are arbitrary strings no fixed grammar can
// anticipate. So the grammar is data: callers hand in their live candidate
// lists and RegexLib turns free text into clean commands and canonical nouns.
//
// doctrine:
//   - candidates are INJECTED — no module's state is read from in here
//   - commas survive normalization
//   - trailing quotes from Say-framing are scrubbed
//   - the inventory||wallet fallthrough stays with callers
//
// Stateless: pure functions, no hooks, no state namespace, nothing persisted.
//
// SEAMS:
//   RX_escape(s)                         regex-literal escape for any string
//   RX_normalize(text)                   scrub AID input framing (for commands)
//   RX_command(text, names?)             "/verb args" → {name, args} | null
//   RX_matchOne(candidates, text)        canonical noun at start of text
//   RX_findIn(candidates, text)          canonical noun anywhere in text
//   RX_amount(args, def?)                leading integer → {amount, remainder}
//   RX_nounAndAmount(candidates, args)   "3 potions" / "potions 3" ergonomics
//   RX_csv(s)                            comma list, trimmed, de-perioded
//   RX_tail(s)                           leftover text as a narration tail
//   RX_keyValue(line)                    "Key: value" / "key=value" → {key, value}
// ---------------------------------------------------------------------------

// Escape every regex metacharacter so any string can be dropped into a
// RegExp as a literal — the enabler for data-driven matching ("Wand (+1)").
function RX_escape(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Scrub AID's input framing so command parsing sees clean text.
// "> You /take sword."      → "/take sword"
// '> You say "/drop 3 x"'   → "/drop 3 x"
// Commas are preserved (comma-separated command args are legal grammar).
function RX_normalize(text) {
    let t = String(text || "").trim();              // FIRST: shed leading/trailing whitespace
    t = t.replace(/^\s*>\s*you\b[:\-]?\s*/i, "");   // strip "> You" action framing
    t = t.replace(/^[^/]*?(?=\/)/, "");             // drop anything before the first slash
    t = t.replace(/[\s.!?"'””'’]+$/, "");           // trailing junk in ONE class: whitespace,
                                                    // auto-punctuation, Say-quotes — in any
                                                    // order/mix ('."\n', '?!"', etc.)
    return t.trim();
}
// v0.1.1 (live-found by GateKit's /check, 7/13/2026): live AID input carries a
// trailing newline the harness never simulated. v0.1.0 stripped punctuation
// BEFORE trimming, so "/check.\n" kept its period and failed the command
// grammar. Trim first; strip all trailing junk as one class. Order-immune.

// Parse a slash command. Grammar: slash, identifier, optional args.
// `names` (string or array) optionally filters to a module's own verbs,
// so a cheap null answers "is this turn mine?".
function RX_command(text, names) {
    const t = RX_normalize(text);
    const m = t.match(/^\/([a-z][a-z0-9_]*)\b(?:\s+(.*))?$/i);
    if (!m) return null;
    const name = m[1].toLowerCase();
    if (names !== undefined) {
        const list = Array.isArray(names) ? names : [names];
        if (list.map(n => String(n).toLowerCase()).indexOf(name) === -1) return null;
    }
    return { name: name, args: (m[2] || "").trim() };
}

// Deduplicate + longest-first order: the guard against prefix capture
// ("key" must never shadow "key to the cellar").
function RX_prep(candidates) {
    const seen = {};
    const uniq = [];
    for (const c of (Array.isArray(candidates) ? candidates : [])) {
        const name = String(c || "").trim();
        if (!name) continue;
        const k = name.toLowerCase();
        if (!seen[k]) { seen[k] = true; uniq.push(name); }
    }
    uniq.sort((a, b) => b.length - a.length);
    return uniq;
}

// Match a known noun at the START of text. Case-insensitive for identity,
// case-preserving for display (returns the canonical candidate). The
// lookahead boundary is stricter than \b — it behaves around names ending
// in ")", "+", "'" — and consumes nothing, keeping the remainder intact.
function RX_matchOne(candidates, text) {
    const s = String(text || "").trim();
    if (!s) return null;
    for (const name of RX_prep(candidates)) {
        const rx = new RegExp("^\\s*" + RX_escape(name) + "(?=[\\s,.;:!?)'\"”]|$)", "i");
        const m = s.match(rx);
        if (m) return { match: name, remainder: s.slice(m[0].length).trim() };
    }
    return null;
}

// Find a known noun ANYWHERE in text (trigger/name detection — the
// Draftworlds world-matching and HoV gem-detection lineage). Longest-first,
// boundary-guarded on both sides.
function RX_findIn(candidates, text) {
    const s = String(text || "");
    if (!s) return null;
    for (const name of RX_prep(candidates)) {
        const rx = new RegExp("(?:^|[\\s,.;:!?('\"”])" + RX_escape(name) + "(?=[\\s,.;:!?)'\"”]|$)", "i");
        if (rx.test(s)) return name;
    }
    return null;
}

// Pull an optional leading integer. "/drop 3 potions" → {amount: 3, ...}.
function RX_amount(argStr, defaultAmount) {
    const def = (typeof defaultAmount === "number") ? defaultAmount : 1;
    const tokens = String(argStr || "").trim().split(/\s+/).filter(Boolean);
    if (tokens.length && /^\d+$/.test(tokens[0])) {
        return { amount: parseInt(tokens[0], 10), remainder: tokens.slice(1).join(" ") };
    }
    return { amount: def, remainder: String(argStr || "").trim() };
}

// The ergonomic core: amount-first OR noun-first, with a trailing-amount
// re-check. "/drop 3 potions", "/drop potions 3", "/drop potion" all work.
// Returns {name, amount, tail} or null when no candidate matches.
function RX_nounAndAmount(candidates, args, defaultAmount) {
    const def = (typeof defaultAmount === "number") ? defaultAmount : 1;
    const s = String(args || "").trim();
    if (!s) return null;
    const tokens = s.split(/\s+/);
    let amount, m;
    if (/^\d+$/.test(tokens[0])) {
        amount = parseInt(tokens[0], 10);                       // Case A: amount first
        m = RX_matchOne(candidates, tokens.slice(1).join(" "));
        if (!m) return null;
        const re = RX_amount(m.remainder, amount);              // trailing amount re-check
        amount = re.amount;
        return { name: m.match, amount: amount, tail: RX_tail(re.remainder) };
    }
    m = RX_matchOne(candidates, s);                             // Case B: noun first
    if (!m) return null;
    const re = RX_amount(m.remainder, def);
    return { name: m.match, amount: re.amount, tail: RX_tail(re.remainder) };
}

// Comma list → trimmed entries, trailing periods stripped, empties dropped.
function RX_csv(s) {
    if (!s) return [];
    return String(s).split(",").map(x => x.trim().replace(/\.+$/, "")).filter(Boolean);
}

// Leftover text as a narration tail (" on the table"), or "".
function RX_tail(argStr) {
    const t = String(argStr || "").trim();
    return t ? " " + t : "";
}

// One "Key: value" / "key=value" line → {key, value} | null.
// The delimiter tolerance lesson from GateKit's live tuning, made reusable.
function RX_keyValue(line) {
    const m = String(line || "").match(/^\s*([A-Za-z][A-Za-z0-9 _-]*?)\s*[=:]\s*(.+?)\s*$/);
    if (!m) return null;
    return { key: m[1].trim(), value: m[2].trim() };
}

// ===== ParaCards v0.3.2 =====
// script by bottledfox
//
// Paradigm Engine primitive: THE PROJECTION.
// Gameplay state lives in state.vars; story cards are renderings of it —
// built by code, shown to player and model, never parsed back into state.
// The one sanctioned reverse direction is the CONFIG CARD: a card the player
// edits and code reads, making story cards the engine's settings UI
// (the Auto-Cards convention, proven again by SIS's Custom Commands card).
//
// Stateless by design: pure functions over the storyCards array. No hooks,
// no state namespace, nothing persisted — the only primitive that can say that.
//
// SEAMS:
//   SC_get(title) / SC_find(pred, all)   lookup
//   SC_ensure(title, opts)               idempotent create → card
//   SC_render(title, entry, opts)        projection write (only when changed)
//   SC_remove(title)                     delete by title
//   SC_config(title, defaults, opts)     editable settings card, typed round-trip
//   SC_reportEnsure()                    Event Log card exists (Turn-1 seam)
//   SC_ALWAYS_ON                         keys value that triggers every turn
//
// v0.3.2: SC_reportEnsure() — owners materialize the Event Log on their input
// pass (doctrine rule 11: projections exist from Turn 1, never lazily).
// Unconditional load canary (rule 8/10: environment bisection needs one).
// ---------------------------------------------------------------------------

// A lone period matches every turn — the always-on card trick (RESR's Condition).
const SC_ALWAYS_ON = ".";

// Load canary
try {
    if (typeof log === "function") log("[ParaCards] library loaded (v0.3.2)");
} catch (e) {}

// --- Lookup ---------------------------------------------------------------------
function SC_find(pred, all) {
    if (typeof pred !== "function" || !Array.isArray(storyCards)) return all ? [] : null;
    if (all) return storyCards.filter(c => c && pred(c));
    for (const c of storyCards) {
        if (c && pred(c)) return c;
    }
    return null;
}

function SC_get(title) {
    return SC_find(c => c.title === title);
}

function SC_indexOf(title) {
    if (!Array.isArray(storyCards)) return -1;
    return storyCards.findIndex(c => c && c.title === title);
}

// --- Create / write ----------------------------------------------------------------
// Idempotent: returns the existing card, or creates one via the platform API
// (never by pushing raw objects — the API is authoritative; index drift is real).
// opts: { type = "Custom", keys = title, entry = "", description = "" }
function SC_ensure(title, opts) {
    opts = opts || {};
    let card = SC_get(title);
    if (card) return card;
    addStoryCard(title, String(opts.entry || ""), opts.type || "Custom");
    card = SC_get(title);
    if (!card) return null;   // platform refused (duplicate keys elsewhere)
    if (opts.keys && opts.keys !== title) card.keys = String(opts.keys);
    if (opts.description) card.description = String(opts.description);
    return card;
}

// Projection write: state → card. Creates if missing; writes only on change
// so untouched cards don't churn their updatedAt.
function SC_render(title, entry, opts) {
    const card = SC_ensure(title, Object.assign({}, opts, { entry: entry }));
    if (!card) return null;
    const next = String(entry || "");
    if (card.entry !== next) card.entry = next;
    return card;
}

function SC_remove(title) {
    const i = SC_indexOf(title);
    if (i === -1) return false;
    removeStoryCard(i);
    return true;
}

// --- Config cards: the settings UI --------------------------------------------------
// SETTINGS_KEY → "Settings Key" (the player-facing label)
function SC_labelFor(key) {
    return String(key).toLowerCase().split("_")
        .map(w => w ? w[0].toUpperCase() + w.slice(1) : "")
        .join(" ");
}

function SC_rxEscape(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Coerce a player-typed value to the type of its default. Garbage → default.
function SC_coerce(raw, def) {
    const s = String(raw).trim();
    if (typeof def === "boolean") {
        if (/^(true|on|yes|1)$/i.test(s)) return true;
        if (/^(false|off|no|0)$/i.test(s)) return false;
        return def;
    }
    if (typeof def === "number") {
        const n = Number(s);
        return Number.isFinite(n) ? n : def;
    }
    return s || def;
}

// The editable settings card. Ensures a card rendering `defaults` as
// "Label: value" lines, parses the player-edited entry back with types
// inferred from the defaults, heals missing lines (module upgrades add
// settings without wiping player edits), and returns the merged object.
// Invalid edits silently fall back to the default for that key.
// opts: { type = "config", keys = title, header, description }
function SC_config(title, defaults, opts) {
    opts = opts || {};
    const header = opts.header
        || ("# " + title + "\n> Edit the values after each colon, then continue your story.");
    let card = SC_get(title);
    if (!card) {
        const lines = Object.keys(defaults).map(k => SC_labelFor(k) + ": " + String(defaults[k]));
        card = SC_ensure(title, {
            type: opts.type || "config",
            keys: opts.keys || title,
            entry: header + "\n\n" + lines.join("\n"),
            description: opts.description || ""
        });
        if (!card) return Object.assign({}, defaults);   // platform refused; run on defaults
    }
    const out = {};
    let entry = String(card.entry || "");
    let healed = false;
    for (const k in defaults) {
        const label = SC_labelFor(k);
        const rx = new RegExp("^\\s*" + SC_rxEscape(label) + "\\s*:\\s*(.+?)\\s*$", "im");
        const m = entry.match(rx);
        if (!m) {
            entry += "\n" + label + ": " + String(defaults[k]);
            healed = true;
            out[k] = defaults[k];
            continue;
        }
        out[k] = SC_coerce(m[1], defaults[k]);
    }
    if (healed) card.entry = entry;
    return out;
}

// --- The Codex: cards from an index, materialized on contact -----------------------
// Combed from Pokémon Mystery Dungeon's Pokédex registry (ensurePokemonCards):
// a catalog of potential cards, built into real story cards only when their
// subject actually enters the story text. Deterministic, data-driven, and
// cheap — Auto-Cards' living-world effect without generation cost.
//
// index: array of { title, entry, type?, aliases? }
//   aliases: extra names that also count as the subject appearing (e.g.
//   ["Pikachu", "the yellow mouse"]). The title always counts.
// text: whatever the caller wants scanned — player input, model output, or both.
// opts: { max }  cap on cards materialized per call (0/undefined = unlimited).
//
// Two-tier scan (PMD's efficiency, plus a fix for its latent bug):
//   1. one toLowerCase + native includes() per alias — fast prescreen, no regex
//   2. boundary-regex confirm ONLY on prescreen hits — so "Mew" no longer
//      materializes when "Mewtwo" walks in (includes() alone can't tell)
// Already-materialized titles are skipped via one Set built per call.
// Returns the array of titles created this call.
function SC_codex(index, text, opts) {
    const created = [];
    if (!Array.isArray(index) || !index.length) return created;
    const hay = String(text || "");
    if (!hay.trim()) return created;
    const hayLower = hay.toLowerCase();
    const max = (opts && typeof opts.max === "number" && opts.max > 0) ? opts.max : Infinity;

    // Existing titles, one pass
    const have = {};
    if (Array.isArray(storyCards)) {
        for (const c of storyCards) {
            if (c && c.title) have[String(c.title).toLowerCase()] = true;
        }
    }

    for (const e of index) {
        if (created.length >= max) break;
        if (!e || !e.title || !e.entry) continue;
        const title = String(e.title);
        if (have[title.toLowerCase()]) continue;

        const names = [title].concat(Array.isArray(e.aliases) ? e.aliases : []);
        let hit = null;
        for (const n of names) {
            const name = String(n || "").trim();
            if (!name) continue;
            // Tier 1: cheap substring prescreen
            if (hayLower.indexOf(name.toLowerCase()) === -1) continue;
            // Tier 2: boundary confirm (kills the Mew-in-Mewtwo false positive)
            const rx = new RegExp("(?:^|[^A-Za-z0-9])" + SC_rxEscape(name) + "(?=[^A-Za-z0-9]|$)", "i");
            if (rx.test(hay)) { hit = name; break; }
        }
        if (!hit) continue;

        const card = SC_ensure(title, {
            type: e.type || "codex",
            keys: names.join(","),
            entry: String(e.entry)
        });
        if (card) {
            have[title.toLowerCase()] = true;
            created.push(title);
        }
    }
    return created;
}

// --- The Event Log: the engine's rolling event log ---------------------------------
// A classic RPG event log: the last N ENGINE EVENTS, newest first (story card
// entries render top-down in the UI, so the most recent event sits at the
// top). Each event is one line, stamped with the turn it happened on:
//
//   T42 [Inventory] rock x1 removed (/throw)
//   T42 [GateKit] ruling: major difficulty -> partial (leaping) · luck 68
//   T41 [GateKit] ruling: trivial difficulty -> success · luck 12
//
// Stateless trick: the CARD is the archive — events are parsed from the entry
// itself, so ParaCard keeps no state. Retry re-posts dedupe by exact line;
// an Erase (actionCount rewinds) drops events from erased turns first.
// Keys are title-scoped — the log is player UI, never model context.
const SC_REPORT_CARD = "Event Log";
const SC_REPORT_EVENTS = 10;
const SC_REPORT_HEADER = "# Event Log — most recent first";

// Turn-1 materialization seam (doctrine rule 11): owner modules call this on
// their input pass so the Event Log is visible from the first action — an
// empty log card, header only, instead of a card that hides until first post.
function SC_reportEnsure() {
    return SC_ensure(SC_REPORT_CARD, {
        type: "report",
        keys: SC_REPORT_CARD,
        entry: SC_REPORT_HEADER,
        description: "The engine's event log: the last " + SC_REPORT_EVENTS
            + " engine events, most recent first. Rewrites itself as you play."
    });
}

function SC_report(owner, line, turnNo) {
    const msg = "[" + String(owner || "engine") + "] " + String(line || "").trim();
    if (msg.length < 4) return null;
    const turn = (typeof turnNo === "number") ? turnNo
        : (typeof info === "object" && info && typeof info.actionCount === "number")
            ? info.actionCount : -1;
    const event = "T" + turn + " " + msg;
    const card = SC_reportEnsure();
    if (!card) return null;

    // Parse existing events from the entry (lines shaped "T<turn> [...] ...")
    const events = [];
    for (const l of String(card.entry || "").split("\n")) {
        const m = l.match(/^T(-?\d+)\s+(\[.*)$/);
        if (m) events.push({ turn: parseInt(m[1], 10), text: l.trim() });
    }

    // Erase rewinds actionCount: drop events from turns that no longer exist
    let kept = events.filter(e => e.turn <= turn);

    // Retry dedupe: identical event for this turn already logged
    if (!kept.some(e => e.turn === turn && e.text === event)) {
        kept.unshift({ turn: turn, text: event });   // newest first
    }
    kept = kept.slice(0, SC_REPORT_EVENTS);

    card.entry = SC_REPORT_HEADER + "\n" + kept.map(e => e.text).join("\n");
    return card;
}

// ===== GateKit v0.6.2 =====
// script by bottledfox
//
// Paradigm Engine primitive: THE CHECK.
// Code cannot judge story consistency; the model can. So: pose one question
// about the player's action in the strongest context position, receive one
// machine-readable ruling in-band, and expose it as engine state for other
// primitives to consume.
//
// LINEAGE (all changes playtest-driven; full history in ROADMAP):
//   v0.4.x — schema-migrating state; delivery-first Recent-Story trimming vs
//     maxChars; non-adjudicable command turns; semantic do/say/story guard;
//     difficulty-first verdict schema (premise before conclusion); =/: delimiter
//     tolerance; impossible=>fail backstop; near-miss telemetry ("prompt
//     strictly, parse generously"). LIVE-PROVEN 7/13/2026.
//   v0.5.x — "GateKit Config" card via ParaCard (SC_config); /check parsing via
//     RegexLib (RX_command). First Core consumer.
//   v0.6.0 — /check REMOVED (the config card superseded it; its live failure
//     found RegexLib v0.1.1's normalizer bug on the way out). The Enabled
//     switch is now LIVE: read from the config card every turn — edit the card
//     mid-game to toggle the checker. NEW SEAM: GK_markCommandTurn() lets any
//     module (Inventory's /undo, /inventory, ...) stamp the current turn as
//     pure bookkeeping so the arbiter skips it. Echo channel removed with its
//     only user.
//   v0.6.1 — posts each turn's ruling to the "Event Log" card
//     (ParaCard's SC_report — the engine's player-facing event log). Live
//     Report switch in the config card.
//
// WIRING:
//   Input tab:    text = GK_onInput(text);       // per-action luck roll
//   Context tab:  text = GK_onContext(text);     // LAST, after other passes
//   Output tab:   text = GK_onOutput(text);      // FIRST, before other passes
//                 text = GK_onOutputDebug(text); // optional, while playtesting
//
// SEAMS (for other modules):
//   GK_lastCheck()        → {result, difficulty, skill, luck, turn} | null
//   GK_setLuck(n)         → supply/bend this action's luck (clamped to range)
//   GK_markCommandTurn()  → stamp this turn non-adjudicable (bookkeeping)
// ---------------------------------------------------------------------------

// Defaults. With ParaCard present these seed the editable "GateKit Config"
// card and back-fill any line the player deletes or mangles.
const GK_SETTINGS = {
    ENABLED: true,              // the checker; LIVE — card edits apply next action
    LUCK_MIN: 1,                // luck roll range, rolled once per action
    LUCK_MAX: 100,              // (retries of the same action keep their roll)
    REPORT: true,               // post rulings to the "Event Log" card (needs ParaCard)
    SHOW_TOAST: false,          // state.message — NOT implemented on Phoenix UI
    DEBUG_CONSOLE: true,        // mirror GK activity to the editor's CONSOLE LOG
    DEBUG_FOOTER: false         // GK_onOutputDebug appends a visible footer (playtesting)
};

// The arbiter block. {{LUCK}}/{{MIN}}/{{MAX}} substituted at context time.
const GK_PROMPT = [
    "<SYSTEM>",
    "You are the silent arbiter of player actions. Before narrating, decide the outcome of the player's most recent action based on story consistency and luck.",
    "luck={{LUCK}}",
    "Luck is {{MIN}} min, {{MAX}} max. Luck does not apply to impossible or trivial actions.",
    "First output EXACTLY one line, deciding difficulty BEFORE the check:",
    "difficulty=trivial|minor|major|impossible; check=success|partial|fail; skill=name;",
    "Rules: impossible always fails. Trivial always succeeds. Luck sways only minor and major attempts. Omit the skill field if no skill applies.",
    "Then continue the story, honoring the verdict.",
    "</SYSTEM>"
].join("\n");

// Load canary: appears in Console Log / Script Test logs on EVERY hook run.
// If you don't see this line, the Library isn't attached, saved, or executing.
try {
    if (GK_cfg().DEBUG_CONSOLE) log("[GateKit] library loaded (v0.6.2)");
} catch (e) {}

// Verdict line emitted by the model (difficulty-first schema). skill optional.
// Delimiters =/: and separators ;/, accepted — prompt strictly, parse generously.
const GK_VERDICT_RX = /^\s*difficulty\s*[=:]\s*(trivial|minor|major|impossible)\s*[;,]\s*check\s*[=:]\s*(success|partial|fail)\s*[;,]?\s*(?:skill\s*[=:]\s*([^;\n]+?)\s*[;,]?\s*)?$/im;
// Legacy order (check-first), still accepted — models sometimes echo old context.
const GK_VERDICT_RX_LEGACY = /^\s*check\s*[=:]\s*(success|partial|fail)\s*[;,]\s*difficulty\s*[=:]\s*(trivial|minor|major|impossible)\s*[;,]?\s*(?:skill\s*[=:]\s*([^;\n]+?)\s*[;,]?\s*)?$/im;

// --- Live settings ---------------------------------------------------------------
// The editable "GateKit Config" card when ParaCard is present, built-in
// defaults otherwise. Cached per hook execution (the Library re-runs before
// each hook, so the cache naturally refreshes every pass).
let GK_CFG_CACHE = null;
function GK_cfg() {
    if (GK_CFG_CACHE) return GK_CFG_CACHE;
    let cfg;
    if (typeof SC_config === "function") {
        try {
            cfg = SC_config("GateKit Config", GK_SETTINGS, {
                description: "Settings for GateKit (the silent checker). Edit values in the entry; "
                    + "changes apply on your next action. Deleted or invalid lines fall "
                    + "back to defaults. Enabled toggles the checker on/off."
            });
        } catch (e) {
            cfg = Object.assign({}, GK_SETTINGS);
        }
    } else {
        cfg = Object.assign({}, GK_SETTINGS);
    }
    cfg.LUCK_MIN = Math.max(0, Math.min(999, Math.round(cfg.LUCK_MIN)));
    cfg.LUCK_MAX = Math.max(cfg.LUCK_MIN + 1, Math.min(1000, Math.round(cfg.LUCK_MAX)));
    GK_CFG_CACHE = cfg;
    return cfg;
}

// --- State (schema-migrating) --------------------------------------------------
// Never trust the shape of persisted state: an adventure may carry a GK object
// written by ANY earlier version. Backfill field-by-field; sweep dead fields.
function GK_state() {
    if (!state.vars || typeof state.vars !== "object") state.vars = {};
    if (!state.vars.GK || typeof state.vars.GK !== "object") state.vars.GK = {};
    const GK = state.vars.GK;
    if (typeof GK.luck !== "number") GK.luck = null;
    if (typeof GK.luckTurn !== "number") GK.luckTurn = -1;
    if (typeof GK.commandTurn !== "number") GK.commandTurn = -1;
    if (!Object.prototype.hasOwnProperty.call(GK, "lastCheck")) GK.lastCheck = null;
    if (!Array.isArray(GK.log)) GK.log = [];
    delete GK.on;     // v0.5.x runtime toggle — superseded by live cfg.ENABLED
    delete GK.echo;   // v0.5.x /check reply channel — removed with /check
    return GK;
}

function GK_turn() {
    return (info && typeof info.actionCount === "number") ? info.actionCount : -1;
}

function GK_log(msg) {
    const GK = GK_state();
    GK.log.push("[" + GK_turn() + "] " + msg);
    if (GK.log.length > 20) GK.log.shift();
    if (GK_cfg().DEBUG_CONSOLE) {
        try { log("[GateKit " + GK_turn() + "] " + msg); } catch (e) {}
    }
}

// --- Seams -----------------------------------------------------------------------
// Latest ruling, for any module that wants to react to it.
function GK_lastCheck() {
    return GK_state().lastCheck;
}

// Another module may supply or bend this action's luck (clamped to range).
// Call during the Input pass.
function GK_setLuck(value) {
    const GK = GK_state();
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const cfg = GK_cfg();
    GK.luck = Math.max(cfg.LUCK_MIN, Math.min(cfg.LUCK_MAX, Math.round(n)));
    GK.luckTurn = GK_turn();
}

// Stamp the current turn as pure bookkeeping (a swallowed slash command, a
// meta action) so the arbiter skips it. Call from any module's Input pass.
function GK_markCommandTurn() {
    GK_state().commandTurn = GK_turn();
}

// --- Input: per-action luck roll ---------------------------------------------------
function GK_onInput(text) {
    const GK = GK_state();
    // One luck roll per action; retries of the same action reuse it.
    const turn = GK_turn();
    if (GK.luckTurn !== turn) {
        const cfg = GK_cfg();
        GK.luckTurn = turn;
        GK.luck = cfg.LUCK_MIN
            + Math.floor(Math.random() * (cfg.LUCK_MAX - cfg.LUCK_MIN + 1));
        // v0.6.2, doctrine rule 11: projections exist from Turn 1 — the
        // Event Log materializes here, not on the first ruling post.
        if (cfg.REPORT && cfg.ENABLED && typeof SC_reportEnsure === "function") SC_reportEnsure();
    }
    return String(text || "");
}

// --- Context: append the arbiter block at the strongest position ----------------
function GK_onContext(text) {
    const GK = GK_state();
    let ctx = String(text || "");
    const cfg = GK_cfg();
    if (!cfg.ENABLED) return ctx;   // LIVE switch — the config card decides

    // Bookkeeping turns aren't adjudicable (GK_markCommandTurn seam).
    if (GK.commandTurn === GK_turn()) return ctx;

    // Semantic guard: only real player actions get adjudicated. Starts,
    // Continues, and see-turns are not player narrative actions.
    try {
        const last = history && history[history.length - 1];
        if (!last || ["do", "say", "story"].indexOf(last.type) === -1) return ctx;
    } catch (e) {}

    // Roll here too in case no input pass ran this action (safety net).
    const turn = GK_turn();
    if (GK.luckTurn !== turn || GK.luck == null) {
        GK.luckTurn = turn;
        GK.luck = cfg.LUCK_MIN
            + Math.floor(Math.random() * (cfg.LUCK_MAX - cfg.LUCK_MIN + 1));
    }

    const block = GK_PROMPT
        .replace(/\{\{\s*LUCK\s*\}\}/gi, String(GK.luck))
        .replace(/\{\{\s*MIN\s*\}\}/gi, String(cfg.LUCK_MIN))
        .replace(/\{\{\s*MAX\s*\}\}/gi, String(cfg.LUCK_MAX));

    // Delivery-first capacity policy: the injection is the module's job.
    const maxChars = (info && typeof info.maxChars === "number") ? info.maxChars : 0;
    const overflow = maxChars > 0 ? (ctx.length + block.length + 2) - maxChars : 0;
    if (overflow > 0) {
        const trimmed = GK_trimRecentStory(ctx, overflow);
        if (trimmed.length < ctx.length) {
            ctx = trimmed;
        } else {
            GK_log("no Recent Story header; injecting with ~" + overflow + " char overflow");
        }
    }
    return (ctx ? ctx + "\n\n" : "") + block;
}

// Remove ~n chars of the OLDEST sentences from the Recent Story portion.
// Returns the original context unchanged if no header is found.
function GK_trimRecentStory(ctx, n) {
    const m = ctx.match(/^\s*Recent Story\s*:?\s*$/im);
    if (!m || typeof m.index !== "number") return ctx;
    const bodyStart = m.index + m[0].length;
    const head = ctx.slice(0, bodyStart);
    let body = ctx.slice(bodyStart);
    let removed = 0;
    while (removed < n) {
        const cut = body.search(/[.!?…]\s+/);
        if (cut === -1) break;
        const sep = body.slice(cut).match(/^[.!?…]\s+/)[0].length;
        removed += cut + sep;
        body = body.slice(cut + sep);
    }
    GK_log("trimmed " + removed + " chars of oldest Recent Story to fit the arbiter block");
    return head + "\n" + body.trimStart();
}

// --- Output: capture the ruling, hide the scaffolding ----------------------------
let GK_DEBUG_RAW = null;   // raw model output, captured before any stripping

function GK_onOutput(text) {
    const GK = GK_state();
    let out = String(text || "");
    GK_DEBUG_RAW = out;

    let m = out.match(GK_VERDICT_RX);
    let legacy = false;
    if (!m) {
        m = out.match(GK_VERDICT_RX_LEGACY);
        legacy = true;
    }
    if (!m) {
        // Near-miss detector: an attempted verdict in a dialect we don't parse
        // yet. Strip it anyway (scaffolding must never reach the player) and
        // log it verbatim so each model rotation reports its own format.
        const first = out.split("\n").find(l => l.trim()) || "";
        if (first.length < 160
            && /\b(difficulty|check)\s*[-=:]/i.test(first)
            && /\b(trivial|minor|major|impossible|success|partial|fail)\b/i.test(first)) {
            GK_log("UNPARSED verdict-like line (add to parser): \"" + first.trim() + "\"");
            out = out.replace(first, "").replace(/\n{3,}/g, "\n\n").trim();
        }
    }
    if (m) {
        let result = (legacy ? m[1] : m[2]).toLowerCase();
        const difficulty = (legacy ? m[2] : m[1]).toLowerCase();
        // Normalize non-skills to null ("none", "n/a", "-", "null", "nothing")
        let skill = m[3] ? m[3].trim().toLowerCase() : null;
        if (skill && /^(none|n\/a|na|null|nothing|-+)$/.test(skill)) skill = null;
        // Deterministic backstop for contradictory rulings (seen live: success/impossible)
        if (difficulty === "impossible" && result !== "fail") {
            GK_log("coerced contradictory ruling " + result + "/impossible -> fail/impossible");
            result = "fail";
        }
        GK.lastCheck = {
            result: result,
            difficulty: difficulty,
            skill: skill,
            luck: GK.luck,
            turn: GK_turn()
        };
        out = out.replace(m[0], "").replace(/\n{3,}/g, "\n\n").trim();
        if (GK_cfg().SHOW_TOAST) {
            state.message = "Check: " + GK.lastCheck.difficulty + "/" + GK.lastCheck.result;
        }
        GK_log("difficulty=" + GK.lastCheck.difficulty + " check=" + GK.lastCheck.result + " luck=" + GK.luck);
    }

    // Event Log — the player-facing event log (ParaCard's SC_report).
    // Only on turns the arbiter was actually watching: enabled, player action,
    // not stamped as bookkeeping.
    try {
        const cfg = GK_cfg();
        if (cfg.REPORT && cfg.ENABLED && typeof SC_report === "function") {
            const last = history && history[history.length - 1];
            const playerTurn = last && ["do", "say", "story"].indexOf(last.type) !== -1;
            if (GK.commandTurn === GK_turn()) {
                SC_report("GateKit", "bookkeeping turn — not judged");
            } else if (playerTurn && m) {
                SC_report("GateKit", "ruling: " + GK.lastCheck.difficulty + " difficulty → "
                    + GK.lastCheck.result
                    + (GK.lastCheck.skill ? " (" + GK.lastCheck.skill + ")" : "")
                    + " · luck " + (GK.luck == null ? "-" : GK.luck));
            } else if (playerTurn) {
                SC_report("GateKit", "no ruling captured · luck " + (GK.luck == null ? "-" : GK.luck));
            }
        }
    } catch (e) {}
    return out;
}

// ============================ GK DEBUG SECTION =================================
// Playtest instrumentation. Wire AFTER GK_onOutput in the Output tab.
// Silence via the config card's Debug Footer / Debug Console switches, or
// delete this fenced section (and its call) once trusted.
// NOTE: the footer enters story history; use a throwaway test adventure.
function GK_onOutputDebug(text) {
    let out = String(text || "");
    try {
        const GK = GK_state();
        const cfg = GK_cfg();
        const turn = GK_turn();
        const c = GK.lastCheck;
        const hit = c && c.turn === turn;
        const raw = (GK_DEBUG_RAW == null) ? "(GK_onOutput did not run?)" : GK_DEBUG_RAW;
        const firstLine = (String(raw).split("\n").find(l => l.trim()) || "").slice(0, 100);
        const summary = "checker: " + (cfg.ENABLED ? "ON" : "OFF")
            + " | turn: " + turn
            + " | luck: " + (GK.luck == null ? "-" : GK.luck)
            + " | verdict this turn: " + (hit
                ? c.difficulty + "/" + c.result + (c.skill ? "/" + c.skill : "")
                : "NONE CAPTURED");
        if (cfg.DEBUG_CONSOLE) {
            try {
                log("[GK DEBUG] " + summary);
                log("[GK DEBUG] model's first line: \"" + firstLine + "\"");
            } catch (e) {}
        }
        if (cfg.DEBUG_FOOTER) {
            out += "\n\n----- GK DEBUG -----"
                + "\n" + summary.split(" | ").join("\n")
                + "\nmodel's first line: \"" + firstLine + "\""
                + "\nlog: " + ((GK.log || []).slice(-3).join("  |  ") || "(empty)")
                + "\n--------------------";
        }
    } catch (e) {
        try { log("[GK DEBUG] error: " + e); } catch (e2) {}
    }
    return out;
}
// ========================== END GK DEBUG SECTION ===============================

// ===== SlashInventory v0.1.2 =====
// script by bottledfox
//
// Paradigm Engine feature module: THE POSSESSION.
// (Module named SlashInventory; function prefix stays INV_ — it manages the
//  inventory, and the slash is how you talk to it.)
// Bookkeeping is deterministic; consequences are adjudicated. A slash command
// is the player exercising agency over their own possessions — it never
// fails. What the deed CAUSES (does the thrown rock hit?) belongs to the
// Check, which rules on the rewritten action like any other turn.
// Lineage: SIS core (Endless Backrooms). SIS's APPROVE/REJECT gate machinery
// is NOT ported — GateKit's per-turn verdict subsumes it at zero cost.
// v0.1.1: cards materialize on Turn 1 — INV_cfg()/INV_renderCard() run
// unconditionally at input (EB's ensure-on-input pattern, SR_ensureCard's
// call-site discipline expressed through ParaCards primitives).
// v0.1.2: the Event Log joins them (SC_reportEnsure — doctrine rule 11).
// Full design: Documentation/Design Proposals/Inventory (the Possession).
//
// DEPENDS ON: Core (RegexLib for parsing, ParaCard for cards) — degrades to
// state-only bookkeeping without ParaCard, to policy "none" without GateKit.
//
// COMMANDS:
//   /take [n] <name>        acquire item(s)        (policy: outcome)
//   /collect [n] <currency> acquire currency       (policy: outcome)
//   /drop [n] <item>        spend                  (policy: none)
//   /give [n] <item> to X   spend                  (policy: outcome)
//   /throw [n] <item> at X  spend                  (policy: outcome)
//   /use <item>             spend exactly 1        (policy: outcome)
//   /undo                   reverse last operation (meta, never judged)
//   /inventory | /inv       show holdings          (meta, never judged)
//
// POLICIES (per verb, editable in the "Inventory Config" card):
//   none    — commit at input; turn marked non-adjudicable
//   outcome — commit at input; the Check rules consequences. Acquisitions
//             roll back on a fail ruling; expenditures never refund (the
//             deed happened — the rock is gone, it just missed)
//   gated   — commit deferred to output, iff the ruling isn't fail
//
// WIRING (order matters):
//   Input tab:    text = INV_onInput(text);   // FIRST: rewrite/mutate/stamp
//                 text = GK_onInput(text);
//   Context tab:  text = GK_onContext(text);  // Inventory has no context pass
//   Output tab:   text = GK_onOutput(text);   // verdict captured first
//                 text = INV_onOutput(text);  // then commits/rollbacks/echoes
//                 text = GK_onOutputDebug(text);
// ---------------------------------------------------------------------------

// Defaults. With ParaCard present these seed the editable "Inventory Config"
// card and back-fill any line the player deletes or mangles.
const INV_SETTINGS = {
    TAKE_ARBITRATION: "outcome",
    COLLECT_ARBITRATION: "outcome",
    DROP_ARBITRATION: "none",
    GIVE_ARBITRATION: "outcome",
    THROW_ARBITRATION: "outcome",
    USE_ARBITRATION: "outcome",
    INVENTORY_IN_CONTEXT: false,   // always-on Inventory card keys (costs context)
    REPORT: true                   // post mutations to the "Event Log" card
};

const INV_VERBS = ["take", "collect", "drop", "give", "throw", "use", "undo", "inventory", "inv"];
const INV_NAME_CAP = 40;       // max chars for a /take'd item name
const INV_ITEM_CAP = 99;       // max copies of one item (SIS's cap, kept)
const INV_UNDO_MAX = 20;       // undo ring buffer depth (SIS's depth, kept)

// Load canary
try {
    if (typeof log === "function") log("[SlashInventory] library loaded (v0.1.2)");
} catch (e) {}

// --- Live settings -----------------------------------------------------------------
let INV_CFG_CACHE = null;
function INV_cfg() {
    if (INV_CFG_CACHE) return INV_CFG_CACHE;
    let cfg;
    if (typeof SC_config === "function") {
        try {
            cfg = SC_config("Inventory Config", INV_SETTINGS, {
                description: "Settings for the Inventory module. Arbitration per verb: "
                    + "none (bookkeeping only), outcome (deed certain, consequences judged), "
                    + "gated (nothing happens unless the ruling allows it). "
                    + "Edits apply on your next action."
            });
        } catch (e) {
            cfg = Object.assign({}, INV_SETTINGS);
        }
    } else {
        cfg = Object.assign({}, INV_SETTINGS);
    }
    // Sanity: policies must be one of the three; garbage falls back per key
    for (const k in INV_SETTINGS) {
        if (/_ARBITRATION$/.test(k)) {
            const v = String(cfg[k] || "").toLowerCase().trim();
            cfg[k] = (v === "none" || v === "outcome" || v === "gated") ? v : INV_SETTINGS[k];
        }
    }
    INV_CFG_CACHE = cfg;
    return cfg;
}

function INV_policy(verb) {
    const cfg = INV_cfg();
    return cfg[verb.toUpperCase() + "_ARBITRATION"] || "outcome";
}

// --- State (schema-migrating) --------------------------------------------------------
function INV_state() {
    if (!state.vars || typeof state.vars !== "object") state.vars = {};
    if (!state.vars.INV || typeof state.vars.INV !== "object") state.vars.INV = {};
    const INV = state.vars.INV;
    if (!Array.isArray(INV.items)) INV.items = [];
    if (!INV.wallet || typeof INV.wallet !== "object") INV.wallet = {};
    if (!Array.isArray(INV.log)) INV.log = [];
    if (!Object.prototype.hasOwnProperty.call(INV, "pending")) INV.pending = null;
    if (typeof INV.opTurn !== "number") INV.opTurn = -1;
    if (!Object.prototype.hasOwnProperty.call(INV, "lastStub")) INV.lastStub = null;
    if (!Array.isArray(INV.echo)) INV.echo = [];
    return INV;
}

function INV_turn() {
    return (info && typeof info.actionCount === "number") ? info.actionCount : -1;
}

// --- Possession primitives (SIS's proven core) ----------------------------------------
function INV_count(name) {
    const k = String(name).toLowerCase();
    return INV_state().items.filter(s => String(s).toLowerCase() === k).length;
}

function INV_add(name, amount) {
    const INV = INV_state();
    const room = Math.max(0, INV_ITEM_CAP - INV_count(name));
    const n = Math.min(Math.max(1, amount), room);
    for (let i = 0; i < n; i++) INV.items.push(String(name));
    return n;
}

function INV_removeItems(name, amount) {
    const INV = INV_state();
    const k = String(name).toLowerCase();
    let left = amount;
    for (let i = INV.items.length - 1; i >= 0 && left > 0; i--) {
        if (String(INV.items[i]).toLowerCase() === k) { INV.items.splice(i, 1); left--; }
    }
    return amount - left;
}

function INV_walletGet(cur) { return INV_state().wallet[String(cur).toLowerCase()] || 0; }

function INV_walletAdd(cur, amount) {
    const INV = INV_state();
    const k = String(cur).toLowerCase();
    const next = Math.max(0, (INV.wallet[k] || 0) + amount);
    if (next === 0) delete INV.wallet[k]; else INV.wallet[k] = next;
}

function INV_logOp(kind, name, amount) {
    const INV = INV_state();
    INV.log.push({ kind: kind, name: String(name), amount: amount, turn: INV_turn() });
    if (INV.log.length > INV_UNDO_MAX) INV.log.shift();
}

// --- Card projection (state → card, never parsed back) ---------------------------------
function INV_renderCard() {
    if (typeof SC_render !== "function") return;
    const INV = INV_state();
    const wallet = Object.keys(INV.wallet).sort();
    const wLines = wallet.length ? wallet.map(k => "- " + k + ": " + INV.wallet[k]) : ["- (empty)"];
    const counts = {};
    for (const it of INV.items) counts[it] = (counts[it] || 0) + 1;
    const names = Object.keys(counts).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const iLines = names.length ? names.map(n => "- " + n + " x " + counts[n]) : ["- (empty)"];
    const entry = "## Wallet\n" + wLines.join("\n") + "\n\n## Inventory\n" + iLines.join("\n");
    const card = SC_render("Inventory", entry, { type: "list", keys: "Inventory" });
    if (card) {
        const wantKeys = INV_cfg().INVENTORY_IN_CONTEXT
            ? (typeof SC_ALWAYS_ON === "string" ? SC_ALWAYS_ON : ".")
            : "Inventory";
        if (card.keys !== wantKeys) card.keys = wantKeys;
    }
}

// --- Reporting & echoes -------------------------------------------------------------------
function INV_report(line) {
    if (INV_cfg().REPORT && typeof SC_report === "function") {
        try { SC_report("Inventory", line); } catch (e) {}
    }
}

function INV_say(line) {
    INV_state().echo.push(String(line));
}

function INV_mark() {
    if (typeof GK_markCommandTurn === "function") {
        try { GK_markCommandTurn(); } catch (e) {}
    }
}

// --- Stub helpers ----------------------------------------------------------------------
function INV_qty(name, amount) { return amount > 1 ? amount + " " + name : "the " + name; }

// --- Input pass ------------------------------------------------------------------------
function INV_onInput(text) {
    const INV = INV_state();
    // Projections exist from Turn 1 (EB's ensure-on-input pattern): the
    // Inventory Config and Inventory cards materialize on the first player
    // action, not the first command. SC_render writes only on change, so
    // this never churns a card. Both degrade to no-ops without ParaCards.
    INV_cfg();
    INV_renderCard();
    if (INV_cfg().REPORT && typeof SC_reportEnsure === "function") SC_reportEnsure();
    const t = String(text || "");
    if (typeof RX_command !== "function") return t;   // no Grammar, no commands

    const cmd = RX_command(t, INV_VERBS);
    if (!cmd) return t;

    // Retry guard: this turn already processed a command — replay the stub,
    // never re-mutate. (Edited retries with a DIFFERENT command re-process;
    // /undo covers the rare double. Documented limitation.)
    const turn = INV_turn();
    if (INV.opTurn === turn && INV.lastStub) return INV.lastStub;

    const verb = cmd.name === "inv" ? "inventory" : cmd.name;
    const args = cmd.args;
    let stub = null;

    // ---- meta verbs (never judged) ----
    if (verb === "inventory") {
        const counts = {};
        for (const it of INV.items) counts[it] = (counts[it] || 0) + 1;
        const items = Object.keys(counts).map(n => n + " x" + counts[n]).join(", ") || "nothing";
        const wallet = Object.keys(INV.wallet).map(k => INV.wallet[k] + " " + k).join(", ") || "empty wallet";
        INV_say("Inventory: " + items + " | " + wallet);
        INV_mark();
        stub = " ";
    } else if (verb === "undo") {
        const op = INV.log.pop();
        if (!op) {
            INV_say("Nothing to undo.");
        } else {
            if (op.kind === "add") { INV_removeItems(op.name, op.amount); }
            else if (op.kind === "remove") { INV_add(op.name, op.amount); }
            else if (op.kind === "wallet_add") { INV_walletAdd(op.name, -op.amount); }
            else if (op.kind === "wallet_remove") { INV_walletAdd(op.name, op.amount); }
            INV_say("Undid: " + op.kind.replace("_", " ") + " " + op.name + " x" + op.amount);
            INV_report("undo: reversed " + op.kind.replace("_", " ") + " " + op.name + " x" + op.amount);
            INV_renderCard();
        }
        INV_mark();
        stub = " ";
    }

    // ---- acquisitions ----
    else if (verb === "take" || verb === "collect") {
        const amt = RX_amount(args, 1);
        const name = amt.remainder.trim();
        if (!name) {
            INV_say("What do you want to " + verb + "? Try /" + verb + " 3 torches");
            INV_mark(); stub = " ";
        } else if (name.length > INV_NAME_CAP) {
            INV_say("That name is too long (max " + INV_NAME_CAP + " characters).");
            INV_mark(); stub = " ";
        } else {
            const policy = INV_policy(verb);
            const isWallet = (verb === "collect");
            const doCommit = function () {
                if (isWallet) { INV_walletAdd(name, amt.amount); INV_logOp("wallet_add", name, amt.amount); }
                else { INV_add(name, amt.amount); INV_logOp("add", name, amt.amount); }
                INV_renderCard();
            };
            if (policy === "gated") {
                INV.pending = { kind: "gated", verb: verb, target: isWallet ? "wallet" : "items", name: name, amount: amt.amount, turn: turn };
                INV_report(INV_qty(name, amt.amount) + " — gated, awaiting ruling (/" + verb + ")");
                stub = "You attempt to take " + INV_qty(name, amt.amount) + ".";
            } else {
                doCommit();
                INV_report(name + " x" + amt.amount + " added (/" + verb + ")");
                if (policy === "outcome") {
                    INV.pending = { kind: "outcome-acquire", verb: verb, target: isWallet ? "wallet" : "items", name: name, amount: amt.amount, turn: turn };
                } else {
                    INV_mark();
                }
                stub = "You take " + INV_qty(name, amt.amount) + ".";
            }
        }
    }

    // ---- expenditures ----
    else if (verb === "drop" || verb === "give" || verb === "throw" || verb === "use") {
        const candidates = INV.items.concat(Object.keys(INV.wallet));
        const parsed = (verb === "use")
            ? (function () { const m = RX_matchOne(INV.items, args); return m ? { name: m.match, amount: 1, tail: RX_tail(m.remainder) } : null; })()
            : RX_nounAndAmount(candidates, args);
        if (!parsed) {
            INV_say("You don't have that. (/" + verb + " " + args + ")");
            INV_mark(); stub = " ";
        } else {
            const isWallet = !INV_count(parsed.name) && INV_walletGet(parsed.name) > 0;
            const have = isWallet ? INV_walletGet(parsed.name) : INV_count(parsed.name);
            if (parsed.amount > have) {
                INV_say("You only have " + have + " " + parsed.name + ".");
                INV_mark(); stub = " ";
            } else {
                const policy = INV_policy(verb);
                const doSpend = function () {
                    if (isWallet) { INV_walletAdd(parsed.name, -parsed.amount); INV_logOp("wallet_remove", parsed.name, parsed.amount); }
                    else { INV_removeItems(parsed.name, parsed.amount); INV_logOp("remove", parsed.name, parsed.amount); }
                    INV_renderCard();
                };
                const verbPhrase = verb === "use" ? "use" : verb;
                if (policy === "gated") {
                    INV.pending = { kind: "gated", verb: verb, target: isWallet ? "wallet" : "items", name: parsed.name, amount: parsed.amount, turn: turn, spend: true };
                    INV_report(parsed.name + " x" + parsed.amount + " — gated, awaiting ruling (/" + verb + ")");
                } else {
                    doSpend();
                    INV_report(parsed.name + " x" + parsed.amount + " removed (/" + verb + ")"
                        + (policy === "outcome" ? " — outcome pending" : ""));
                    if (policy === "none") INV_mark();
                }
                stub = "You " + verbPhrase + " " + INV_qty(parsed.name, parsed.amount) + (parsed.tail || "") + ".";
            }
        }
    }

    if (stub !== null) {
        INV.opTurn = turn;
        INV.lastStub = stub;
        return stub;
    }
    return t;
}

// --- Output pass --------------------------------------------------------------------------
function INV_onOutput(text) {
    const INV = INV_state();
    let out = String(text || "");
    const turn = INV_turn();

    // Resolve a pending operation against this turn's ruling
    const p = INV.pending;
    if (p && p.turn === turn) {
        let check = null;
        if (typeof GK_lastCheck === "function") {
            try { const c = GK_lastCheck(); if (c && c.turn === turn) check = c; } catch (e) {}
        }
        const failed = check && check.result === "fail";
        const commit = function () {
            if (p.spend) {
                if (p.target === "wallet") { INV_walletAdd(p.name, -p.amount); INV_logOp("wallet_remove", p.name, p.amount); }
                else { INV_removeItems(p.name, p.amount); INV_logOp("remove", p.name, p.amount); }
            } else {
                if (p.target === "wallet") { INV_walletAdd(p.name, p.amount); INV_logOp("wallet_add", p.name, p.amount); }
                else { INV_add(p.name, p.amount); INV_logOp("add", p.name, p.amount); }
            }
            INV_renderCard();
        };
        if (p.kind === "gated") {
            if (failed) {
                INV_say("The attempt fails — nothing " + (p.spend ? "spent" : "gained") + ".");
                INV_report("gated /" + p.verb + " cancelled (ruling: fail)");
            } else {
                commit();
                INV_report(p.name + " x" + p.amount + " " + (p.spend ? "removed" : "added") + " (gated /" + p.verb + " — ruling allowed)");
            }
        } else if (p.kind === "outcome-acquire" && failed) {
            // Roll back the optimistic commit: you reached, you didn't get it
            if (p.target === "wallet") { INV_walletAdd(p.name, -p.amount); INV_logOp("wallet_remove", p.name, p.amount); }
            else { INV_removeItems(p.name, p.amount); INV_logOp("remove", p.name, p.amount); }
            INV_renderCard();
            INV_say("You failed to get " + INV_qty(p.name, p.amount) + ".");
            INV_report("/" + p.verb + " rolled back (ruling: fail)");
        }
        INV.pending = null;
    }

    // Surface queued player messages, GateKit-brace style
    if (INV.echo.length) {
        out = INV.echo.map(l => "{" + l + "}").join("\n") + (out.trim() ? "\n\n" + out : "");
        INV.echo = [];
    }
    return out;
}
