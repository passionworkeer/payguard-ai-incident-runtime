// 生成内置合成监控截图 public/mock/<variant>.png（仅含合成演示数据）。
// 一次跑 4 个变体：gateway / false-alarm / merchant-cert / channel-rebound。
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

// 5x7 点阵字体，每个字形 7 行、每行 5 列。缺的字符会静默变空格，需要时补 glyph。
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
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '..#..'],
};

function renderVariant(spec) {
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
  drawText(spec.header, 24, 16, colors.text, 2);
  drawText(spec.window, width - 24 - textWidth(spec.window, 2), 16, colors.cyan, 2);
  drawText(spec.subheader, 24, 40, colors.textMuted, 1);

  // 面板 A：支付成功率（变体驱动）
  const ax = 24;
  const ay = 62;
  const aw = 500;
  const ah = 214;
  drawPanel(ax, ay, aw, ah, spec.panelA.title);
  const plotAx = ax + 52;
  const plotAw = aw - 70;
  const plotAt = ay + 44;
  const plotAb = ay + ah - 26;
  const rateSeries = spec.panelA.series;
  for (let tick = spec.panelA.tickMin; tick <= spec.panelA.tickMax; tick += spec.panelA.tickStep) {
    const gy = yFor(tick, spec.panelA.tickMin, spec.panelA.tickMax, plotAt, plotAb);
    drawLine(plotAx, gy, plotAx + plotAw, gy, colors.grid, 1);
    drawText(String(tick), ax + 14, gy - 3, colors.textMuted, 1);
  }
  rateSeries.forEach((value, index) => {
    const px = plotAx + Math.round((index / (rateSeries.length - 1)) * plotAw);
    const py = yFor(value, spec.panelA.tickMin, spec.panelA.tickMax, plotAt, plotAb);
    if (index > 0) {
      const prev = rateSeries[index - 1];
      drawLine(
        plotAx + Math.round(((index - 1) / (rateSeries.length - 1)) * plotAw),
        yFor(prev, spec.panelA.tickMin, spec.panelA.tickMax, plotAt, plotAb),
        px,
        py,
        spec.panelA.lineColor,
      );
    }
  });
  drawText(spec.panelA.endLabel, plotAx + plotAw + 6, yFor(rateSeries[rateSeries.length - 1], spec.panelA.tickMin, spec.panelA.tickMax, plotAt, plotAb) - 3, spec.panelA.lineColor, 2);
  drawText(spec.panelA.tStart, plotAx, plotAb + 10, colors.textMuted, 1);
  drawText(spec.panelA.tEnd, plotAx + plotAw - textWidth(spec.panelA.tEnd, 1), plotAb + 10, colors.textMuted, 1);
  // 顶部 badge（仅部分变体需要：误报场景强调"流量高峰但健康"）
  if (spec.badge) {
    const badgeW = textWidth(spec.badge, 1) + 18;
    fillRect(plotAx, plotAt - 18, badgeW, 16, colors.panel);
    strokeRect(plotAx, plotAt - 18, badgeW, 16, spec.badgeColor ?? colors.cyan);
    drawText(spec.badge, plotAx + 6, plotAt - 15, spec.badgeColor ?? colors.cyan, 1);
  }

  // 面板 B：P95 延迟
  const bx = 24;
  const by = 292;
  const bw = 500;
  const bh = 214;
  drawPanel(bx, by, bw, bh, spec.panelB.title);
  const plotBx = bx + 52;
  const plotBw = bw - 70;
  const plotBt = by + 44;
  const plotBb = by + bh - 26;
  const latencySeries = spec.panelB.series;
  for (let tick = spec.panelB.tickMin; tick <= spec.panelB.tickMax; tick += spec.panelB.tickStep) {
    const gy = yFor(tick, spec.panelB.tickMin, spec.panelB.tickMax, plotBt, plotBb);
    drawLine(plotBx, gy, plotBx + plotBw, gy, colors.grid, 1);
    drawText(spec.panelB.tickLabel(tick), bx + 14, gy - 3, colors.textMuted, 1);
  }
  latencySeries.forEach((value, index) => {
    const px = plotBx + Math.round((index / (latencySeries.length - 1)) * plotBw);
    const py = yFor(value, spec.panelB.tickMin, spec.panelB.tickMax, plotBt, plotBb);
    if (index > 0) {
      const prev = latencySeries[index - 1];
      drawLine(
        plotBx + Math.round(((index - 1) / (latencySeries.length - 1)) * plotBw),
        yFor(prev, spec.panelB.tickMin, spec.panelB.tickMax, plotBt, plotBb),
        px,
        py,
        spec.panelB.lineColor,
      );
    }
  });
  drawText(spec.panelB.endLabel, plotBx + plotBw + 6, yFor(latencySeries[latencySeries.length - 1], spec.panelB.tickMin, spec.panelB.tickMax, plotBt, plotBb) - 3, spec.panelB.lineColor, 2);
  drawText(spec.panelB.tStart, plotBx, plotBb + 10, colors.textMuted, 1);
  drawText(spec.panelB.tEnd, plotBx + plotBw - textWidth(spec.panelB.tEnd, 1), plotBb + 10, colors.textMuted, 1);

  // 面板 C：Top 错误码 / 异常类型
  const cx = 548;
  const cy = 62;
  const cw = 308;
  const chh = 444;
  drawPanel(cx, cy, cw, chh, spec.panelC.title);
  const errors = spec.panelC.rows;
  const barMaxW = cw - 140;
  const barRowTop = cy + 56;
  const barH = 34;
  errors.forEach((item, index) => {
    const rowY = barRowTop + index * 96;
    drawText(item.label, cx + 16, rowY, colors.text, 1);
    const barW = Math.max(8, Math.round((item.count / errors[0].count) * barMaxW));
    fillRect(cx + 16, rowY + 16, barW, barH, item.color ?? colors.red);
    drawText(String(item.count), cx + 16 + barW + 10, rowY + 26, item.color ?? colors.red, 2);
  });
  drawText(spec.panelC.footer, cx + 16, cy + chh - 34, colors.textMuted, 1);

  // 页脚
  drawText(spec.footer, 24, height - 28, colors.textMuted, 1);

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

  return png;
}

