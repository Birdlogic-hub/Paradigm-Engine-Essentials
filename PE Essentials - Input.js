const modifier = (text) => {

  text = INV_onInput(text);
  text = GK_onInput(text);

  return { text }
}

// Don't modify this part
modifier(text)