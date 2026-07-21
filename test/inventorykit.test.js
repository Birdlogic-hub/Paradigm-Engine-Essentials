const H = require("./harness");
H.fresh();
eval(H.load("RegexLib", "CardLib", "GateKit", "InventoryKit"));

function play(n, input, modelOut) {
  H.turn(n, "do"); H.resetCaches();
  let t = INV_onInput(input);
  t = GK_onInput(t);
  GK_onContext(H.ctx());
  let out = GK_onOutput(modelOut);
  out = INV_onOutput(out);
  return { t, out };
}

// Turn 1 materialization (EB ensure-on-input lineage): both cards exist on
// the first player action, before any command is ever issued.
H.turn(0, "do"); H.resetCaches();
INV_onInput(H.doFrame("look around"));
H.assert(!!SC_get("Inventory Config") && !!SC_get("Inventory") && !!SC_get("Event Log"), "cards + Event Log materialize on first action, pre-command");
H.assert(SC_get("Inventory").type === "ParadigmEngine" && SC_get("Inventory Config").type === "ParadigmEngine", "Inventory cards under the ParadigmEngine banner");

let r = play(1, H.doFrame("/take 3 torches"), "difficulty=trivial; check=success;\nGathered.");
H.assert(r.t === "You attempt to take 3 torches and stow them away." && INV_count("torches") === 3, "take: ATTEMPT stub + optimistic commit (the duck heist)");
H.assert(/\{torches x3 added to your inventory\.\}/.test(r.out), "take: visible receipt echo (SIS clarity)");
r = play(2, H.doFrame("/take golden idol"), "difficulty=major; check=fail;\nAir.");
H.assert(INV_count("golden idol") === 0 && /\{You failed to get the golden idol\.\}/.test(r.out) && !/golden idol x1 added/.test(r.out), "take: rollback on fail, receipt SNIPPED (deferred to ruling)");
r = play(3, H.doFrame("/throw torches at the goblin"), "difficulty=minor; check=fail;\nWide.");
H.assert(r.t === "You throw the torches at the goblin." && INV_count("torches") === 2, "throw: spend never refunds");
r = play(4, H.sayFrame("/drop 2 torches"), "Clatter.");
H.assert(INV_count("torches") === 0 && state.vars.GK.commandTurn === 4, "drop: say-framed, none policy marks turn");
INV_add("rope", 1);
r = play(5, H.doFrame("/drop 5 rope"), "x");
H.assert(INV_count("rope") === 1 && /\{You only have 1 rope\.\}/.test(r.out), "overspend refused");
r = play(6, H.doFrame("/use excalibur"), "x");
H.assert(/You don't have that/.test(r.out), "unknown item refused");
r = play(7, H.doFrame("/collect 50 gold"), "difficulty=trivial; check=success;\nJingle.");
r = play(8, H.doFrame("/give 20 gold to the guard"), "difficulty=minor; check=success;\nNod.");
H.assert((state.vars.INV.wallet.gold || 0) === 30 && r.t === "You give 20 gold to the guard.", "wallet credit/debit + tail");

const cfgCard = SC_get("Inventory Config");
cfgCard.entry = cfgCard.entry.replace("Take Arbitration: outcome", "Take Arbitration: gated");
r = play(9, H.doFrame("/take dragon egg"), "difficulty=impossible; check=success;\nOr not.");
H.assert(INV_count("dragon egg") === 0 && /\{The attempt fails — nothing gained\.\}/.test(r.out), "gated: blocked on fail (coerced)");
r = play(10, H.doFrame("/take iron key"), "difficulty=minor; check=success;\nYours.");
H.assert(INV_count("iron key") === 1 && r.t === "You attempt to take the iron key and stow it away.", "gated: allowed commit, attempt stub");
cfgCard.entry = cfgCard.entry.replace("Take Arbitration: gated", "Take Arbitration: outcome");

H.turn(11, "do"); H.resetCaches();
const t1 = INV_onInput(H.doFrame("/drop rope"));
const t2 = INV_onInput(H.doFrame("/drop rope"));
H.assert(t2 === t1 && INV_count("rope") === 0 && state.vars.INV.log.filter(o => o.name === "rope").length === 1, "retry: stub replay, no double-drop");

play(12, H.doFrame("/take lantern"), "difficulty=trivial; check=success;\nOK.");
r = play(13, H.doFrame("/undo"), "x");
H.assert(INV_count("lantern") === 0 && /\{Undid: add lantern x1\}/.test(r.out) && state.vars.GK.commandTurn === 13, "undo reverses, never judged");
r = play(14, H.doFrame("/inventory"), "x");
H.assert(/\{Inventory: .*iron key x1/.test(r.out), "/inventory echoes holdings");
H.assert(/T\d+ \[Inventory\]/.test(SC_get("Event Log").entry), "mutations reach the Event Log");
H.assert(/## Wallet/.test(SC_get("Inventory").entry) && /- iron key x 1/.test(SC_get("Inventory").entry), "Inventory card projection");

// --- v0.1.4: the multi-grab ---------------------------------------------------------
H.turn(60, "do"); H.resetCaches();
let mg = play(60, "/take 2 red healing tonic; iron dagger; rope", "skill=none; difficulty=trivial; check=success;\nYou gather your gear.");
H.assert(mg.t === "You attempt to take 2 red healing tonic, the iron dagger and the rope and stow them away.", "multi-grab: one attempt stub");
H.assert(INV_count("red healing tonic") === 2 && INV_count("iron dagger") === 1 && INV_count("rope") >= 1, "multi-grab: all segments committed");
H.assert(/\{red healing tonic x2, iron dagger x1, rope x1 added to your inventory\.\}/.test(mg.out), "multi-grab: one combined receipt");
H.turn(61, "do"); H.resetCaches();
mg = play(61, "/take 60 ducks; crown", "skill=perception; difficulty=impossible; check=fail;\nThere are no ducks here.");
H.assert(INV_count("ducks") === 0 && INV_count("crown") === 0, "multi-grab: fail ruling rolls back the WHOLE grab (duck heist regression)");
H.assert(/\{You failed to get 60 ducks and the crown\.\}/.test(mg.out) && !/added to your inventory/.test(mg.out), "multi-grab: rollback lists the grab, no lying receipt");

// --- v0.1.5: /swap — ledger reclassification, never judged --------------------------
H.turn(70, "do"); H.resetCaches();
play(70, "/take 60 coins", "skill=none; difficulty=trivial; check=success;\nYou scoop the coins.");
H.assert(INV_count("coins") === 60 && INV_walletGet("coins") === 0, "coins taken as ITEMS (the misfile)");
H.turn(71, "do"); H.resetCaches();
let sw = play(71, "/swap coins", "should never be judged");
H.assert(INV_count("coins") === 0 && INV_walletGet("coins") === 60, "bare /swap moves ALL to the wallet");
H.assert(/\{coins x60 moved to your wallet\.\}/.test(sw.out), "swap receipt echoed");
H.assert(state.vars.GK.commandTurn === 71, "/swap is bookkeeping — the Check yields");
H.turn(72, "do"); H.resetCaches();
play(72, "/swap 10 coins", "meta");
H.assert(INV_count("coins") === 10 && INV_walletGet("coins") === 50, "partial swap back to items (auto-direction)");
H.turn(73, "do"); H.resetCaches();
play(73, "/undo", "meta");
H.assert(INV_count("coins") === 0 && INV_walletGet("coins") === 60, "one /undo reverses BOTH sides (composite op)");
H.turn(74, "do"); H.resetCaches();
sw = play(74, "/swap moonbeams", "meta");
H.assert(/\{You don't have that to swap/.test(sw.out), "unknown name reported, never thrown");

H.summary("InventoryKit");
