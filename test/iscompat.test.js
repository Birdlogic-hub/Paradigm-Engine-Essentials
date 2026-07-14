const H = require("./harness");
H.fresh();
eval(H.load("ParaCards", "GateKit", "ISCompat"));

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
H.assert(/T1 \[ISCompat\] IS task turn — Check yields/.test(SC_get("Event Log").entry), "yield posted to Event Log");

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

H.summary("ISCompat");
