const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
function wav() {
  const samples = 48000,
    buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(48000, 24);
  buffer.writeUInt32LE(96000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    buffer.writeInt16LE(
      Math.sin((i * 2 * Math.PI * 440) / 48000) * 16000,
      44 + i * 2,
    );
  return buffer;
}
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1"
        ? r.continue()
        : r.abort(),
    );
    await page.goto("http://127.0.0.1:5173");
    await page.getByRole("textbox", { name: /Mensagem para/ }).waitFor();
    await page.evaluate(async () => {
      window.e = (await import("/src/lib/webrtcEngine.ts")).webrtcEngine;
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
    });
    await page.waitForFunction(() => !!e.localPeer);
    await page.evaluate(async () => {
      e.cancelRecovery();
      await e.joinVoiceCall();
      window.capture = e.rawMicStream;
    });
    await page
      .getByRole("button", { name: "Efeitos Sonoros rápidos", exact: true })
      .click();
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await page.getByLabel("Arquivo de áudio", { exact: true }).setInputFiles({
      name: "Meu recorte.wav",
      mimeType: "audio/wav",
      buffer: wav(),
    });
    await page.getByRole("img", { name: "Forma de onda do áudio" }).waitFor();
    await page.getByRole("spinbutton", { name: "Início do corte" }).fill(".2");
    await page.getByRole("spinbutton", { name: "Fim do corte" }).fill(".6");
    await page
      .getByRole("button", { name: "Prévia do corte", exact: true })
      .click();
    await page.locator('audio[aria-label="Prévia local do corte"]').waitFor();
    await page.evaluate(() => {
      window.previewElement = document.querySelector(
        'audio[aria-label="Prévia local do corte"]',
      );
    });
    await page
      .getByRole("button", { name: "Aplicar corte", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Salvar efeito", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(
        () => previewElement.paused && !previewElement.getAttribute("src"),
      ),
      true,
      "closing editor must stop and detach preview source",
    );
    const record = await page.evaluate(async () => {
      const { storageDb } = await import("/src/lib/storageDb.ts");
      const clips = await storageDb.getSoundboardClips();
      const clip = clips.find((c) => c.name === "Meu recorte");
      window.clipId = clip.id;
      const ctx = new AudioContext();
      const b = await ctx.decodeAudioData(await clip.audioBlob.arrayBuffer());
      await ctx.close();
      return {
        duration: b.duration,
        original: clip.originalAudioBlob.size,
        edited: clip.audioBlob.size,
        active: capture.active,
      };
    });
    assert(Math.abs(record.duration - 0.4) < 0.001);
    assert.equal(record.original, wav().length);
    assert(record.edited < record.original && record.active);
    await page.evaluate(async () => {
      const sb = (await import("/src/lib/soundboardEngine.ts"))
        .soundboardEngine;
      const ctx = new AudioContext();
      sb.bufferCache.set(clipId, ctx.createBuffer(1, 10, 48000));
      await ctx.close();
    });
    if (
      !(await page
        .getByRole("button", { name: "Editar Meu recorte", exact: true })
        .isVisible())
    )
      await page
        .getByRole("button", { name: "Efeitos Sonoros rápidos", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Editar Meu recorte", exact: true })
      .click();
    await page.getByRole("spinbutton", { name: "Início do corte" }).waitFor();
    assert.equal(
      await page
        .getByRole("spinbutton", { name: "Início do corte" })
        .inputValue(),
      "0.2",
    );
    assert.equal(
      await page.getByRole("spinbutton", { name: "Fim do corte" }).inputValue(),
      "0.6",
    );
    await page.getByRole("spinbutton", { name: "Início do corte" }).fill("0");
    await page.getByRole("spinbutton", { name: "Fim do corte" }).fill(".2");
    assert.equal(
      await page
        .getByRole("button", { name: "Salvar som", exact: true })
        .isEnabled(),
      false,
    );
    await page
      .getByRole("button", { name: "Aplicar corte", exact: true })
      .click();
    await page.getByRole("button", { name: "Salvar som", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => capture.active), true);
    assert.equal(
      await page.evaluate(
        async () =>
          !(
            await import("/src/lib/soundboardEngine.ts")
          ).soundboardEngine.bufferCache.has(clipId),
      ),
      true,
      "editing must invalidate decoded cache for future playback",
    );
    await page.evaluate(async () => {
      const { decodeEditableAudio, trimWav } = await import(
        "/src/lib/audioTrim.ts"
      );
      let rejected = false;
      try {
        await decodeEditableAudio(
          new Blob(["not audio"], { type: "audio/wav" }),
        );
      } catch {
        rejected = true;
      }
      if (!rejected) throw Error("invalid audio accepted");
      const ctx = new AudioContext();
      const buffer = ctx.createBuffer(2, 48000 * 30, 48000);
      for (const range of [
        [NaN, 1],
        [1, 0],
        [0, 30],
      ]) {
        let invalid = false;
        try {
          trimWav(buffer, ...range);
        } catch {
          invalid = true;
        }
        if (!invalid) throw Error("invalid/oversized trim accepted");
      }
      await ctx.close();
    });
    await page.reload();
    await page.evaluate(async () => {
      const { storageDb } = await import("/src/lib/storageDb.ts");
      const clip = (await storageDb.getSoundboardClips()).find(
        (c) => c.name === "Meu recorte",
      );
      if (!clip.originalAudioBlob || Math.abs(clip.durationSec - 0.2) > 0.001)
        throw Error("trim not persisted");
    });
    console.log(
      "PASS waveform/import/trim/local preview/WAV duration/original preservation/re-edit/persistence; capture stays active while editing.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
