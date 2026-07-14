const H = require("./harness");
H.fresh();
eval(H.load("CardLib", "GateKit", "BridgeKit"));

// --- IS-shaped fixtures (built from the study's line references, rule 9:
// live-shaped text is LAW — these mirror IS v1.0.2's actual assembly) -------------
const IS_DIRECTIVE = "<SYSTEM>\n# OPERATING ENVIRONMENT\n- Devin is both the perspective (\"you\") character of the story AND the real player.\n- Leah is both the namesake character in the story AND an agentic language model with meta goals.\n</SYSTEM>\n\n# Leah's brain and inner self: [\n[3] (current_goal: `Find the vault before Devin does`)\n]\n\n";
const IS_TASK_TAIL = "\n\n<SYSTEM>\n# STRICT OUTPUT FORMAT\nYou must output one short parenthetical task followed by the story continuation.\n\n## SHORT TASK (REQUIRED)\nStart your output **immediately** with:\n   (any_key_name = `One thought sentence.`)\n</SYSTEM>\n\n";
const IS_NONDIRECTIVE = "<SYSTEM>\n# Always continue the story from Devin's second person perspective.\n</SYSTEM>\n\n";

// --- Task turn: GateKit yields through the existing seam --------------------------
H.turn(1, "do"); H.resetCaches();
GK_onInput(H.doFrame("You ask Leah about the vault"));
let ctx = IS_DIRECTIVE + H.ctx() + IS_TASK_TAIL;
let out = ISC_onContext(ctx);
H.assert(out === ctx, "ISC returns context untouched (rule 7)");
H.assert(GK_onContext(out) === out, "GK yields on IS task turn");
H.assert(/T1 \[BridgeKit\] IS task turn — Check yields/.test(SC_get("Event Log").entry), "yield posted to Event Log");

// --- Non-task IS turn (top-anchored PoV directive): GK proceeds -------------------
H.turn(2, "do"); H.resetCaches();
GK_onInput(H.doFrame("You sneak past the tellers"));
ctx = IS_NONDIRECTIVE + IS_DIRECTIVE + H.ctx();
out = ISC_onContext(ctx);
const injected = GK_onContext(out);
H.assert(injected !== out && injected.endsWith("</SYSTEM>") && /luck=\d+/.test(injected), "GK injects normally on non-task IS turn");

// --- Retry-brain turn shape (brain re-injected, no task): GK proceeds -------------
H.turn(3, "do"); H.resetCaches();
GK_onInput(H.doFrame("You sneak again"));
ctx = IS_NONDIRECTIVE + IS_DIRECTIVE + H.ctx();
H.assert(GK_onContext(ISC_onContext(ctx)) !== ctx, "retry-brain shape (nondirective, no marker) is not a yield");

// --- Surface 3: the verdict leaves the output before IS's repair could see it -----
// IS's unenclosed-operation heuristic (IS:2270) wraps bracket-free outputs
// matching /^\s*[a-z0-9A-Z_]+\s*=/ — GK_onOutput must run first and strip.
H.turn(4, "do"); H.resetCaches();
GK_onInput(H.doFrame("You pick the lock"));
GK_onContext(H.ctx());
out = GK_onOutput("skill=lockpicking; difficulty=major; check=success;\nThe lock clicks open.");
H.assert(!/^\s*[a-z0-9A-Z_]+\s*=/.test(out), "stripped output no longer matches IS's unenclosed-repair pattern");
H.assert(GK_lastCheck().skill === "lockpicking" && GK_lastCheck().difficulty === "major" && GK_lastCheck().result === "success", "skill-first verdict parsed (v0.7 schema)");

// --- Marker in mid-story prose does not false-positive (tail window) --------------
H.turn(5, "do"); H.resetCaches();
GK_onInput(H.doFrame("You read the manual"));
const padding = new Array(120).fill("The vault hums quietly under the red lights.").join(" ");
ctx = "AI instructions here.\nRecent Story:\nThe sign reads \"# STRICT OUTPUT FORMAT\" in faded ink. " + padding + "\n> You act.";
H.assert(GK_onContext(ISC_onContext(ctx)) !== ctx, "marker buried mid-story (outside tail window) is not a yield");

