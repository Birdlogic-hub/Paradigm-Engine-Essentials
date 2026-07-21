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

// --- v0.7.2: the Die — fixed d20, stated by name, bounds honored ------------------
H.turn(90, "do"); H.resetCaches();
GK_onInput(H.doFrame("You test the dice"));
let d20ctx = GK_onContext(H.ctx());
H.assert(/luck=\d+ \(a d20 roll\)/.test(d20ctx), "block names the d20 outright");
H.assert(/dungeon master reads a d20/.test(d20ctx), "DM framing line present");
for (let t = 91; t < 111; t++) {
    H.turn(t, "do"); H.resetCaches();
    GK_onInput(H.doFrame("You roll again"));
    const L = state.vars.GK.luck;
    H.assert(L >= 1 && L <= 20, "roll within die bounds (turn " + t + ": " + L + ")");
}
GK_setLuck(999);
H.assert(state.vars.GK.luck === 20, "GK_setLuck clamps fortune-benders to the die");

// --- v0.8.0: the Cost — optional bidirectional resource field ----------------------
H.turn(120, "do"); H.resetCaches();
GK_onInput(H.doFrame("You sprint up the scree"));
GK_onContext(H.ctx());
GK_onOutput("skill=climbing; difficulty=major; check=success; resource=stamina -6;\nYou crest the ridge, lungs burning.");
H.assert(GK_lastCheck().resource === "stamina" && GK_lastCheck().resourceDelta === -6, "spend parses (name -n)");
H.turn(121, "do"); H.resetCaches();
GK_onInput(H.doFrame("You drink the elixir"));
GK_onContext(H.ctx());
GK_onOutput("skill=none; difficulty=trivial; check=success; resource=health +10;\nWarmth floods you.");
H.assert(GK_lastCheck().resource === "health" && GK_lastCheck().resourceDelta === 10, "restore parses (name +n)");
H.turn(122, "do"); H.resetCaches();
GK_onInput(H.doFrame("You look around"));
GK_onContext(H.ctx());
GK_onOutput("skill=none; difficulty=trivial; check=success; resource=none;\nAll quiet.");
H.assert(GK_lastCheck().resource === null && GK_lastCheck().resourceDelta === 0, "resource=none is null");
H.turn(123, "do"); H.resetCaches();
GK_onInput(H.doFrame("You pick the lock"));
GK_onContext(H.ctx());
GK_onOutput("skill=lockpicking; difficulty=minor; check=success;\nClick.");
H.assert(GK_lastCheck().resource === null, "absent field is null (backward compatible)");
H.assert(GK_lastCheck().skill === "lockpicking", "old-shape verdicts still fully parse");

// --- v0.8.1: the bare dialect — the live leak, verbatim (rule 9) -------------------
H.turn(130, "do"); H.resetCaches();
GK_onInput(H.doFrame("You take the tonic, stowing it away."));
GK_onContext(H.ctx());
let bareOut = GK_onOutput("Survival; trivial; success; resource=none;\nMara nods with approval as you pocket the healing tonic.");
H.assert(GK_lastCheck().skill === "survival" && GK_lastCheck().difficulty === "trivial" && GK_lastCheck().result === "success", "bare dialect parses (labels shed, order kept)");
H.assert(GK_lastCheck().resource === null, "bare resource=none is null");
H.assert(bareOut.indexOf("trivial") === -1 && /^Mara nods/.test(bareOut), "bare verdict line stripped from the story");
H.turn(131, "do"); H.resetCaches();
GK_onInput(H.doFrame("You haul yourself up the shaft"));
GK_onContext(H.ctx());
GK_onOutput("Climbing; major; success; resource=stamina -8;\nYou reach the maintenance shaft.");
H.assert(GK_lastCheck().resource === "stamina" && GK_lastCheck().resourceDelta === -8, "bare dialect carries the resource field");

H.summary("GateKit");