// ---- 四个变体 ----

// gateway 变体：保留与原 merchant-monitor.png 逐像素一致的数值与坐标（黄金路径参照点）。
const gateway = {
  header: 'PAYGUARD SYNTHETIC MONITORING SNAPSHOT',
  window: 'WINDOW 10:00-10:15 UTC',
  subheader: 'PAYMENT GATEWAY INCIDENT VIEW - SYNTHETIC DEMO DATA',
  footer: 'MERCHANT M-88231 / GATEWAY GW-EAST-1 / SYNTHETIC DEMO DATA - NOT REAL TRANSACTIONS',
  panelA: {
    title: 'PAYMENT SUCCESS RATE %',
    series: [98.3, 98.1, 98.4, 98.0, 97.6, 97.1, 96.2, 94.0, 90.5, 85.2, 80.1, 76.0, 73.2, 71.9, 71.4],
    tickMin: 60, tickMax: 100, tickStep: 10,
    lineColor: colors.green,
    endLabel: '71.4',
    tStart: '10:00', tEnd: '10:15',
  },
  panelB: {
    title: 'P95 LATENCY (MS)',
    series: [312, 318, 322, 331, 348, 380, 445, 560, 780, 1150, 1750, 2600, 3550, 4300, 4800],
    tickMin: 0, tickMax: 5000, tickStep: 1000,
    tickLabel: (tick) => (tick === 0 ? '0' : `${tick / 1000}K`),
    lineColor: colors.red,
    endLabel: '4800',
    tStart: '10:00', tEnd: '10:15',
  },
  panelC: {
    title: 'TOP ERROR CODES',
    rows: [
      { label: '504 TIMEOUT', count: 3121 },
      { label: '502 BAD GATEWAY', count: 842 },
      { label: '500 SERVER ERROR', count: 317 },
    ],
    footer: 'TIME WINDOW 15 MIN',
  },
};

// false-alarm：成功率健康（青色线强调"未发生故障"），badge 主动声明。
const falseAlarm = {
  header: 'PAYGUARD TRAFFIC ANOMALY VIEW',
  window: 'WINDOW 13:20-13:35 UTC',
  subheader: 'PROMOTION TRAFFIC SPIKE - SUCCESS RATE STABLE',
  footer: 'MERCHANT M-77214 / PROMO 818 FESTIVAL / SYNTHETIC DEMO DATA - NOT REAL TRANSACTIONS',
  badge: 'TRAFFIC SPIKE 4.1X - SUCCESS RATE HEALTHY',
  badgeColor: colors.cyan,
  panelA: {
    title: 'PAYMENT SUCCESS RATE %',
    series: [99.62, 99.6, 99.55, 99.58, 99.61, 99.5, 99.49, 99.55, 99.48, 99.52, 99.5, 99.55, 99.49, 99.5, 99.48],
    tickMin: 95, tickMax: 100, tickStep: 1,
    lineColor: colors.cyan,
    endLabel: '99.48',
    tStart: '13:20', tEnd: '13:35',
  },
  panelB: {
    title: 'QPS (TRANSACTIONS/S)',
    series: [620, 700, 880, 1240, 1820, 2300, 2680, 2540, 2720, 2640, 2780, 2720, 2840, 2780, 2820],
    tickMin: 0, tickMax: 3000, tickStep: 500,
    tickLabel: (tick) => (tick === 0 ? '0' : `${tick / 1000}K`),
    lineColor: colors.cyan,
    endLabel: '2820',
    tStart: '13:20', tEnd: '13:35',
  },
  panelC: {
    title: 'THROTTLE + ERROR MIX',
    rows: [
      { label: 'THROTTLE 0.42%', count: 1842, color: colors.amber },
      { label: 'BUSINESS DECLINE', count: 612, color: colors.textSecondary },
      { label: '5XX ERROR 0.08%', count: 318, color: colors.green },
    ],
    footer: 'WINDOW 15 MIN - RATE WITHIN BASELINE',
  },
};

