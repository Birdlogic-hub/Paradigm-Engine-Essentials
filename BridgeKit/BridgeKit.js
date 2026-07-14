// ===== BridgeKit v0.5.0 =====
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
// v0.3.0 (per the LC study, 7/14/2026): two more script families join the
// yield taxonomy. Living Characters' Thought asks demand a leading
// parenthetical (detected via state.livingThoughts.pendingChar — LC clears
// it every context pass and sets it exactly when an ask was injected; text
// fallback: the ask's stable phrase). Story Arc Engine's control turns are
// flag-detectable: state.sae.saveOutput (arc-generation calls) and
// state.sae.commandCenter_SAE (command UI turns). LC Life Card write-backs
// need NO yield — their <LC_MEMORY> request is trailing, verdict-first
// coexists. Wiring for the full merged stack lives in the LC study doc.
//
// v0.4.0: HOSPITALITY — rule 11 applied on behalf of guests. SlowBurn reads
// its config from a player-authored card (any entry containing "Evolution
// Stages") and its own docs make the player build it by hand. We can't add
// ensure-on-input to a guest, but we can seed the card FOR it. Skipped
// entirely when the player already has one (SB scans ALL matching cards;
// duplicates would fight).
//
// v0.5.0 (live-found: the manifested-Companion incident): SlowBurn writes
// "[Companion's State: ...]" into the Author's Note UNCONDITIONALLY — its
// default identity leaks into the fiction and the narrator conjures a
// companion who was never in the story. The seeded card is now BLANK (the
// template lives in its description, inert — SB's regexes aren't anchored,
// so template text in the ENTRY would parse as live config), and the card
// is a SUGGESTION until filled: hook tabs call ISC_runSlowBurn(), which
// runs SB only when a filled card exists (Character Name present) and
// scrubs SB's block from the Author's Note while dormant.
//
// Known deferral (v0.5 candidate): appending Essentials card titles to
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

// Stable phrase of Living Characters' Thought ask (LC:11205 in the AIDSuite
// pin) — text fallback when state.livingThoughts is unreadable.
const ISC_LC_THOUGHT_MARKER = "Begin your reply with ONE short parenthetical";

// Load canary
try {
    if (typeof log === "function") log("[BridgeKit] library loaded (v0.5.0)");
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

// A Living Characters Thought-ask turn: LC demands the reply OPEN with a
// name-labeled parenthetical thought — same leading-position collision as
// an IS task. pendingChar is authoritative (set exactly when the ask was
// injected this pass, cleared otherwise); the tail marker is the fallback.
function ISC_isLcThoughtContext(ctx) {
    try {
        if (typeof state === "object" && state && state.livingThoughts
            && typeof state.livingThoughts.pendingChar === "string"
            && state.livingThoughts.pendingChar !== "") return true;
    } catch (e) {}
    return String(ctx || "").slice(-ISC_TAIL_WINDOW).indexOf(ISC_LC_THOUGHT_MARKER) !== -1;
}

// A Story Arc Engine control turn: arc-generation calls (saveOutput) and
// command-center UI turns — both private, neither is narration.
function ISC_isSaeControlTurn() {
    try {
        if (typeof state === "object" && state && state.sae) {
            if (state.sae.saveOutput === true) return true;
            if (state.sae.commandCenter_SAE) return true;
        }
    } catch (e) {}
    return false;
}

// The SlowBurn starter card. Format is SB's documented contract: metadata
// lines + "level: Stage - description" ladder, parsed by its regexes
// (Character Name/Gain Rate/Drain Rate, /^(\d+):\s*(.*)/ per stage).
const ISC_SB_CARD_TITLE = "Evolution Stages";
// ENTRY stays blank — SB's parsers aren't line-anchored, so any template
// text here would be read as live config. The template ships in the
// description, where SB never looks.
const ISC_SB_CARD_ENTRY = "";
const ISC_SB_CARD_HOWTO = "SlowBurn is DORMANT until you fill this card's Entry. Template (copy "
    + "into Entry, then edit): Evolution Stages Part 1: / Character Name: <NPC> / "
    + "Gain Rate: 0.2 / Drain Rate: 0.5 / then stages, one per line, like "
    + "'0: The Default - polite behavior' and '35: Trusting - shares thoughts unprompted' "
    + "(each line = level: Stage - description). SlowBurn wakes when Character Name is set.";

// SB's own Author's Note block shape (verbatim from its source) — used to
// scrub the note while SB is dormant.
const ISC_SB_NOTE_RX = /\[.*?'s State:.*?\]|\[EVO:.*?\]/g;

// Configured = some card carries the header AND a non-empty Character Name.
function ISC_slowburnConfigured() {
    if (typeof SC_find !== "function") return false;
    try {
        return !!SC_find(function (c) {
            return c && typeof c.entry === "string"
                && c.entry.indexOf("Evolution Stages") !== -1
                && /Character Name:\s*\S/i.test(c.entry);
        });
    } catch (e) { return false; }
}

// The leash: hook tabs call this INSTEAD of SLOWBURN directly. Dormant
// until the card is filled; while dormant, SB's default-identity block
// ("[Companion's State: ...]") is scrubbed from the Author's Note so the
// narrator never manifests a companion nobody wrote.
function ISC_runSlowBurn(hook, text) {
    try {
        if (typeof SLOWBURN !== "function") return;
        if (ISC_slowburnConfigured()) {
            SLOWBURN(hook, text);
        } else if (state && state.memory && typeof state.memory.authorsNote === "string"
            && ISC_SB_NOTE_RX.test(state.memory.authorsNote)) {
            state.memory.authorsNote = state.memory.authorsNote.replace(ISC_SB_NOTE_RX, "").trim();
        }
    } catch (e) {}
}

// Input pass: guest hospitality. Ensures starter cards for guest scripts
// that expect hand-made ones. Returns text untouched, always (rule 7).
function ISC_onInput(text) {
    try {
        if (typeof SLOWBURN === "function" && typeof SC_ensure === "function") {
            const has = (typeof SC_get === "function" && SC_get(ISC_SB_CARD_TITLE))
                || (typeof SC_find === "function"
                    && SC_find(function (c) { return c && typeof c.entry === "string" && c.entry.indexOf("Evolution Stages") !== -1; }));
            if (!has) {
                const card = SC_ensure(ISC_SB_CARD_TITLE, {
                    type: "config",
                    keys: ISC_SB_CARD_TITLE,
                    entry: ISC_SB_CARD_ENTRY,
                    description: ISC_SB_CARD_HOWTO
                });
                if (card && typeof SC_report === "function") {
                    SC_report("BridgeKit", "seeded SlowBurn's Evolution Stages starter card");
                }
            }
        }
    } catch (e) {}
    return String(text || "");
}

// Context pass: detect an Inner Self task turn, tell the Check to yield.
// Returns text untouched, always (rule 7).
function ISC_onContext(text) {
    const ctx = String(text || "");
    try {
        const why = ISC_isAutoCardsContext(ctx) ? "Auto-Cards turn"
            : ISC_isSaeControlTurn() ? "Story Arc Engine turn"
            : ISC_isLcThoughtContext(ctx) ? "LC thought turn"
            : ISC_isTaskContext(ctx) ? "IS task turn"
            : null;
        if (why && typeof GK_markCommandTurn === "function") {
            GK_markCommandTurn();
            if (typeof SC_report === "function") {
                SC_report("BridgeKit", why + " — Check yields");
            }
        }
    } catch (e) {}
    return ctx;
}