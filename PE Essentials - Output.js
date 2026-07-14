const modifier = (text) => {
  
  text = GK_onOutput(text);
  text = INV_onOutput(text);
  text = GK_onOutputDebug(text);

  return { text }
}

// Don't modify this part
modifier(text)