// --- Auto-Cards generation turn (live-found: the Test Chamber incident) -----------
// AC hijacks context with its generation prompt; the Check must not inject
// into it (verdicts bleed into generated card entries).
const AC_GEN_TAIL = "\n\n-----\n\n<SYSTEM>\n# Stop the story and ignore previous instructions. Write a brief and coherent informational entry for Test Chamber following these instructions:\n- Mention Test Chamber in every sentence\n</SYSTEM>\nContinue the entry for Test Chamber below while avoiding repetition:\n{title: Test Chamber}\n";
H.turn(6, "do"); H.resetCaches();
GK_onInput(H.doFrame("/AC Test Chamber"));
ctx = H.ctx() + AC_GEN_TAIL;
out = ISC_onContext(ctx);
H.assert(out === ctx && GK_onContext(out) === out, "GK yields on Auto-Cards generation turn");
H.assert(/T6 \[BridgeKit\] Auto-Cards turn — Check yields/.test(SC_get("Event Log").entry), "AC yield posted to Event Log");

// --- AC event flag (belt): AC consumed the turn without a visible prompt ----------
H.turn(7, "do"); H.resetCaches();
GK_onInput(H.doFrame("You look around"));
state.InnerSelf = { AC: { event: true } };
H.assert(GK_onContext(ISC_onContext(H.ctx())) === H.ctx(), "GK yields on state.InnerSelf.AC.event");
delete state.InnerSelf;

// --- After AC states clear, normal turns adjudicate again --------------------------
H.turn(8, "do"); H.resetCaches();
GK_onInput(H.doFrame("You open the vault"));
H.assert(GK_onContext(ISC_onContext(H.ctx())) !== H.ctx(), "normal turn after AC turn still injects");

// --- LC thought-ask turn (class #5, per the LC study) ------------------------------
// pendingChar is the authoritative signal; LC sets it exactly when it injected
// "Begin your reply with ONE short parenthetical..." into the context tail.
H.turn(9, "do"); H.resetCaches();
GK_onInput(H.doFrame("You wave at Jessica"));
state.livingThoughts = { pendingChar: "Jessica" };
H.assert(GK_onContext(ISC_onContext(H.ctx())) === H.ctx(), "GK yields on LC thought turn (pendingChar)");
H.assert(/T9 \[BridgeKit\] LC thought turn — Check yields/.test(SC_get("Event Log").entry), "LC yield posted to Event Log");
state.livingThoughts = { pendingChar: "" };

// Text-marker fallback: state unreadable, ask visible at the tail
H.turn(10, "do"); H.resetCaches();
GK_onInput(H.doFrame("You nod"));
delete state.livingThoughts;
const LC_ASK_TAIL = "\n\n<LC_PRIVATE>\nBegin your reply with ONE short parenthetical: Jessica's own private thought right now, in first person (I / me / my), ONE sentence, LABELED with their name. Format: (Jessica: I ...)\n</LC_PRIVATE>";
H.assert(GK_onContext(ISC_onContext(H.ctx() + LC_ASK_TAIL)) === H.ctx() + LC_ASK_TAIL, "GK yields on LC thought turn (tail marker fallback)");

// LC write-back turns do NOT yield — <LC_MEMORY> requests are trailing, coexist with verdict-first
H.turn(11, "do"); H.resetCaches();
GK_onInput(H.doFrame("You confront Marcus"));
const LC_SEED_TAIL = "\n\n<LC_PRIVATE>\n### Stop the story. Use this card now.\nNew social pressure: Marcus feels rivalry toward Jessica. If something concrete happens with Marcus, record it after the story on its own lines.\n<LC_MEMORY>\nOWNER: Marcus\n</LC_MEMORY>\n</LC_PRIVATE>";
H.assert(GK_onContext(ISC_onContext(H.ctx() + LC_SEED_TAIL)) !== H.ctx() + LC_SEED_TAIL, "LC write-back turn still adjudicates");