// merchant-cert：成功率断崖 + 延迟平稳（关键决策因子）+ SIGN VERIFY FAILED 主导。
const merchantCert = {
  header: 'PAYGUARD SIGNATURE ERROR VIEW',
  window: 'WINDOW 14:08-14:23 UTC',
  subheader: 'CLOUD-FIR MERCHANT - SIGNATURE VERIFY SPIKE',
  footer: 'MERCHANT M-60238 / SIGN VERIFY FAILURE 61.2X / SYNTHETIC DEMO DATA',
  panelA: {
    title: 'PAYMENT SUCCESS RATE %',
    series: [99.7, 99.6, 99.4, 99.1, 98.4, 96.8, 94.1, 91.2, 89.4, 88.6, 88.2, 88.3, 88.5, 88.2, 88.4],
    tickMin: 80, tickMax: 100, tickStep: 5,
    lineColor: colors.red,
    endLabel: '88.4',
    tStart: '14:08', tEnd: '14:23',
  },
  panelB: {
    title: 'P95 LATENCY (MS)',
    series: [218, 224, 219, 226, 220, 222, 224, 218, 226, 222, 220, 224, 222, 218, 220],
    tickMin: 0, tickMax: 600, tickStep: 100,
    tickLabel: (tick) => String(tick),
    lineColor: colors.green,
    endLabel: '220',
    tStart: '14:08', tEnd: '14:23',
  },
  panelC: {
    title: 'TOP ERROR CODES',
    rows: [
      { label: 'SIGN VERIFY FAILED', count: 3842 },
      { label: 'INVALID PAYLOAD', count: 84, color: colors.amber },
      { label: '504 TIMEOUT', count: 32, color: colors.textSecondary },
    ],
    footer: '96.4% OF FAILURES ARE SIGN VERIFY',
  },
};

// channel-rebound：成功率下跌 + 关键窗口回升再回弹（可视化恢复判断为什么不直接放行）。
const channelRebound = {
  header: 'PAYGUARD CHANNEL HEALTH VIEW',
  window: 'WINDOW 13:46-14:18 UTC',
  subheader: 'ICBC CHANNEL DEGRADATION - REBOUND DETECTED',
  footer: 'MERCHANT M-91327 / CHANNEL ICBC / SYNTHETIC DEMO DATA',
  badge: 'RECOVERED IN WIN 1 - REBOUND TO 81.4% IN WIN 2',
  badgeColor: colors.amber,
  panelA: {
    title: 'PAYMENT SUCCESS RATE %',
    series: [99.4, 98.2, 94.6, 86.1, 72.4, 62.1, 78.6, 81.4, 68.2, 62.8, 66.4, 72.1, 84.6, 92.4, 95.8],
    tickMin: 50, tickMax: 100, tickStep: 10,
    lineColor: colors.red,
    endLabel: '95.8',
    tStart: '13:46', tEnd: '14:18',
  },
  panelB: {
    title: 'ICBC CHANNEL ERROR %',
    series: [0.6, 1.8, 5.4, 13.9, 27.6, 37.9, 21.4, 18.6, 31.8, 37.2, 33.6, 27.9, 15.4, 7.6, 4.2],
    tickMin: 0, tickMax: 40, tickStep: 10,
    tickLabel: (tick) => String(tick),
    lineColor: colors.red,
    endLabel: '4.2',
    tStart: '13:46', tEnd: '14:18',
  },
  panelC: {
    title: 'CHANNEL BREAKDOWN %',
    rows: [
      { label: 'ICBC 12.4%', count: 4218, color: colors.red },
      { label: 'CMB 99.5%', count: 1842, color: colors.green },
      { label: 'ALIPAY 99.6%', count: 1612, color: colors.green },
    ],
    footer: 'SUCCESS RATE BY CHANNEL - ICBC OUTLIER',
  },
};

const variants = [
  { name: 'merchant-monitor', spec: gateway },
  { name: 'merchant-monitor-false-alarm', spec: falseAlarm },
  { name: 'merchant-monitor-merchant-cert', spec: merchantCert },
  { name: 'merchant-monitor-channel-rebound', spec: channelRebound },
];

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/mock');
mkdirSync(outDir, { recursive: true });
for (const { name, spec } of variants) {
  const png = renderVariant(spec);
  const target = resolve(outDir, `${name}.png`);
  writeFileSync(target, png);
  console.log(`written ${target} (${png.length} bytes, ${width}x${height})`);
}