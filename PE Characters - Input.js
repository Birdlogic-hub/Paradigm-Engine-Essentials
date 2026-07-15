// PE x IS x LC x SlowBurn — Input tab
InnerSelf("input");
const modifier = (text) => {
  BK_runSlowBurn("input");               // dormant until Evolution Stages card is filled
  text = BK_onInput(text);               // BridgeKit hospitality: seeds SB's starter card
  text = INV_onInput(text);
  text = GK_onInput(text);
  text = LivingCharacters("input", text);
  return { text }
}
modifier(text)
