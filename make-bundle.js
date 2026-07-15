// Regenerates "PE Essentials - Library.js" from the module sources.
// Usage: node make-bundle.js   (run from the repo root, commit the result)
// Order matters only for readability — everything is function declarations,
// hoisted across the single Library scope. Hook-tab files are hand-owned.
const fs = require("fs");
const path = require("path");
const MODULES = ["RegexLib", "CardLib", "GateKit", "InventoryKit"];
const out = MODULES
    .map(m => fs.readFileSync(path.join(__dirname, m, m + ".js"), "utf-8").trimEnd())
    .join("\n\n") + "\n";
fs.writeFileSync(path.join(__dirname, "PE Essentials - Library.js"), out);
console.log("bundle: " + MODULES.join(" + ") + " -> PE Essentials - Library.js (" + out.length + " chars)");

// PE Characters Library: the full character stack — Essentials + BridgeKit +
// Inner Self (pinned) + Living Characters (pinned) + SlowBurn (pinned).
// Only built when the workspace pins are reachable; hook tabs are hand-owned.
const PINS = {
    is: path.join(__dirname, "..", "..", "Third Party", "Inner Self", "Inner Self v1.0.2 - Library.js"),
    lc: path.join(__dirname, "..", "..", "Third Party", "Living Characters", "LC library.js"),
    sb: path.join(__dirname, "..", "..", "Third Party", "Slowburn", "SB LIBRARY.txt")
};
if (Object.values(PINS).every(p => fs.existsSync(p))) {
    const part = p => fs.readFileSync(p, "utf-8").trimEnd();
    const chars = [
        out.trimEnd(),
        part(path.join(__dirname, "BridgeKit", "BridgeKit.js")),
        part(PINS.is),
        part(PINS.lc),
        part(PINS.sb)
    ].join("\n\n") + "\n";
    fs.writeFileSync(path.join(__dirname, "PE Characters - Library.js"), chars);
    console.log("PE Characters: bundle + BridgeKit + IS + LC + SlowBurn -> PE Characters - Library.js (" + chars.length + " chars)");
}
