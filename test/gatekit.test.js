const H = require("./harness");
H.fresh();
eval(H.load("CardLib", "GateKit"));

// Injection + capture happy path
H.turn(1, "do");
GK_onInput(H.doFrame("You climb"));
let ctx = GK_onContext(H.ctx());
H.assert(ctx.endsWith("</SYSTEM>") && /luck=\d+/.test(ctx), "arbiter block at context tail with luck");
H.assert(state.memory.frontMemory === undefined, "frontMemory never touched");
H.assert(!!SC_get("Event Log"), "Event Log materializes on first input (rule 11)");
let out = GK_onOutput("skill=climbing; difficulty=minor; check=partial;\nHalfway up.");   // v0.7 skill-first
H.assert(GK_lastCheck().result === "partial" && GK_lastCheck().skill === "climbing", "verdict captured");
H.assert(!/difficulty=/.test(out), "verdict stripped from prose");

// Semantic + command-turn guards
H.turn(2, "continue");
H.assert(GK_onContext(H.ctx()) === H.ctx(), "continue turn: no injection");
H.turn(3, "do");
GK_onInput(" ");
GK_markCommandTurn();
H.assert(GK_onContext(H.ctx()) === H.ctx(), "GK_markCommandTurn seam: bookkeeping turn skipped");

// Dialect tolerance + coercion + near-miss
H.turn(4, "do");
GK_onInput(H.doFrame("You leap to the moon"));
GK_onOutput("difficulty: impossible; check: success; skill: leaping\nYou soar.");
H.assert(GK_lastCheck().result === "fail", "impossible=>fail coercion (colon dialect)");
H.turn(5, "do");
GK_onInput(H.doFrame("You sneak"));
global.logLines.length = 0;
out = GK_onOutput("Difficulty - Major | Check - Partial\nYou creep.");
H.assert(!/Difficulty - Major/.test(out) && logLines.some(l => /UNPARSED/.test(l)), "near-miss: stripped + logged");

// Config card live switches
H.turn(6, "do");
H.resetCaches();
GK_onInput(H.doFrame("You wave"));
const card = SC_get("GateKit Config");
H.assert(card && /Enabled: true/.test(card.entry) && /Report: true/.test(card.entry), "config card with live switches");
card.entry = card.entry.replace("Enabled: true", "Enabled: false");
H.resetCaches();
H.assert(GK_onContext(H.ctx()) === H.ctx(), "Enabled: false — live off-switch");
card.entry = card.entry.replace("Enabled: false", "Enabled: true");
H.resetCaches();

// Event Log reporting
H.turn(7, "do");
GK_onInput(H.doFrame("You pick the lock"));
GK_onOutput("difficulty=major; check=success; skill=lockpicking;\nClick.");   // v0.4-v0.6 dialect still parsed
H.assert(/T7 \[GateKit\] ruling: major difficulty → success \(lockpicking\)/.test(SC_get("Event Log").entry), "ruling posted to Event Log");

// State migration sweeps
state.vars.GK = { on: true, echo: "stale", luck: 44, luckTurn: 5, lastCheck: null, log: [] };
const GK = GK_state();
H.assert(!("on" in GK) && !("echo" in GK) && GK.luck === 44, "migration sweeps dead fields, keeps live");

H.summary("GateKit");
