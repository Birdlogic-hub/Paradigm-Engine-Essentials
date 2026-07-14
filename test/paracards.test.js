const H = require("./harness");
H.fresh();
eval(H.load("ParaCards"));

// Projection core
const c1 = SC_ensure("Condition", { type: "status", keys: SC_ALWAYS_ON, entry: "fine" });
H.assert(SC_ensure("Condition", { entry: "X" }) === c1 && c1.entry === "fine" && storyCards.length === 1, "ensure idempotent");
H.assert(c1.keys === ".", "always-on keys");
SC_render("Condition", "Sanity: 90");
H.assert(SC_get("Condition").entry === "Sanity: 90", "render updates");

// Config round-trip
const DEF = { SIDES: 100, CRIT_LOW: 5, PARSE_WORDS: true, LABEL: "plain" };
let cfg = SC_config("Test Config", DEF);
const card = SC_get("Test Config");
H.assert(/Sides: 100/.test(card.entry) && /Parse Words: true/.test(card.entry), "defaults rendered as labels");
card.entry = card.entry.replace("Sides: 100", "Sides: 20").replace("Parse Words: true", "Parse Words: off").replace("Label: plain", "Label: fancy");
cfg = SC_config("Test Config", DEF);
H.assert(cfg.SIDES === 20 && cfg.PARSE_WORDS === false && cfg.LABEL === "fancy", "typed round-trip incl. boolean synonyms");
card.entry = card.entry.replace("Sides: 20", "Sides: banana");
H.assert(SC_config("Test Config", DEF).SIDES === 100, "garbage falls back");
card.entry = card.entry.split("\n").filter(l => !/^Crit Low/.test(l)).join("\n");
SC_config("Test Config", DEF);
H.assert(/Crit Low: 5/.test(SC_get("Test Config").entry) && /Label: fancy/.test(SC_get("Test Config").entry), "healing preserves player edits");

// Codex
const DEX = [
  { title: "Mew", entry: "## Mew", type: "Pokemon" },
  { title: "Mewtwo", entry: "## Mewtwo", type: "Pokemon" },
  { title: "Pikachu", entry: "## Pikachu", type: "Pokemon", aliases: ["the yellow mouse"] }
];
let made = SC_codex(DEX, "Mewtwo regards you coldly.");
H.assert(JSON.stringify(made) === '["Mewtwo"]' && SC_get("Mew") === null, "Mew-in-Mewtwo false positive fixed");
H.assert(SC_codex(DEX, "Mewtwo again.").length === 0, "codex idempotent");
made = SC_codex(DEX, "the yellow mouse crackles past");
H.assert(made[0] === "Pikachu" && SC_get("Pikachu").keys === "Pikachu,the yellow mouse", "alias materializes canonical + trigger keys");
H.assert(SC_codex(DEX, "Mew!")[0] === "Mew", "genuine short-name mention still works");

// Event Log — newest first, 10-event window, turn-stamped
H.turn(40, "do");
SC_report("GateKit", "ruling: minor difficulty → partial · luck 42");
SC_report("Inventory", "rock x1 removed (/throw)");
let lines = SC_get("Event Log").entry.split("\n");
H.assert(lines[1] === "T40 [Inventory] rock x1 removed (/throw)", "most recent event first");
H.turn(41, "do");
SC_report("GateKit", "ruling: major difficulty → fail · luck 7");
lines = SC_get("Event Log").entry.split("\n");
H.assert(lines[1].startsWith("T41") && lines[2].startsWith("T40"), "new turn on top, older retained");
SC_report("GateKit", "ruling: major difficulty → fail · luck 7");
H.assert(SC_get("Event Log").entry.split("\n").length === 4, "retry re-post deduped");
for (let i = 0; i < 12; i++) { H.turn(42 + i, "do"); SC_report("GateKit", "event " + i); }
lines = SC_get("Event Log").entry.split("\n");
H.assert(lines.length === 11 && /event 11/.test(lines[1]), "window capped at 10, newest kept");
H.turn(45, "do");   // erase rewind
SC_report("Inventory", "potion x1 used");
lines = SC_get("Event Log").entry.split("\n");
H.assert(lines[1].startsWith("T45") && !lines.some(l => /^T4[6-9]|^T5\d/.test(l)), "erased turns dropped");

H.summary("ParaCards");
