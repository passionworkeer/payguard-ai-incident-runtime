// 生成内置合成监控截图 public/mock/merchant-monitor.png（仅含合成演示数据）。
// 用法：node scripts/generate-monitor-png.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const width = 880;
const height = 560;

const colors = {
  bg: [11, 18, 32],
  panel: [15, 27, 42],
  border: [35, 51, 71],
  grid: [28, 41, 59],
  text: [226, 232, 240],
  textSecondary: [148, 163, 184],
  textMuted: [100, 116, 139],
  cyan: [49, 200, 223],
  green: [52, 211, 153],
  red: [248, 113, 113],
  amber: [251, 191, 36],
};

// 5x7 点阵字体，每个字形 7 行、每行 5 列。
const font = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '#....', '###..', '....#', '....#', '####.'],
  '6': ['..##.', '.#...', '#....', '###..', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  E: ['#####', '#....', '#....', '###..', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '###..', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '%': ['##..#', '##..#', '...#.', '..##.', '.##..', '#..##', '#..##'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
};

const canvas = new Uint8Array(width * height * 3);

function setPixel(x, y, [r, g, b]) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 3;
  canvas[i] = r;
  canvas[i + 1] = g;
  canvas[i + 2] = b;
}

function fillRect(x, y, w, h, color) {
  for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) setPixel(col, row, color);
}

function strokeRect(x, y, w, h, color) {
  for (let col = x; col < x + w; col++) {
    setPixel(col, y, color);
    setPixel(col, y + h - 1, color);
  }
  for (let row = y; row < y + h; row++) {
    setPixel(x, row, color);
    setPixel(x + w - 1, row, color);
  }
}

function drawLine(x0, y0, x1, y1, color, thickness = 2) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    fillRect(x, y, thickness, thickness, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function drawText(text, x, y, color, scale = 1) {
  let cursor = x;
  for (const ch of text.toUpperCase()) {
    const glyph = font[ch] ?? font[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === '#') fillRect(cursor + col * scale, y + row * scale, scale, scale, color);
      }
    }
    cursor += 6 * scale;
  }
  return cursor;
}

function textWidth(text, scale = 1) {
  return text.length * 6 * scale - scale;
}

function drawPanel(x, y, w, h, title) {
  fillRect(x, y, w, h, colors.panel);
  strokeRect(x, y, w, h, colors.border);
  drawText(title, x + 12, y + 11, colors.textSecondary, 2);
}

function yFor(value, min, max, top, bottom) {
  const ratio = (value - min) / (max - min);
  return Math.round(bottom - ratio * (bottom - top));
}

// 画布底色
fillRect(0, 0, width, height, colors.bg);

// 页头
drawText('PAYGUARD SYNTHETIC MONITORING SNAPSHOT', 24, 16, colors.text, 2);
drawText('WINDOW 10:00-10:15 UTC', width - 24 - textWidth('WINDOW 10:00-10:15 UTC', 2), 16, colors.cyan, 2);
drawText('PAYMENT GATEWAY INCIDENT VIEW - SYNTHETIC DEMO DATA', 24, 40, colors.textMuted, 1);

// 面板 A：支付成功率（下降趋势）
const ax = 24;
const ay = 62;
const aw = 500;
const ah = 214;
drawPanel(ax, ay, aw, ah, 'PAYMENT SUCCESS RATE %');
const plotAx = ax + 52;
const plotAw = aw - 70;
const plotAt = ay + 44;
const plotAb = ay + ah - 26;
const rateSeries = [98.3, 98.1, 98.4, 98.0, 97.6, 97.1, 96.2, 94.0, 90.5, 85.2, 80.1, 76.0, 73.2, 71.9, 71.4];
for (let tick = 60; tick <= 100; tick += 10) {
  const gy = yFor(tick, 60, 100, plotAt, plotAb);
  drawLine(plotAx, gy, plotAx + plotAw, gy, colors.grid, 1);
  drawText(String(tick), ax + 14, gy - 3, colors.textMuted, 1);
}
rateSeries.forEach((value, index) => {
  const px = plotAx + Math.round((index / (rateSeries.length - 1)) * plotAw);
  const py = yFor(value, 60, 100, plotAt, plotAb);
  if (index > 0) {
    const prev = rateSeries[index - 1];
    drawLine(
      plotAx + Math.round(((index - 1) / (rateSeries.length - 1)) * plotAw),
      yFor(prev, 60, 100, plotAt, plotAb),
      px,
      py,
      colors.green,
    );
  }
});
drawText('71.4', plotAx + plotAw + 6, yFor(71.4, 60, 100, plotAt, plotAb) - 3, colors.green, 2);
drawText('10:00', plotAx, plotAb + 10, colors.textMuted, 1);
drawText('10:15', plotAx + plotAw - textWidth('10:15', 1), plotAb + 10, colors.textMuted, 1);

