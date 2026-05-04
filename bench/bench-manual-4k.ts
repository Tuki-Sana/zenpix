/**
 * bench/bench-manual-4k.ts — 3840×2160 PNG → 1920×1080 AVIF 手動計測（一点比較）
 *
 * README の「手動計測・一点比較」テーブルを再現・拡張するためのスクリプト。
 * /usr/bin/time で runner を 1 プロセスずつ起動し、CPU user 時間を正確に取得する。
 *
 * 計測条件:
 *   - zenpix speed=10, threads=1（シングルスレッド）
 *   - zenpix speed=6,  threads=1（シングルスレッド）
 *   - zenpix speed=6,  threads=AVIF_THREADS（マルチスレッド）
 *   - Sharp quality=60（libvips が自動でスレッドを使用）
 *
 * 計測値:
 *   - wall-clock : runner 内の performance.now() 差分の中央値
 *   - CPU user   : /usr/bin/time が報告する user 時間の中央値
 *                  libvips ワーカースレッド含む（POSIX RUSAGE_SELF）
 *   - ファイルサイズ: 最終イテレーションの AVIF バイト数
 *
 * Env:
 *   AVIF_THREADS      zenpix マルチスレッド行のスレッド数（デフォルト: os.cpus().length）
 *   BENCH_FIXTURE     fixtures/ 内のファイル名（デフォルト: bench_chara_chika.png）
 *   BENCH_WARMUP_N    ウォームアップ回数（デフォルト: 3）
 *   BENCH_MEASURE_N   計測回数（デフォルト: 7）
 *   BENCH_QUALITY     AVIF quality（デフォルト: 60）
 *
 * Run:
 *   npm run build
 *   npm run bench:manual-4k
 *   AVIF_THREADS=4 BENCH_FIXTURE=bench_landscape_dark.png npm run bench:manual-4k
 */

import { cpus } from "os";
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "../test/fixtures");
const OUT_DIR = join(__dirname, "results");
const RUNNER = join(__dirname, "bench-manual-4k-runner.mjs");

const FIXTURE_FILE = process.env.BENCH_FIXTURE ?? "bench_chara_chika.png";
const AVIF_THREADS = Math.max(1, parseInt(process.env.AVIF_THREADS ?? String(cpus().length), 10));
const WARMUP_N = Math.max(0, parseInt(process.env.BENCH_WARMUP_N ?? "3", 10));
const MEASURE_N = Math.max(1, parseInt(process.env.BENCH_MEASURE_N ?? "7", 10));
const AVIF_QUALITY = parseInt(process.env.BENCH_QUALITY ?? "60", 10);

const IN_W = 3840;
const IN_H = 2160;
const OUT_W = 1920;
const OUT_H = 1080;

