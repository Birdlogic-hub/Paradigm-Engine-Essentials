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

// IS-fork Library (example_Lib.js): Essentials + ISCompat + pinned Inner Self.
// Only built when the pinned copy is reachable (workspace layout).
const IS_PINNED = path.join(__dirname, "..", "..", "Third Party", "Inner Self", "Inner Self v1.0.2 - Library.js");
if (fs.existsSync(IS_PINNED)) {
    const isc = fs.readFileSync(path.join(__dirname, "BridgeKit", "BridgeKit.js"), "utf-8").trimEnd();
    const is = fs.readFileSync(IS_PINNED, "utf-8").trimEnd();
    const fork = out + "\n" + isc + "\n\n" + is + "\n";
    fs.writeFileSync(path.join(__dirname, "PE Essentials x IS - Library.js"), fork);
    console.log("IS fork: bundle + BridgeKit + Inner Self v1.0.2 -> PE Essentials x IS - Library.js (" + fork.length + " chars)");
}
