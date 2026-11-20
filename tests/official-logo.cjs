const { chromium } = require("playwright"),
  fs = require("node:fs"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
(async () => {
  const source = fs.readFileSync("public/brand/logo.svg"),
    manifest = require("../public/brand/manifest.json");
  assert.equal(
    crypto.createHash("sha256").update(source).digest("hex"),
    "6ecb64a39d9cc15049018e1aa5ded72230f19329bc3220ff5fa3bf5cda3356c7",
  );
  assert.equal(
    manifest.sourceSha256,
    crypto.createHash("sha256").update(source).digest("hex"),
  );
  const mark = fs.readFileSync("public/brand/mark.svg", "utf8");
  assert.deepEqual(
    [...mark.matchAll(/<path[^>]*>/g)].map((x) => x[0].replace(/\/>$/, ">")),
    [...source.toString().matchAll(/<path[^>]*>/g)].map((x) =>
      x[0].replace(/\/>$/, ">"),
    ),
  );
  const ico = fs.readFileSync("public/brand/app.ico");
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 7);
  for (let i = 0; i < 7; i++) {
    const p = 6 + i * 16,
      size = ico.readUInt32LE(p + 8),
      offset = ico.readUInt32LE(p + 12);
    assert(offset + size <= ico.length);
    assert.equal(
      ico.subarray(offset, offset + 8).toString("hex"),
      "89504e470d0a1a0a",
    );
    assert.equal(ico.readUInt32BE(offset + 16), manifest.icoFrames[i]);
    assert.equal(ico.readUInt32BE(offset + 20), manifest.icoFrames[i]);
  }
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.goto("http://127.0.0.1:5173");
    await page.getByAltText("Logo oficial cbsHUB", { exact: true }).waitFor();
    for (const theme of ["Clássico", "Moderno Roxo"]) {
      await page
        .getByRole("button", { name: "Configurações do perfil", exact: true })
        .click();
      await page
        .getByRole("tablist", { name: "Seções das configurações" })
        .getByRole("tab", { name: "Aparência", exact: true })
        .click();
      await page.getByRole("button", { name: theme, exact: true }).click();
      await page.keyboard.press("Escape");
      await page.locator('[role="dialog"]').waitFor({ state: "detached" });
      const logo = page.getByAltText("Logo oficial cbsHUB", { exact: true });
      assert.equal(
        await logo.evaluate(
          (img) =>
            img.complete &&
            img.naturalWidth === 1000 &&
            img.naturalHeight === 1000,
        ),
        true,
      );
      const box = await logo.boundingBox();
      assert.equal(box.width, 20);
      assert.equal(box.height, 20);
      assert.equal(
        (await page.locator(".native-titlebar").boundingBox()).height,
        32,
      );
      await page.screenshot({
        path: `/workspace/cbshub-onboarding/official-logo-${theme === "Clássico" ? "classic" : "modern"}.png`,
      });
    }
    for (const size of manifest.sizes) {
      const data = fs
        .readFileSync(`public/brand/logo-${size}.png`)
        .toString("base64");
      const pixels = await page.evaluate(
        async ({ data, size }) => {
          const img = new Image();
          img.src = "data:image/png;base64," + data;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = c.height = size;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0);
          return {
            width: img.width,
            height: img.height,
            alpha: ctx.getImageData(0, 0, 1, 1).data[3],
            ink: [...ctx.getImageData(0, 0, size, size).data].filter(
              (v, i) => i % 4 === 3 && v > 0,
            ).length,
          };
        },
        { data, size },
      );
      assert.equal(pixels.width, size);
      assert.equal(pixels.height, size);
      assert.equal(pixels.alpha, 0);
      assert(pixels.ink > 0);
    }
    console.log(
      "PASS original SVG hash unchanged, transparent PNG sizes, 7-frame ICO, official 20px logo in both themes",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
