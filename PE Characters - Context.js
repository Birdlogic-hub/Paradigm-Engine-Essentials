// PE x IS x LC x SlowBurn — Context tab (SB has no context pass)
const modifier = (text) => {
  text = LivingCharacters("context", text);
  globalThis.text = text;
  globalThis.stop = false;
  InnerSelf("context");
  text = globalThis.text;
  text = BK_onContext(text);
  text = GK_onContext(text);
  return { text, stop: globalThis.stop === true }
}
modifier(text)