// 面板 B：P95 延迟（上升趋势）
const bx = 24;
const by = 292;
const bw = 500;
const bh = 214;
drawPanel(bx, by, bw, bh, 'P95 LATENCY (MS)');
const plotBx = bx + 52;
const plotBw = bw - 70;
const plotBt = by + 44;
const plotBb = by + bh - 26;
const latencySeries = [312, 318, 322, 331, 348, 380, 445, 560, 780, 1150, 1750, 2600, 3550, 4300, 4800];
for (let tick = 0; tick <= 5; tick++) {
  const gy = yFor(tick * 1000, 0, 5000, plotBt, plotBb);
  drawLine(plotBx, gy, plotBx + plotBw, gy, colors.grid, 1);
  const label = tick === 0 ? '0' : `${tick}K`;
  drawText(label, bx + 14, gy - 3, colors.textMuted, 1);
}
latencySeries.forEach((value, index) => {
  const px = plotBx + Math.round((index / (latencySeries.length - 1)) * plotBw);
  const py = yFor(value, 0, 5000, plotBt, plotBb);
  if (index > 0) {
    const prev = latencySeries[index - 1];
    drawLine(
      plotBx + Math.round(((index - 1) / (latencySeries.length - 1)) * plotBw),
      yFor(prev, 0, 5000, plotBt, plotBb),
      px,
      py,
      colors.red,
    );
  }
});
drawText('4800', plotBx + plotBw + 6, yFor(4800, 0, 5000, plotBt, plotBb) - 3, colors.red, 2);
drawText('10:00', plotBx, plotBb + 10, colors.textMuted, 1);
drawText('10:15', plotBx + plotBw - textWidth('10:15', 1), plotBb + 10, colors.textMuted, 1);

// 面板 C：Top 错误码计数
const cx = 548;
const cy = 62;
const cw = 308;
const chh = 444;
drawPanel(cx, cy, cw, chh, 'TOP ERROR CODES');
const errors = [
  { label: '504 TIMEOUT', count: 3121 },
  { label: '502 BAD GATEWAY', count: 842 },
  { label: '500 SERVER ERROR', count: 317 },
];
const barMaxW = cw - 140;
const barRowTop = cy + 56;
const barH = 34;
errors.forEach((item, index) => {
  const rowY = barRowTop + index * 96;
  drawText(item.label, cx + 16, rowY, colors.text, 1);
  const barW = Math.max(8, Math.round((item.count / errors[0].count) * barMaxW));
  fillRect(cx + 16, rowY + 16, barW, barH, index === 0 ? colors.red : colors.amber);
  drawText(String(item.count), cx + 16 + barW + 10, rowY + 26, index === 0 ? colors.red : colors.amber, 2);
});
drawText('TIME WINDOW 15 MIN', cx + 16, cy + chh - 34, colors.textMuted, 1);

// 页脚
drawText('MERCHANT M-88231 / GATEWAY GW-EAST-1 / SYNTHETIC DEMO DATA - NOT REAL TRANSACTIONS', 24, height - 28, colors.textMuted, 1);

// ---- PNG 编码（RGB8，无压缩过滤器） ----
const raw = Buffer.alloc((width * 3 + 1) * height);
for (let row = 0; row < height; row++) {
  raw[row * (width * 3 + 1)] = 0;
  Buffer.from(canvas.buffer, row * width * 3, width * 3).copy(raw, row * (width * 3 + 1) + 1);
}

function crc32(bytes) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < bytes.length; n++) {
    c = (crc ^ bytes[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  const crcInput = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  out.writeUInt32BE(crc32(crcInput), 8 + data.length);
  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 2;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../public/mock/merchant-monitor.png');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, png);
console.log(`written ${target} (${png.length} bytes, ${width}x${height})`);