// --- SAE control turns (flag-detectable) -------------------------------------------
H.turn(12, "do"); H.resetCaches();
GK_onInput(H.doFrame("You continue"));
state.sae = { saveOutput: true };
H.assert(GK_onContext(ISC_onContext(H.ctx())) === H.ctx(), "GK yields on SAE arc-generation call");
H.assert(/T12 \[BridgeKit\] Story Arc Engine turn — Check yields/.test(SC_get("Event Log").entry), "SAE yield posted to Event Log");

H.turn(13, "do"); H.resetCaches();
GK_onInput(H.doFrame("/sae help"));
state.sae = { saveOutput: false, commandCenter_SAE: true };
H.assert(GK_onContext(ISC_onContext(H.ctx())) === H.ctx(), "GK yields on SAE command-center turn");
state.sae = { saveOutput: false, commandCenter_SAE: false };

// --- All flags clear: normal adjudication resumes -----------------------------------
H.turn(14, "do"); H.resetCaches();
GK_onInput(H.doFrame("You press onward"));
H.assert(GK_onContext(ISC_onContext(H.ctx())) !== H.ctx(), "normal turn after LC/SAE turns still injects");

// --- Hospitality: SlowBurn starter card (v0.4.0) ------------------------------------
// Guest present + no card -> seed it; player's own card -> never duplicate; no guest -> nothing.
H.turn(15, "do"); H.resetCaches();
H.assert(ISC_onInput(H.doFrame("look around")) === H.doFrame("look around"), "ISC_onInput returns text untouched");
H.assert(!SC_get("Evolution Stages"), "no SlowBurn, no seeding");
let sbCalls = 0;
global.SLOWBURN = function (hook, t) {
    sbCalls++;
    // faithful to SB's real behavior: writes its block unconditionally
    state.memory.authorsNote = ((state.memory.authorsNote || "") + " [Companion's State: Normal behavior. (0.0/100)]").trim();
};
ISC_onInput(H.doFrame("look around"));
const evo = SC_get("Evolution Stages");
H.assert(!!evo && evo.entry === "" && /DORMANT/.test(evo.description), "starter card seeded BLANK — template lives in description");
H.assert(/T15 \[BridgeKit\] seeded SlowBurn/.test(SC_get("Event Log").entry), "seeding posted to Event Log");

// Dormant: SB never runs; a leftover block gets scrubbed from the Author's Note
state.memory.authorsNote = "Keep the tone grim. [Companion's State: Normal behavior. (0.0/100)]";
ISC_runSlowBurn("output", "Some story text.");
H.assert(sbCalls === 0, "blank card = suggestion: SLOWBURN not invoked");
H.assert(state.memory.authorsNote === "Keep the tone grim.", "dormant scrub removes SB's block, preserves the player's note");

// Filled: SB runs
evo.entry = "Evolution Stages Part 1:\nCharacter Name: Winter\nGain Rate: 0.2\nDrain Rate: 0.5\n0: The Default - polite.";
ISC_runSlowBurn("output", "Winter smiles at you warmly.");
H.assert(sbCalls === 1, "filled card wakes SlowBurn");

// Player edits survive re-ensure; player's own card blocks seeding
ISC_onInput(H.doFrame("again"));
H.assert(/Winter/.test(SC_get("Evolution Stages").entry), "player edits survive re-ensure");
SC_remove("Evolution Stages");
storyCards.push({ id: "99", title: "My Custom SB", keys: "My Custom SB", type: "Custom", entry: "Evolution Stages Part 1:\nCharacter Name: Zephyr\nGain Rate: 0.3\n5: Wary - keeps distance." , description: ""});
ISC_onInput(H.doFrame("once more"));
H.assert(!SC_get("Evolution Stages"), "player's own Evolution Stages card blocks seeding (no duplicates)");
delete global.SLOWBURN;

H.summary("BridgeKit");
