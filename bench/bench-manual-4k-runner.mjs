/**
 * bench/bench-manual-4k-runner.mjs — 1 イテレーション実行して JSON を stdout へ出力
 *
 * 呼び出し元 (bench-manual-4k.ts) が /usr/bin/time でラップして CPU user を取得する。
 *
 * Args:
 *   --tool    zenpix | sharp
 *   --speed   encoder speed (zenpix のみ使用)
 *   --threads encoder thread count (zenpix のみ使用)
 *   --input   入力 PNG のファイルパス
 *   --outW    出力幅 px (デフォルト 1920)
 *   --outH    出力高 px (デフォルト 1080)
 *   --quality AVIF quality (デフォルト 60)
 *
 * stdout: JSON { wallMs: number, bytes: number }
 */

import { decode, resize, encodeAvif } from "zenpix";
import sharp from "sharp";
import { readFileSync } from "fs";

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) result[argv[i].slice(2)] = argv[i + 1];
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const tool = args.tool ?? "zenpix";
const speed = parseInt(args.speed ?? "6", 10);
const threads = parseInt(args.threads ?? "1", 10);
const outW = parseInt(args.outW ?? "1920", 10);
const outH = parseInt(args.outH ?? "1080", 10);
const quality = parseInt(args.quality ?? "60", 10);
const inputPath = args.input;

if (!inputPath) {
  process.stderr.write("Error: --input is required\n");
  process.exit(1);
}

const input = readFileSync(inputPath);

const t0 = performance.now();
let bytes;

if (tool === "zenpix") {
  const img = decode(input);
  const small = resize(img, { width: outW, height: outH });
  const avif = encodeAvif(small, { quality, speed, threads });
  if (!avif) throw new Error("encodeAvif returned null");
  bytes = avif.length;
} else {
  const buf = await sharp(input)
    .resize(outW, outH)
    .avif({ quality, speed: 6 })
    .toBuffer();
  bytes = buf.length;
}

const wallMs = performance.now() - t0;
process.stdout.write(JSON.stringify({ wallMs, bytes }) + "\n");
