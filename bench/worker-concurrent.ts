/**
 * bench/worker-concurrent.ts — single-conversion worker
 *
 * Env:
 *   TOOL        "zenpix" | "sharp"
 *   INPUT_PATH  path to pre-resized input PNG
 *   OUT_W / OUT_H  output dimensions
 *   QUALITY     AVIF quality (default 60)
 *   SPEED       AVIF speed  (default 6)
 *
 * stdout: "elapsed_ms,cpu_user_ms,cpu_sys_ms"
 */

import { readFileSync } from "fs";

const tool = process.env.TOOL as "zenpix" | "sharp";
const inputPath = process.env.INPUT_PATH!;
const outW = parseInt(process.env.OUT_W!);
const outH = parseInt(process.env.OUT_H!);
const quality = parseInt(process.env.QUALITY ?? "60");
const speed = parseInt(process.env.SPEED ?? "6");

const input = readFileSync(inputPath);
const cpuBefore = process.cpuUsage();
const t0 = performance.now();

if (tool === "zenpix") {
  const { decode, resize, encodeAvif } = await import("zenpix");
  const img = decode(input);
  const small = resize(img, { width: outW, height: outH });
  const avif = encodeAvif(small, { quality, speed });
  if (!avif) throw new Error("encodeAvif returned null");
} else {
  const sharp = (await import("sharp")).default;
  await sharp(input).resize(outW, outH).avif({ quality, speed } as any).toBuffer();
}

const elapsedMs = performance.now() - t0;
const cpu = process.cpuUsage(cpuBefore);
// cpuUsage returns microseconds → convert to ms
console.log(`${elapsedMs.toFixed(2)},${(cpu.user / 1000).toFixed(2)},${(cpu.system / 1000).toFixed(2)}`);
