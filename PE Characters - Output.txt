// PE x IS x LC x SlowBurn — Output tab
// SB scores the story BEFORE InventoryKit's {} echoes exist (engine text
// must never feed the personality scorer).
const modifier = (text) => {
  text = GK_onOutput(text);
  text = LivingCharacters("output", text);
  globalThis.text = text;
  InnerSelf("output");
  text = globalThis.text;
  BK_runSlowBurn("output", text);        // dormant until Evolution Stages card is filled
  text = INV_onOutput(text);
  text = BK_onOutput(text);              // card-category groom: last word after LC's sync
  text = GK_onOutputDebug(text);
  return { text }
}
modifier(text)
