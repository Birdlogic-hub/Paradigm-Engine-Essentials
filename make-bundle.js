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
