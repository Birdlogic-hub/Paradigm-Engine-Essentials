// ===== BridgeKit v0.8.1 =====
// v0.8.1 (live-found 7/15/2026, FIRST generation of the live matrix): AI-DEN
//  — an android the model narrates as "it" — scored 0 person vs 0 place
//  signals and the conservative classifier skipped him silently. Default
//  FLIPPED per the proposal's own cost analysis: skip only when the entry
//  CLEARLY reads as a place; ties and pronoun-less entries are introduced.
//  Skips now log their reason to the console (the tester's channel — the
//  Event Log stays introductions-only).
// v0.8.0: the INTRODUCTION — character auto-registration (opt-in). New
//  AC-generated character cards are introduced to the guests that care:
//  IS via its own @-title protocol (IS:704 — a documented card-data API,
//  NOT a config write), LC via the guestbook clause (append-only, dedup'd,
//  reported, reversible NOTES write), SlowBurn via SUGGESTION only (the
//  leash outranks the convenience). Design proposal:
//  Documentation/Design Proposals/Character Auto-Registration (the Introduction) - Design Proposal.md
//  Concept and advocacy: ShotRush. BridgeKit acquires a state namespace
//  (state.vars.BK) and a config card ("BridgeKit Config") with this version.
// v0.7.0: functions renamed ISC_* -> BK_* (ISC was 'Inner Self Compat' — the
//  module bridges four scripts now; the prefix follows the module at last)
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
//                 text = BK_onContext(text);   // BETWEEN IS and GateKit
//                 text = GK_onContext(text);
//   Output tab:   text = GK_onOutput(text);     // BEFORE InnerSelf — the verdict
//                 InnerSelf("output");          //   must never reach IS's repair
//                 text = INV_onOutput(text);    // AFTER IS — {echoes} are an IS block type
//                 text = GK_onOutputDebug(text);
//
// DEPENDS ON: GateKit (the seam it pulls); degrades to pure passthrough
// without it, or without Inner Self (marker never appears). ParaCards
// optional (Event Log reporting; required for the opt-in Introduction —
// no CardLib means no config card means the feature stays off, rule 7).
// Owns one card ("BridgeKit Config") and one namespace (state.vars.BK)
// as of v0.8.0.
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
// companion who was never in the story. The card is a SUGGESTION until
// filled: hook tabs call BK_runSlowBurn(), which runs SB only when the
// card is configured, and scrubs SB's block from the Author's Note while
// dormant.
// v0.5.1: the seeded ENTRY is a ready-to-fill form (blank Character Name,
// live-ready rates + stage ladder) — safe because the leash means nothing
// parses until the name is set, at which point the template IS the config.
// The gate reads the name on ITS OWN LINE only (SB's \s* would leap the
// newline and call "Gain Rate: 0.2" a name) and ignores <placeholders>.
//
// Known deferral (v0.5 candidate): appending Essentials card titles to
// Auto-Cards' banned-titles list — AC's API isn't safely reachable from
// outside IS's closure without invoking AutoCards(); needs its own study.

// Present in every IS task template (forget/assign/choice, all PoVs) and
// nowhere else in IS's context assembly. The tail window bounds the search
// to where IS puts task prompts — story text mentioning the phrase mid-
// context can't false-positive.
const BK_TASK_MARKER = "# STRICT OUTPUT FORMAT";
const BK_TAIL_WINDOW = 2500;

// Shared preamble of BOTH Auto-Cards generation prompts (card entry and
// memory compression — AC defaults, verified against the pinned bundle).
const BK_AC_MARKER = "# Stop the story and ignore previous instructions.";

// Stable phrase of Living Characters' Thought ask (LC:11205 in the AIDSuite
// pin) — text fallback when state.livingThoughts is unreadable.
const BK_LC_THOUGHT_MARKER = "Begin your reply with ONE short parenthetical";

// Load canary
try {
    if (typeof log === "function") log("[BridgeKit] library loaded (v0.8.1)");
} catch (e) {}

function BK_isTaskContext(ctx) {
    return String(ctx || "").slice(-BK_TAIL_WINDOW).indexOf(BK_TASK_MARKER) !== -1;
}

