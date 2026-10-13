// 生成探针用的 PNG（crates/server/src/routes/probe.png）。
// 本地没有图形库，所以手搓一个最小 PNG 编码器（zlib 在 node 标准库里）。
// 只为了一张「一眼能认出来自 Xenica」的测试图，不进构建流程。
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const W = 1200;
const H = 630;

const px = Buffer.alloc(W * H * 3);
const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const fill = (x0, y0, x1, y1, hex) => {
  const [r, g, b] = rgb(hex);
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      const i = (y * W + x) * 3;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
  }
};

// 5x7 点阵字，只为这几个字写死
const FONT = {
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

const text = (s, x0, y0, scale, hex) => {
  const [r, g, b] = rgb(hex);
  let x = x0;
  for (const ch of s) {
    const glyph = FONT[ch];
    if (!glyph) throw new Error(`没有字形：${ch}`);
    glyph.forEach((row, gy) => {
      [...row].forEach((bit, gx) => {
        if (bit !== '1') return;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const X = x + gx * scale + dx;
            const Y = y0 + gy * scale + dy;
            if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
            const i = (Y * W + X) * 3;
            px[i] = r;
            px[i + 1] = g;
            px[i + 2] = b;
          }
        }
      });
    });
    x += 6 * scale;
  }
};

// 底
fill(0, 0, W, H, '#0f1418');
// 顶部色带：一眼看出是图片，而且颜色顺序固定，便于比对
['#e5484d', '#f76b15', '#ffb224', '#46a758', '#0090ff', '#8e4ec6'].forEach((c, i) => {
  fill(Math.round((W / 6) * i), 0, Math.round((W / 6) * (i + 1)), 26, c);
});
// 文字
text('XENICA', 64, 120, 12, '#e8eef2');
text('/API/PROBE', 66, 260, 6, '#9fb0bd');
text('TEST IMAGE', 66, 380, 5, '#5f7381');
// 棋盘格：用于确认渲染没有拉伸/模糊
for (let y = 0; y < 12; y++) {
  for (let x = 0; x < 8; x++) {
    fill(880 + x * 34, 300 + y * 26, 880 + (x + 1) * 34, 300 + (y + 1) * 26, (x + y) % 2 ? '#2b3a45' : '#1a2429');
  }
}
// 边框
fill(0, 0, W, 4, '#9fb0bd');
fill(0, H - 4, W, H, '#9fb0bd');
fill(0, 0, 4, H, '#9fb0bd');
fill(W - 4, 0, W, H, '#9fb0bd');

// --- 最小 PNG 编码 ---
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // 8 位
ihdr[9] = 2; // 真彩色 RGB
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0; // filter: none
  px.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(process.argv[2], png);
console.log(`${process.argv[2]} ${png.length} bytes ${W}x${H}`);
