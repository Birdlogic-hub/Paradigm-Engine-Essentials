// Regenerates "PE Essentials - Library.js" from the module sources.
// Usage: node make-bundle.js   (run from the repo root, commit the result)
// Order matters only for readability — everything is function declarations,
// hoisted across the single Library scope. Hook-tab files are hand-owned.
const fs = require("fs");
const path = require("path");
const MODULES = ["RegexLib", "ParaCards", "GateKit", "SlashInventory"];
const out = MODULES
    .map(m => fs.readFileSync(path.join(__dirname, m, m + ".js"), "utf-8").trimEnd())
    .join("\n\n") + "\n";
fs.writeFileSync(path.join(__dirname, "PE Essentials - Library.js"), out);
console.log("bundle: " + MODULES.join(" + ") + " -> PE Essentials - Library.js (" + out.length + " chars)");

// IS-fork Library (example_Lib.js): Essentials + ISCompat + pinned Inner Self.
// Only built when the pinned copy is reachable (workspace layout).
const IS_PINNED = path.join(__dirname, "..", "..", "Third Party", "Inner Self", "Inner Self v1.0.2 - Library.js");
if (fs.existsSync(IS_PINNED)) {
    const isc = fs.readFileSync(path.join(__dirname, "ISCompat", "ISCompat.js"), "utf-8").trimEnd();
    const is = fs.readFileSync(IS_PINNED, "utf-8").trimEnd();
    const fork = out + "\n" + isc + "\n\n" + is + "\n";
    fs.writeFileSync(path.join(__dirname, "PE Essentials + IS - Library.js"), fork);
    console.log("IS fork: bundle + ISCompat + Inner Self v1.0.2 -> PE Essentials + IS - Library.js (" + fork.length + " chars)");
}