// An Auto-Cards generation/compression turn: the story model is writing a
// card, not narration — nothing to adjudicate, and an arbiter block would
// bleed verdicts into the generated entry (the Test Chamber incident).
function BK_isAutoCardsContext(ctx) {
    if (String(ctx || "").indexOf(BK_AC_MARKER) !== -1) return true;
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
function BK_isLcThoughtContext(ctx) {
    try {
        if (typeof state === "object" && state && state.livingThoughts
            && typeof state.livingThoughts.pendingChar === "string"
            && state.livingThoughts.pendingChar !== "") return true;
    } catch (e) {}
    return String(ctx || "").slice(-BK_TAIL_WINDOW).indexOf(BK_LC_THOUGHT_MARKER) !== -1;
}

// A Story Arc Engine control turn: arc-generation calls (saveOutput) and
// command-center UI turns — both private, neither is narration.
function BK_isSaeControlTurn() {
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
const BK_SB_CARD_TITLE = "Evolution Stages";
// The ready-to-fill form: blank name, live-ready everything else. Dormant
// (and unparsed) until Character Name is filled — then this ladder is the
// starting config, edit at will.
const BK_SB_CARD_ENTRY = [
    "Evolution Stages Part 1:",
    "Character Name:",
    "Gain Rate: 0.2",
    "Drain Rate: 0.5",
    "0: The Default - Standard, polite behavior towards you.",
    "15: Warming Up - Friendlier; seeks out small moments of conversation.",
    "35: Trusting - Shares thoughts unprompted; relies on you in a pinch.",
    "60: Close - Openly affectionate; takes risks on your behalf.",
    "85: Devoted - Unshakable loyalty; your goals are their goals."
].join("\n");
const BK_SB_CARD_HOWTO = "SlowBurn is DORMANT until you fill in Character Name above. Everything "
    + "else is live the moment you do — tune the rates, rewrite the stages "
    + "(each line = level: Stage - description), add 'Evolution Stages Part 2:' "
    + "cards if you outgrow this one.";

// SB's own Author's Note block shape (verbatim from its source) — used to
// scrub the note while SB is dormant.
const BK_SB_NOTE_RX = /\[.*?'s State:.*?\]|\[EVO:.*?\]/g;

// Configured = some card carries the header AND a real Character Name on
// the name's OWN line (no newline-leaping), placeholders like <NPC> excluded.
function BK_slowburnConfigured() {
    if (typeof SC_find !== "function") return false;
    try {
        return !!SC_find(function (c) {
            if (!c || typeof c.entry !== "string" || c.entry.indexOf("Evolution Stages") === -1) return false;
            const m = c.entry.match(/Character Name:[ \t]*([^\n]*)/i);
            const name = m ? m[1].trim() : "";
            return name !== "" && !/^[<\[{].*[>\]}]$/.test(name);
        });
    } catch (e) { return false; }
}

// The leash: hook tabs call this INSTEAD of SLOWBURN directly. Dormant
// until the card is filled; while dormant, SB's default-identity block
// ("[Companion's State: ...]") is scrubbed from the Author's Note so the
// narrator never manifests a companion nobody wrote.
function BK_runSlowBurn(hook, text) {
    try {
        if (typeof SLOWBURN !== "function") return;
        if (BK_slowburnConfigured()) {
            SLOWBURN(hook, text);
        } else if (state && state.memory && typeof state.memory.authorsNote === "string"
            && BK_SB_NOTE_RX.test(state.memory.authorsNote)) {
            state.memory.authorsNote = state.memory.authorsNote.replace(BK_SB_NOTE_RX, "").trim();
        }
    } catch (e) {}
}

// Guest card categories (v0.6.x, mod-manager style — one banner per mod):
// LC's three config cards live under "LivingCharacters"; its dynamic
// Life/Thought cards keep LC's own types (owner's call). IS's Configure
// card stays Class, untouched. LC ENFORCES card.type on every sync
// (LC:955), so grooming must have the LAST word each turn — hence the
// BK_onOutput passthrough below, wired after LC's output pass.
function BK_guestTypeFor(title) {
    const t = String(title || "");
    if (t === "LIVING CHARACTERS CONFIG" || t === "LIVING CHARACTERS RELATIONSHIPS"
        || t === "THOUGHT CARDS CONFIG") return "LivingCharacters";
    return null;
}

function BK_retypeGuestCards() {
    if (typeof storyCards === "undefined" || !Array.isArray(storyCards)) return;
    for (let i = 0; i < storyCards.length; i++) {
        const c = storyCards[i];
        if (!c || typeof c.title !== "string") continue;
        const want = BK_guestTypeFor(c.title);
        if (want && c.type !== want) c.type = want;
    }
}

// ===== the INTRODUCTION (v0.8.0) =====
// When Auto-Cards generates a character, introduce them to the guests that
// care. Detection is a DIFF (AC inserts at the FRONT of storyCards —
// IS:7711 — so "last card" heuristics read the oldest card in the
// adventure); classification is the model's own prose. Opt-in, append-only,
// dedup'd, reported, reversible — the guestbook clause. Concept: ShotRush.

const BK_LC_CONFIG_TITLE = "LIVING CHARACTERS CONFIG";
// Titles that must never be introduced no matter how person-shaped they look.
const BK_INTRO_EXCLUDE_RX = /^(configure\b|edit to enable\b|inner$|self$|agent$|evolution stages\b|living characters\b|thought cards\b)/i;
// Name-shape gate: 1-3 capitalized words, apostrophes/hyphens ok, no digits.
const BK_NAME_SHAPE_RX = /^[A-Z][A-Za-z'\-]*(?:\s+[A-Z][A-Za-z'\-]*){0,2}$/;
// The model's own prose is the classifier. v0.8.1: permissive-by-default —
// a false introduction is one visible, reversible roster line; a false skip
// is invisible nothing (AI-DEN, 7/15). Skip only when place-signals WIN.
const BK_PERSON_RX = /\b(he|she|his|her|hers|him|who|whom|they|them|their)\b/gi;
const BK_PLACE_RX = /\b(located|place|area|region|building|city|town|village|room|chamber|hall|district|structure|walls)\b/gi;

function BK_state() {
    try {
        if (typeof state !== "object" || !state) return null;
        if (!state.vars || typeof state.vars !== "object") state.vars = {};
        if (!state.vars.BK || typeof state.vars.BK !== "object") state.vars.BK = {};
        const BK = state.vars.BK;
        if (!Array.isArray(BK.snap)) BK.snap = [];
        if (!Array.isArray(BK.intro)) BK.intro = [];
        if (typeof BK.scanTurn !== "number") BK.scanTurn = -1;
        return BK;
    } catch (e) { return null; }
}

function BK_turn() {
    return (typeof info === "object" && info && typeof info.actionCount === "number") ? info.actionCount : -1;
}

// Opt-in switch. No CardLib -> no config card -> feature stays off (rule 7).
function BK_autoRegisterOn() {
    if (typeof SC_config !== "function") return false;
    try {
        const cfg = SC_config("BridgeKit Config", { AUTO_REGISTER: false }, {
            description: "BridgeKit settings. Auto Register: when true, characters "
                + "generated by Auto-Cards are introduced to Inner Self (its @-card "
                + "protocol) and Living Characters (roster notes, append-only), with "
                + "a SlowBurn suggestion in the Event Log. Introductions are reported "
                + "there and reversible: delete the roster line and it stays deleted."
        });
        return !!(cfg && cfg.AUTO_REGISTER === true);
    } catch (e) { return false; }
}

// AC-typed card titles, listing order preserved (AC inserts new cards at the front).
function BK_classTitles() {
    const out = [];
    if (typeof storyCards === "undefined" || !Array.isArray(storyCards)) return out;
    for (let i = 0; i < storyCards.length; i++) {
        const c = storyCards[i];
        if (c && typeof c.title === "string" && String(c.type || "").toLowerCase() === "class") out.push(c.title);
    }
    return out;
}

// Returns null when the card should be introduced, else the skip reason.
function BK_whyNotCharacter(card) {
    if (!card || typeof card.title !== "string" || typeof card.entry !== "string") return "unreadable card";
    const title = card.title.trim();
    if (title === "" || title.length > 30 || /\d/.test(title) || !BK_NAME_SHAPE_RX.test(title)) return "title fails the name gate";
    const person = (card.entry.match(BK_PERSON_RX) || []).length;
    const place = (card.entry.match(BK_PLACE_RX) || []).length;
    if (place > person) return "reads as a place (" + place + " place vs " + person + " person signals)";
    return null;
}

// LC leg — the guestbook clause: append-only, case-insensitively dedup'd
// against the roster in LC's config card NOTES (LC reads names one per line;
// its label line is ignored; unknown names are handled safely per LC's docs).
function BK_lcGuestbook(name) {
    if (typeof SC_get !== "function") return false;
    const card = SC_get(BK_LC_CONFIG_TITLE);
    if (!card) return false;
    const notes = String(card.description || "");
    const has = notes.split("\n").some(function (l) {
        return l.trim().toLowerCase() === name.toLowerCase();
    });
    if (!has) card.description = (notes.trim() === "") ? name : (notes.replace(/\s+$/, "") + "\n" + name);
    return true;
}

// One arrival, introduced once, ever (the intro ledger is the reversibility
// guarantee: a name the player removed is never re-added).
function BK_introduce(card) {
    const BK = BK_state();
    if (!BK || !card) return;
    const name = String(card.title || "").trim();
    const key = name.toLowerCase();
    if (name === "" || BK.intro.indexOf(key) !== -1) return;
    const legs = [];
    // IS leg: the @-title protocol (IS:704) — IS strips the @ on its next
    // config scan and registers the agent; the title round-trips.
    try {
        if (typeof state === "object" && state && state.InnerSelf && name.charAt(0) !== "@") {
            card.title = "@" + name;
            legs.push("IS");
        }
    } catch (e) {}
    try { if (BK_lcGuestbook(name)) legs.push("LC"); } catch (e) {}
    if (legs.length === 0) return;   // nobody home; leave the arrival for a future pass
    BK.intro.push(key);
    if (BK.intro.length > 30) BK.intro.shift();
    if (typeof SC_report === "function") {
        SC_report("BridgeKit", "introduced \"" + name + "\" — " + legs.join("+"));
        // SlowBurn leg: the leash outranks the convenience — suggestion only.
        try {
            if (typeof SLOWBURN === "function" && !BK_slowburnConfigured()) {
                SC_report("BridgeKit", name + " arrived — fill their name into Evolution Stages to start SlowBurn");
            }
        } catch (e) {}
    }
}

// The scan: runs on the output pass of an AC generation turn (BK_onOutput is
// wired AFTER InnerSelf("output"), where AC finalizes the card). Compression
// turns set the same flag but add no card — empty diff, nothing happens.
function BK_introductionPass() {
    const BK = BK_state();
    if (!BK) return;
    const titles = BK_classTitles();
    const t = BK_turn();
    if (t !== -1 && BK.scanTurn === t && BK_autoRegisterOn()) {
        for (let i = 0; i < titles.length; i++) {
            const title = titles[i];
            if (BK.snap.indexOf(title) !== -1) continue;
            let why = null;
            let card = null;
            if (BK_INTRO_EXCLUDE_RX.test(title.trim())) why = "excluded title";
            else if (!(card = (typeof SC_get === "function") ? SC_get(title) : null)) why = "card not readable";
            else why = BK_whyNotCharacter(card);
            if (why === null) {
                BK_introduce(card);
            } else if (typeof log === "function") {
                // skips stay out of the Event Log; the console is the tester's channel
                log("[BridgeKit] not introduced: \"" + title + "\" — " + why);
            }
        }
        BK.scanTurn = -1;
    }
    BK.snap = BK_classTitles().slice(0, 60);
}

// Output pass: passthrough groom + the Introduction scan. LC re-types its
// cards on every sync and runs before us on output — this pass runs after,
// so categories stick between turns. Returns text untouched, always (rule 7).
function BK_onOutput(text) {
    try { BK_retypeGuestCards(); } catch (e) {}
    try { BK_introductionPass(); } catch (e) {}
    return String(text || "");
}

// Input pass: guest hospitality. Ensures starter cards for guest scripts
// that expect hand-made ones. Returns text untouched, always (rule 7).
function BK_onInput(text) {
    try { BK_retypeGuestCards(); } catch (e) {}
    try { BK_autoRegisterOn(); } catch (e) {}   // rule 11: config card materializes Turn 1
    try {
        if (typeof SLOWBURN === "function" && typeof SC_ensure === "function") {
            const has = (typeof SC_get === "function" && SC_get(BK_SB_CARD_TITLE))
                || (typeof SC_find === "function"
                    && SC_find(function (c) { return c && typeof c.entry === "string" && c.entry.indexOf("Evolution Stages") !== -1; }));
            if (!has) {
                const card = SC_ensure(BK_SB_CARD_TITLE, {
                    type: "Slowburn",
                    keys: BK_SB_CARD_TITLE,
                    entry: BK_SB_CARD_ENTRY,
                    description: BK_SB_CARD_HOWTO
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
function BK_onContext(text) {
    const ctx = String(text || "");
    try { BK_retypeGuestCards(); } catch (e) {}   // LC's context sync just ran; re-groom
    try {
        const isAC = BK_isAutoCardsContext(ctx);
        if (isAC) {
            // Flag this turn for the Introduction scan (runs in BK_onOutput,
            // after AC has finalized the generated card).
            const BK = BK_state();
            if (BK) BK.scanTurn = BK_turn();
        }
        const why = isAC ? "Auto-Cards turn"
            : BK_isSaeControlTurn() ? "Story Arc Engine turn"
            : BK_isLcThoughtContext(ctx) ? "LC thought turn"
            : BK_isTaskContext(ctx) ? "IS task turn"
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
