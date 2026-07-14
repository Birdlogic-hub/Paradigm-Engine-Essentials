const H = require("./harness");
H.fresh();
eval(H.load("RegexLib"));

// The AID framing gauntlet — live-shaped, per rule 9
H.assert(RX_normalize("> You /take sword.") === "/take sword", "Do-framing scrubbed");
H.assert(RX_normalize('> You say "/drop 3 potions"') === "/drop 3 potions", "Say-framing + quotes scrubbed");
H.assert(RX_normalize("> You /check.\n") === "/check", "trailing newline after period (the v0.1.1 live bug)");
H.assert(RX_normalize("\n> You /check.  \n\n") === "/check", "leading + trailing newlines");
H.assert(RX_normalize('> You /take sword?!"\n') === "/take sword", "mixed trailing junk in any order");
H.assert(RX_normalize("/recruit Pikachu, Sparky.") === "/recruit Pikachu, Sparky", "commas SURVIVE (PMD-style args)");

// Command parsing + verb filter
let c = RX_command(H.doFrame("/take 3 potions"));
H.assert(c && c.name === "take" && c.args === "3 potions", "command parsed from framed input");
H.assert(RX_command("/check on", ["check"]).name === "check", "verb filter accepts own verb");
H.assert(RX_command("/roll 2d6", ["check", "take"]) === null, "verb filter rejects foreign verb");
H.assert(RX_command("You climb the wall.") === null, "prose is not a command");
c = RX_command(H.doFrame("/take 3 potions, 2 ropes"));
H.assert(c && c.args === "3 potions, 2 ropes", "commas in args survive framing");

// The crown-jewel matcher
const INV = ["Potion", "key", "key to the cellar", "Wand (+1)", "St. John's Wort", "rope"];
let m = RX_matchOne(INV, "key to the cellar quietly");
H.assert(m && m.match === "key to the cellar" && m.remainder === "quietly", "longest-first beats prefix capture");
m = RX_matchOne(INV, "KEY under the mat");
H.assert(m && m.match === "key" && m.remainder === "under the mat", "case-insensitive identity, canonical casing");
H.assert(RX_matchOne(INV, "Wand (+1) at the ghoul").match === "Wand (+1)", "metacharacter names survive");
H.assert(RX_matchOne(INV, "St. John's Wort").match === "St. John's Wort", "interior punctuation survives");
H.assert(RX_matchOne(INV, "keyboard") === null, "boundary: 'key' does not match 'keyboard'");
H.assert(RX_matchOne([], "anything") === null && RX_matchOne(INV, "") === null, "empty inputs null, never throw");
H.assert(RX_findIn(["Arcturia Prime"], "points to Arcturia Prime tonight") === "Arcturia Prime", "findIn locates multiword noun");
H.assert(RX_findIn(["Earth"], "unearthed secrets") === null, "findIn respects boundaries");

// Amounts, both ergonomics
let r = RX_nounAndAmount(INV, "3 rope"); H.assert(r && r.name === "rope" && r.amount === 3, "amount-first");
r = RX_nounAndAmount(INV, "rope 3"); H.assert(r && r.amount === 3, "noun-first trailing amount");
r = RX_nounAndAmount(INV, "2 key to the cellar on the hook");
H.assert(r && r.name === "key to the cellar" && r.amount === 2 && r.tail === " on the hook", "amount + multiword + tail");
H.assert(RX_nounAndAmount(INV, "7 dragons") === null, "unknown noun null (caller fallthrough)");

// csv / tail / keyValue
H.assert(JSON.stringify(RX_csv("Pikachu, Sparky., , Eevee")) === '["Pikachu","Sparky","Eevee"]', "csv trims/de-periods/drops empties");
H.assert(RX_tail("on the table") === " on the table" && RX_tail("") === "", "tail formatting");
H.assert(RX_keyValue("Luck Max: 20").value === "20" && RX_keyValue("difficulty=impossible").key === "difficulty", "keyValue both dialects");
H.assert(RX_keyValue("just prose here") === null, "non-kv null");

H.summary("RegexLib");
