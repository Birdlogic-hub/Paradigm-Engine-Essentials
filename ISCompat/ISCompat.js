// ===== ISCompat v0.1.0 =====
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
// Known deferral (v0.2 candidate): appending Essentials card titles to
// Auto-Cards' banned-titles list — AC's API isn't safely reachable from
// outside IS's closure without invoking AutoCards(); needs its own study.

// Present in every IS task template (forget/assign/choice, all PoVs) and
// nowhere else in IS's context assembly. The tail window bounds the search
// to where IS puts task prompts — story text mentioning the phrase mid-
// context can't false-positive.
const ISC_TASK_MARKER = "# STRICT OUTPUT FORMAT";
const ISC_TAIL_WINDOW = 2500;

// Load canary
try {
    if (typeof log === "function") log("[ISCompat] library loaded (v0.1.0)");
} catch (e) {}

function ISC_isTaskContext(ctx) {
    return String(ctx || "").slice(-ISC_TAIL_WINDOW).indexOf(ISC_TASK_MARKER) !== -1;
}

// Context pass: detect an Inner Self task turn, tell the Check to yield.
// Returns text untouched, always (rule 7).
function ISC_onContext(text) {
    const ctx = String(text || "");
    try {
        if (ISC_isTaskContext(ctx) && typeof GK_markCommandTurn === "function") {
            GK_markCommandTurn();
            if (typeof SC_report === "function") {
                SC_report("ISCompat", "IS task turn — Check yields");
            }
        }
    } catch (e) {}
    return ctx;
}
