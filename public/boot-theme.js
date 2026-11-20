// Apply only validated color literals before the renderer loads; never evaluate theme code.
(() => {
  let background = "#101116",
    text = "#f5f5f7",
    mode = "dark";
  try {
    const saved = JSON.parse(
      localStorage.getItem("cbshub-studio-v1") || "null",
    );
    if (
      saved?.version === 1 &&
      /^#[0-9a-f]{6}$/i.test(saved.active?.colors?.background) &&
      /^#[0-9a-f]{6}$/i.test(saved.active?.colors?.text) &&
      ["light", "dark"].includes(saved.active?.mode)
    ) {
      background = saved.active.colors.background;
      text = saved.active.colors.text;
      mode = saved.active.mode;
    }
  } catch {}
  document.documentElement.style.setProperty("--background", background);
  document.documentElement.style.backgroundColor = background;
  document.documentElement.style.color = text;
  document.documentElement.style.colorScheme = mode;
})();
