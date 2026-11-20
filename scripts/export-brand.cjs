const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { chromium } = require("playwright");
(async () => {
  const root = path.resolve("public/brand"),
    source = fs.readFileSync(path.join(root, "logo.svg"));
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const mark = await page.evaluate((text) => {
      const svg = new DOMParser().parseFromString(
        text,
        "image/svg+xml",
      ).documentElement;
      if (svg.querySelector("script,foreignObject,image"))
        throw Error("Brand source must be self-contained paths.");
      document.body.appendChild(document.importNode(svg, true));
      const element = document.body.lastElementChild;
      const b = element.getBBox(),
        side = Math.max(b.width, b.height) / 0.92;
      const box = [
        b.x + b.width / 2 - side / 2,
        b.y + b.height / 2 - side / 2,
        side,
        side,
      ];
      element.setAttribute("viewBox", box.join(" "));
      element.setAttribute("width", "1000");
      element.setAttribute("height", "1000");
      const output = element.outerHTML;
      element.remove();
      return { svg: output, viewBox: box };
    }, source.toString());
    fs.writeFileSync(path.join(root, "mark.svg"), mark.svg + "\n");
    const sizes = [16, 20, 24, 32, 48, 64, 128, 256, 512];
    for (const size of sizes) {
      const data = await page.evaluate(
        async ({ svg, size }) => {
          const image = new Image();
          image.src = "data:image/svg+xml;base64," + svg;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(image, 0, 0, size, size);
          return canvas.toDataURL("image/png").split(",")[1];
        },
        { svg: Buffer.from(mark.svg).toString("base64"), size },
      );
      fs.writeFileSync(
        path.join(root, `logo-${size}.png`),
        Buffer.from(data, "base64"),
      );
    }
    const frames = [16, 24, 32, 48, 64, 128, 256].map((size) => ({
      size,
      data: fs.readFileSync(path.join(root, `logo-${size}.png`)),
    }));
    const header = Buffer.alloc(6 + frames.length * 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(frames.length, 4);
    let offset = header.length;
    frames.forEach(({ size, data }, i) => {
      const p = 6 + i * 16;
      header[p] = header[p + 1] = size === 256 ? 0 : size;
      header.writeUInt16LE(1, p + 4);
      header.writeUInt16LE(32, p + 6);
      header.writeUInt32LE(data.length, p + 8);
      header.writeUInt32LE(offset, p + 12);
      offset += data.length;
    });
    fs.writeFileSync(
      path.join(root, "app.ico"),
      Buffer.concat([header, ...frames.map((f) => f.data)]),
    );
    fs.writeFileSync(
      path.join(root, "manifest.json"),
      JSON.stringify(
        {
          source: "logo.svg",
          sourceSha256: crypto
            .createHash("sha256")
            .update(source)
            .digest("hex"),
          viewBox: [0, 0, 1000, 1000],
          iconViewBox: mark.viewBox,
          colors: ["#29256B", "#12C9BD"],
          sizes,
          icoFrames: frames.map((f) => f.size),
          padding: 0.04,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "Official source retained; transparent margins cropped for mark/icons; paths/colors unchanged.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
