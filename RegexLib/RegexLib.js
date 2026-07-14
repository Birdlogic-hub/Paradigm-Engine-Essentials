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
// Combed from the Endless Backrooms SIS parsing layer (the proven core:
// rxEscape / matchItem / normalizeCommandText / parseSlashCommand /
// parseItemAndAmount), generalized per doctrine:
//   - candidates are INJECTED — no module's state is read from in here
//   - commas survive normalization (SIS stripped them; PMD-style comma args
//     like "/recruit species, nickname" need them)
//   - trailing quotes from Say-framing are scrubbed (SIS left them on args)
//   - the inventory||wallet fallthrough stays with callers — that was SIS
//     plumbing, not grammar
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
