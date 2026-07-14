// WIRING (order IS law — see study, "The contract"):
//   Input tab:    InnerSelf("input");
//                 text = INV_onInput(text);  text = GK_onInput(text);
//   Context tab:  InnerSelf("context");
//                 text = ISC_onContext(text);   // BETWEEN IS and GateKit
//                 text = GK_onContext(text);
//   Output tab:   text = GK_onOutput(text);     // BEFORE InnerSelf — the verdict
//                 InnerSelf("output");          //   must never reach IS's repair
//                 text = INV_onOutput(text);    // AFTER IS — {echoes} are an IS block type
//                 text = GK_onOutputDebug(text);

InnerSelf("context");
const modifier = (text) => {
  
  text = ISC_onContext(text);
  text = GK_onContext(text);
  
  return { text, stop }   // stop MUST propagate — AC's turn-hijack signal (upstream IS convention)
}

// Don't modify this part
modifier(text)