mkdirSync(OUT_DIR, { recursive: true });

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function fmtS(ms: number): string {
  return (ms / 1000).toFixed(3) + "s";
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

// /usr/bin/time の stderr から user 秒数をパース
// 形式: "        1.14 real         9.27 user         0.12 sys"
function parseUserSecs(stderr: string): number {
  const m = stderr.match(/([\d.]+)\s+user/);
  if (!m) throw new Error(`Cannot parse /usr/bin/time output:\n${stderr}`);
  return parseFloat(m[1]);
}


interface Condition {
  label: string;
  tool: "zenpix" | "sharp";
  speed?: number;
  threads?: number;
}

interface IterResult {
  wallMs: number;
  userSecs: number;
  bytes: number;
}

interface CondResult {
  label: string;
  wallMedianMs: number;
  userMedianSecs: number;
  fileBytes: number;
  rawWallMs: number[];
  rawUserSecs: number[];
}

// ── 入力 PNG 生成 ─────────────────────────────────────────────────────────────

const fixturePath = join(FIXTURES_DIR, FIXTURE_FILE);
const tmpInput = join(tmpdir(), `zenpix-bench-4k-${Date.now()}.png`);

console.log(`Fixture : ${FIXTURE_FILE}`);
console.log(`Input   : ${IN_W}×${IN_H}  →  Output: ${OUT_W}×${OUT_H}`);
console.log(`Quality : ${AVIF_QUALITY}`);
console.log(`Warm-up : ${WARMUP_N} / Measure: ${MEASURE_N}`);
console.log(`Threads : ${AVIF_THREADS} (zenpix multi row)\n`);

process.stdout.write(`Preparing ${IN_W}×${IN_H} PNG from fixture... `);
const fixtureRaw = readFileSync(fixturePath);
const inputPng: Buffer = await sharp(fixtureRaw)
  .resize(IN_W, IN_H, { fit: "cover", position: "centre" })
  .png()
  .toBuffer();
writeFileSync(tmpInput, inputPng);
console.log(`done (${fmtSize(inputPng.length)}, saved to ${tmpInput})\n`);

// ── 1 イテレーション計測 ──────────────────────────────────────────────────────

function runOnce(cond: Condition): IterResult {
  const runnerArgs = [
    RUNNER,
    "--tool", cond.tool,
    "--input", tmpInput,
    "--outW", String(OUT_W),
    "--outH", String(OUT_H),
    "--quality", String(AVIF_QUALITY),
  ];
  if (cond.tool === "zenpix") {
    runnerArgs.push("--speed", String(cond.speed ?? 6));
    runnerArgs.push("--threads", String(cond.threads ?? 1));
  }

  const result = spawnSync("/usr/bin/time", ["node", ...runnerArgs], {
    encoding: "utf8",
    cwd: join(__dirname, ".."),
  });

  if (result.status !== 0) {
    throw new Error(`Runner failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  }

  const { wallMs, bytes } = JSON.parse(result.stdout.trim());
  const userSecs = parseUserSecs(result.stderr);

  return { wallMs, userSecs, bytes };
}

// ── 全条件を計測 ──────────────────────────────────────────────────────────────

const CONDITIONS: Condition[] = [
  { label: "zenpix speed=10（シングルスレッド）",            tool: "zenpix", speed: 10, threads: 1 },
  { label: "zenpix speed=6（シングルスレッド）",             tool: "zenpix", speed: 6,  threads: 1 },
  { label: `zenpix speed=6（マルチスレッド threads=${AVIF_THREADS}）`, tool: "zenpix", speed: 6, threads: AVIF_THREADS },
  { label: "Sharp quality=60（libvips 自動スレッド）",       tool: "sharp" },
];

console.log("Measuring...");

const results: CondResult[] = [];

for (const cond of CONDITIONS) {
  process.stdout.write(`  ${cond.label}\n`);
  const wallMs: number[] = [];
  const userSecs: number[] = [];
  let fileBytes = 0;

  for (let i = 0; i < WARMUP_N + MEASURE_N; i++) {
    const r = runOnce(cond);
    const phase = i < WARMUP_N ? "warm" : "meas";
    process.stdout.write(`    [${phase} ${i + 1}] wall=${fmtS(r.wallMs)} user=${r.userSecs.toFixed(3)}s\n`);
    if (i >= WARMUP_N) {
      wallMs.push(r.wallMs);
      userSecs.push(r.userSecs);
      fileBytes = r.bytes;
    }
  }

  results.push({
    label: cond.label,
    wallMedianMs: median(wallMs),
    userMedianSecs: median(userSecs),
    fileBytes,
    rawWallMs: wallMs,
    rawUserSecs: userSecs,
  });
  console.log();
}

// ── クリーンアップ ────────────────────────────────────────────────────────────

unlinkSync(tmpInput);

// ── テーブル出力 ─────────────────────────────────────────────────────────────

console.log(`## 3840×2160 PNG → 1920×1080 AVIF（手動計測・一点比較）`);
console.log(`fixture: ${FIXTURE_FILE} / quality=${AVIF_QUALITY} / warm-up ${WARMUP_N} / measure ${MEASURE_N}\n`);

console.log(`| ツール | wall-clock（中央値）| CPU user | ファイルサイズ |`);
console.log(`|--------|--------------------:|:--------:|---------------:|`);

for (const r of results) {
  const wall = fmtS(r.wallMedianMs);
  const user = r.userMedianSecs.toFixed(3) + "s";
  const size = fmtSize(r.fileBytes);
  console.log(`| ${r.label} | ${wall} | ${user} | ${size} |`);
}

// ── JSON 保存 ────────────────────────────────────────────────────────────────

const sharpMeta = sharp.versions;

const jsonOut = {
  date: new Date().toISOString(),
  runner: `${process.platform}-${process.arch} (local)`,
  fixture: FIXTURE_FILE,
  input_px: `${IN_W}×${IN_H}`,
  output_px: `${OUT_W}×${OUT_H}`,
  avif_quality: AVIF_QUALITY,
  avif_threads_multi: AVIF_THREADS,
  iterations: { warmup: WARMUP_N, measure: MEASURE_N },
  timing_method: "/usr/bin/time per subprocess (POSIX RUSAGE_SELF, includes worker threads)",
  sharp_versions: sharpMeta,
  results: results.map((r) => ({
    label: r.label,
    wall_median_ms: parseFloat(r.wallMedianMs.toFixed(2)),
    wall_all_ms: r.rawWallMs.map((v) => parseFloat(v.toFixed(2))),
    cpu_user_median_s: parseFloat(r.userMedianSecs.toFixed(3)),
    cpu_user_all_s: r.rawUserSecs,
    file_bytes: r.fileBytes,
  })),
};

const jsonPath = join(OUT_DIR, "benchmark-manual-4k.json");
writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2) + "\n");
console.log(`\nJSON: ${jsonPath}`);
