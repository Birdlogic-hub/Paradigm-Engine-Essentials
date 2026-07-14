// ===== CardLib v0.4.0 =====
// (né ParaCards, renamed 7/14/2026 — same module, same SC_ prefix)
// v0.4.0: card categories. The story-card panel groups by TYPE, so type is
// part of the projection: SC_ensure now HEALS type (a card that drifts from
// its declared category is re-typed, same doctrine as config-line healing).
// House categories: config cards default to "Paradigm Config"; the Event
// Log is "Log". Callers override per card (Inventory owns "Inventory").
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
    if (typeof log === "function") log("[CardLib] library loaded (v0.4.0)");
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
    if (card) {
        // Type is part of the projection: heal category drift (v0.4.0).
        if (opts.type && card.type !== opts.type) card.type = String(opts.type);
        return card;
    }
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
            type: opts.type || "Paradigm Config",
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
        type: "Log",
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