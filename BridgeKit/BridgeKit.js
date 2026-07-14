// ===== BridgeKit v0.2.0 =====
// script by bottledfox
//
// Paradigm Engine compatibility shim: Inner Self (LewdLeah, pinned v1.0.2)
// × PE Essentials. Zero changes to Inner Self, zero changes to Essentials
// core — this module only DETECTS and SIGNALS, per the study:
// Documentation/Architecture/PE Essentials x Inner Self - Compatibility Study.md
//
// WHY: Inner Self turns some player turns into "task turns" — the model must
// open its output with a parenthesized brain operation. Two owners of the
// output opening cannot coexist, so GateKit yields, through its existing
// GK_markCommandTurn() seam — exactly the way command turns yield today.
// Task turns are detected from IS's own context assembly: only IS's task
// templates contain the marker below (IS v1.0.2 Library:1509+), and IS
// appends them at the context tail (Library:2023-2035).
//
// WIRING (order IS law — see study, "The contract"):
//   Input tab:    InnerSelf("input");
//                 text = INV_onInput(text);  text = GK_onInput(text);
//   Context tab:  InnerSelf("context");
//                 text = ISC_onContext(text);   // BETWEEN IS and GateKit
//                 text = GK_onContext(text);
//   Output tab:   text = GK_onOutput(text);     // BEFORE InnerSelf — the verdict
//                 InnerSelf("output");          //   must never reach IS's repair
//                 text = INV_onOutput(text);    // AFTER IS — {echoes} are an IS block type
//                 text = GK_onOutputDebug(text);
//
// DEPENDS ON: GateKit (the seam it pulls); degrades to pure passthrough
// without it, or without Inner Self (marker never appears). ParaCards
// optional (Event Log reporting). Owns no cards, no state namespace.
//
// v0.2.0 (live-found, 7/14/2026 "Test Chamber" capture): Auto-Cards
// GENERATION turns are a second special-turn class. AC hijacks the context
// inside InnerSelf("context") to prompt the model for a card entry; GateKit,
// unaware, injected its arbiter block into that prompt and the model wrote
// "skill=none; difficulty=trivial; check=success;" INTO the generated card —
// mid-line, where GK's $-anchored strip can't reach. Detection: both of AC's
// generation prompts (entry + memory compression) open with the same
// preamble, searched full-context because AC's prompt position varies.
// Belt-and-suspenders: state.InnerSelf.AC.event (set when AC consumed the
// turn) and the global stop flag (a hijacked turn by definition).
//
// Known deferral (v0.3 candidate): appending Essentials card titles to
// Auto-Cards' banned-titles list — AC's API isn't safely reachable from
// outside IS's closure without invoking AutoCards(); needs its own study.

// Present in every IS task template (forget/assign/choice, all PoVs) and
// nowhere else in IS's context assembly. The tail window bounds the search
// to where IS puts task prompts — story text mentioning the phrase mid-
// context can't false-positive.
const ISC_TASK_MARKER = "# STRICT OUTPUT FORMAT";
const ISC_TAIL_WINDOW = 2500;

// Shared preamble of BOTH Auto-Cards generation prompts (card entry and
// memory compression — AC defaults, verified against the pinned bundle).
const ISC_AC_MARKER = "# Stop the story and ignore previous instructions.";

// Load canary
try {
    if (typeof log === "function") log("[BridgeKit] library loaded (v0.2.0)");
} catch (e) {}

function ISC_isTaskContext(ctx) {
    return String(ctx || "").slice(-ISC_TAIL_WINDOW).indexOf(ISC_TASK_MARKER) !== -1;
}

// An Auto-Cards generation/compression turn: the story model is writing a
// card, not narration — nothing to adjudicate, and an arbiter block would
// bleed verdicts into the generated entry (the Test Chamber incident).
function ISC_isAutoCardsContext(ctx) {
    if (String(ctx || "").indexOf(ISC_AC_MARKER) !== -1) return true;
    try {
        if (typeof state === "object" && state && state.InnerSelf
            && state.InnerSelf.AC && state.InnerSelf.AC.event === true) return true;
    } catch (e) {}
    try {
        if (typeof stop !== "undefined" && stop === true) return true;
    } catch (e) {}
    return false;
}

// Context pass: detect an Inner Self task turn, tell the Check to yield.
// Returns text untouched, always (rule 7).
function ISC_onContext(text) {
    const ctx = String(text || "");
    try {
        const acTurn = ISC_isAutoCardsContext(ctx);
        if ((acTurn || ISC_isTaskContext(ctx)) && typeof GK_markCommandTurn === "function") {
            GK_markCommandTurn();
            if (typeof SC_report === "function") {
                SC_report("BridgeKit", (acTurn ? "Auto-Cards turn" : "IS task turn") + " — Check yields");
            }
        }
    } catch (e) {}
    return ctx;
}