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

InnerSelf("input");
const modifier = (text) => {

  text = INV_onInput(text);
  text = GK_onInput(text);

  return { text }
}

// Don't modify this part
modifier(text)