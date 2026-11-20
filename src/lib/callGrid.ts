export function callGrid(
  width: number,
  height: number,
  count: number,
  requestedGap = 12,
) {
  width = Math.max(0, width);
  height = Math.max(0, height);
  count = Math.max(1, count);
  const gap = Math.max(
      0,
      Math.min(requestedGap, Math.min(width, height) / (count * 2)),
    ),
    ratio = 16 / 9;
  let best = { columns: 1, rows: count, width: 0, height: 0, area: 0, gap };
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns),
      tileWidth = Math.max(0, (width - gap * (columns - 1)) / columns),
      tileHeight = Math.min(
        tileWidth / ratio,
        Math.max(0, (height - gap * (rows - 1)) / rows),
      );
    const fittedWidth = Math.min(tileWidth, tileHeight * ratio),
      area = fittedWidth * tileHeight;
    if (area > best.area)
      best = {
        columns,
        rows,
        width: fittedWidth,
        height: tileHeight,
        area,
        gap,
      };
  }
  return best;
}
