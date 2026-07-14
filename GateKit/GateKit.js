// ===== GateKit v0.6.1 =====
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
    if (GK_cfg().DEBUG_CONSOLE) log("[GateKit] library loaded (v0.6.1)");
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
