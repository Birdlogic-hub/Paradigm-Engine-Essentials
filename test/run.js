// Runs every *.test.js in this directory; exit code aggregates.
const { execFileSync } = require("child_process");
const fs = require("fs");
let failed = 0;
for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort()) {
    console.log("\n===== " + f + " =====");
    try { console.log(execFileSync("node", [__dirname + "/" + f], { encoding: "utf-8" })); }
    catch (e) { failed++; console.log(e.stdout || ""); console.error(e.stderr || ""); }
}
console.log(failed ? "\n*** " + failed + " suite(s) failed ***" : "\nAll suites passed.");
process.exit(failed ? 1 : 0);
