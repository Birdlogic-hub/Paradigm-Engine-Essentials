// ===== InventoryKit v0.1.2 =====
// (né SlashInventory, renamed 7/14/2026 — same module, same INV_ prefix, same versions)
// script by bottledfox
//
// Paradigm Engine feature module: THE POSSESSION.
// (Module named InventoryKit; function prefix stays INV_ — it manages the
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
    if (typeof log === "function") log("[InventoryKit] library loaded (v0.1.2)");
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
