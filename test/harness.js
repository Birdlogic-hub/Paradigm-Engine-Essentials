// ===== Paradigm Engine test harness =====
// AID's sandbox is unique: no imports, globals injected per hook (state, info,
// history, storyCards, log, card API), the Library re-evaluated before every
// hook, and player text arriving pre-mangled ("> You /take sword.\n").
// This harness reproduces that world in Node so module logic can be proven
// before it ever touches the platform (doctrine rule 8: harness-passed is
// stage one of done). Live-shaped inputs are LAW here (rule 9 lineage: the
// RegexLib v0.1.1 bug shipped because tests used idealized text).
//
// Usage in a *.test.js:
//   const H = require("./harness");
//   H.fresh();                              // pristine AID globals
//   eval(H.load("RegexLib", "GateKit"));    // eval IN TEST SCOPE (required —
//                                           // definitions must land where the
//                                           // test can call them)
//   H.turn(5, "do");                        // advance to action 5, do-turn
//   GK_onInput(H.doFrame("/check"));        // "> You /check.\n"
//   H.assert(cond, "message");
//   H.summary("GateKit");                   // prints tally, sets exit code

const fs = require("fs");
const path = require("path");

// --- module source loading --------------------------------------------------------
// Resolves both layouts: repo (src/Name.js) and workspace (Name/Name.js).
function srcPath(name) {
    const candidates = [
        path.join(__dirname, "..", "src", name + ".js"),
        path.join(__dirname, "_src", name + ".js"),
        path.join(__dirname, "..", name, name + ".js"),
        path.join(__dirname, "..", "..", "PRPG", name, name + ".js")
    ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
    throw new Error("module source not found: " + name + " (tried " + candidates.join(", ") + ")");
}

// const/let at Library top level would throw on re-eval and stay scope-bound;
// var declarations behave like the AID sandbox's per-hook re-evaluation.
//
// The emitted __peCacheReset closure is the only handle the harness has on the
// modules' per-hook cfg caches: direct eval in the test file puts those vars in
// the TEST MODULE scope, not on `global`, so only code eval'd alongside them
// can reach them. resetCaches() below calls this closure.
function load() {
    let out = "";
    const caches = [];
    for (const name of arguments) {
        const src = fs.readFileSync(srcPath(name), "utf-8")
            .replace(/^const (GK_|SC_|RX_|INV_|BK_|SK_|EV_)([A-Z_]+)/gm, "var $1$2")
            .replace(/^let (GK_DEBUG_RAW|GK_CFG_CACHE|INV_CFG_CACHE|EV_REG)/gm, "var $1");
        for (const m of src.matchAll(/^var (\w+_CFG_CACHE)/gm)) caches.push(m[1]);
        out += src + "\n";
    }
    out += "global.__peCacheReset = function () { "
        + caches.map(function (v) { return v + " = null;"; }).join(" ")
        + " };\n";
    return out;
}

// --- the AID sandbox stand-ins -------------------------------------------------------
function fresh() {
    global.state = { memory: {}, message: "", vars: {} };
    global.info = { actionCount: 0, maxChars: 0 };
    global.history = [];
    global.storyCards = [];
    global.addStoryCard = function (keys, entry, type) {
        if (global.storyCards.some(c => c.keys === keys)) return false;
        global.storyCards.push({
            id: String(global.storyCards.length + 1),
            title: keys, keys: keys, type: type || "Custom",
            entry: entry || "", description: ""
        });
        return global.storyCards.length;
    };
    global.removeStoryCard = function (i) {
        if (!global.storyCards[i]) throw new Error("no card at index " + i);
        global.storyCards.splice(i, 1);
    };
    global.logLines = [];
    global.log = function () { global.logLines.push([].join.call(arguments, " ")); };
}

// Advance to an action: sets actionCount and appends a history entry of the
// given type ("do" | "say" | "story" | "continue" | "see" | "start").
function turn(n, type, text) {
    global.info.actionCount = n;
    global.history.push({ text: text || "> You act.", type: type || "do" });
}

// Per-hook-execution caches reset (the Library re-evals before each hook in
// AID; in tests, call between simulated hook executions when config changed).
// Delegates to the closure load() eval'd into the test scope — the caches are
// scope-bound vars there, invisible as properties of `global`.
function resetCaches() {
    if (typeof global.__peCacheReset === "function") global.__peCacheReset();
}

// --- live-shaped player input (rule 9 lineage: never test idealized text) --------------
function doFrame(action)  { return "> You " + action + ".\n"; }
function sayFrame(speech) { return '> You say "' + speech + '"\n'; }

// A standard assembled-context fixture with a Recent Story section.
function ctx(extra) {
    return "AI instructions here.\nRecent Story:\nThe hall is quiet."
        + (extra ? "\n" + extra : "") + "\n> You act.";
}

// --- assertions -------------------------------------------------------------------------
let pass = 0, fail = 0;
function assert(cond, msg) {
    if (cond) { pass++; console.log("ok: " + msg); }
    else { fail++; process.exitCode = 1; console.error("FAIL: " + msg); }
}
function summary(name) {
    console.log("\n" + name + ": " + pass + " passed, " + fail + " failed"
        + (fail ? "  *** FAILURES ***" : "  — ALL TESTS PASSED"));
}

module.exports = { load, fresh, turn, resetCaches, doFrame, sayFrame, ctx, assert, summary };
