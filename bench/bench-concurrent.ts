/**
 * bench/bench-concurrent.ts — Concurrent AVIF encode: zenpix vs Sharp
 *
 * Simulates N simultaneous image-conversion requests on a low-spec VPS.
 * Spawns N separate bun processes (worker-concurrent.ts), measures:
 *   - total wall-clock (time until all N workers finish)
 *   - sum of CPU user time across workers
 *
 * Usage:
 *   bun bench/bench-concurrent.ts
 *
 * Env (optional):
 *   CONCURRENT_NS      comma-separated N values  (default: "1,2,4,8")
 *   CONCURRENT_FIXTURE fixture id                (default: "bench_chara_chika")
 *   CONCURRENT_RUNS    repetitions per N         (default: "3")
 *   BENCH_SCENARIO     fhd | wqhd | uhd4k        (default: "fhd")
 *
 * Output: bench/results-concurrent/benchmark-concurrent.md
 */

import { spawn } from "child_process";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const WORKER_SCRIPT = join(__dirname, "worker-concurrent.ts");

const FIXTURE_ID = process.env.CONCURRENT_FIXTURE ?? "bench_chara_chika";
const CONCURRENT_NS = (process.env.CONCURRENT_NS ?? "1,2,4,8")
  .split(",").map((s) => parseInt(s.trim(), 10));
const RUNS = parseInt(process.env.CONCURRENT_RUNS ?? "3", 10);
const QUALITY = 60;
const SPEED = 6;

const SCENARIOS = {
  fhd:   { inW: 1920, inH: 1080, outW: 960,  outH: 540  },
  wqhd:  { inW: 2560, inH: 1440, outW: 1280, outH: 720  },
  uhd4k: { inW: 3840, inH: 2160, outW: 1920, outH: 1080 },
} as const;
const scenarioKey = (process.env.BENCH_SCENARIO ?? "fhd") as keyof typeof SCENARIOS;
const scenario = SCENARIOS[scenarioKey];

// ── Prepare input PNG ─────────────────────────────────────────────────────────

const fixturePath = join(PROJECT_ROOT, "test/fixtures", `${FIXTURE_ID}.png`);
console.log(`Fixture: ${FIXTURE_ID}`);
console.log(`Scenario: ${scenarioKey} (${scenario.inW}×${scenario.inH} → ${scenario.outW}×${scenario.outH})`);
console.log(`Preparing input PNG...`);

const tmpDir = mkdtempSync(join(tmpdir(), "zenpix-concurrent-"));
const inputPath = join(tmpDir, "input.png");
const resized = await sharp(readFileSync(fixturePath))
  .resize(scenario.inW, scenario.inH, { fit: "cover" })
  .png()
  .toBuffer();
writeFileSync(inputPath, resized);
console.log(`Input PNG: ${resized.length} bytes\n`);

// ── Worker runner ─────────────────────────────────────────────────────────────

interface WorkerResult {
  elapsedMs: number;
  cpuUserMs: number;
  cpuSysMs: number;
}

function runWorker(tool: "zenpix" | "sharp"): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", [WORKER_SCRIPT], {
      env: {
        ...process.env,
        TOOL: tool,
        INPUT_PATH: inputPath,
        OUT_W: String(scenario.outW),
        OUT_H: String(scenario.outH),
        QUALITY: String(QUALITY),
        SPEED: String(SPEED),
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`worker(${tool}) exited ${code}: ${stderr}`));
      const [elapsed, user, sys] = stdout.trim().split(",").map(parseFloat);
      resolve({ elapsedMs: elapsed, cpuUserMs: user, cpuSysMs: sys });
    });
    child.on("error", reject);
  });
}

interface ConcurrentResult {
  n: number;
  wallMs: number;
  sumCpuUserMs: number;
  workerElapsedMs: number[]; // individual elapsed per worker
}

async function runConcurrent(tool: "zenpix" | "sharp", n: number): Promise<ConcurrentResult> {
  const t0 = performance.now();
  const workers = await Promise.all(Array.from({ length: n }, () => runWorker(tool)));
  const wallMs = performance.now() - t0;
  return {
    n,
    wallMs,
    sumCpuUserMs: workers.reduce((s, w) => s + w.cpuUserMs, 0),
    workerElapsedMs: workers.map((w) => w.elapsedMs),
  };
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

// ── Warm up ───────────────────────────────────────────────────────────────────

console.log("Warming up (N=1)...");
await runConcurrent("zenpix", 1);
await runConcurrent("sharp", 1);
console.log("Done.\n");

// ── Main loop ─────────────────────────────────────────────────────────────────

interface ScenarioRow {
  n: number;
  zenpixWallMs: number;
  sharpWallMs: number;
  zenpixCpuMs: number;
  sharpCpuMs: number;
}

const rows: ScenarioRow[] = [];

for (const n of CONCURRENT_NS) {
  console.log(`N=${n}:`);
  const zRuns: ConcurrentResult[] = [];
  const sRuns: ConcurrentResult[] = [];

  for (let r = 0; r < RUNS; r++) {
    const z = await runConcurrent("zenpix", n);
    const s = await runConcurrent("sharp", n);
    zRuns.push(z);
    sRuns.push(s);
    console.log(
      `  run ${r + 1}: zenpix ${z.wallMs.toFixed(0)}ms (cpu ${z.sumCpuUserMs.toFixed(0)}ms)` +
      ` / sharp ${s.wallMs.toFixed(0)}ms (cpu ${s.sumCpuUserMs.toFixed(0)}ms)`,
    );
  }

  rows.push({
    n,
    zenpixWallMs: median(zRuns.map((r) => r.wallMs)),
    sharpWallMs:  median(sRuns.map((r) => r.wallMs)),
    zenpixCpuMs:  median(zRuns.map((r) => r.sumCpuUserMs)),
    sharpCpuMs:   median(sRuns.map((r) => r.sumCpuUserMs)),
  });
  console.log(
    `  median wall: zenpix ${rows.at(-1)!.zenpixWallMs.toFixed(0)}ms / sharp ${rows.at(-1)!.sharpWallMs.toFixed(0)}ms\n`,
  );
}

// ── Output ────────────────────────────────────────────────────────────────────

const outDir = join(PROJECT_ROOT, "bench/results-concurrent");
mkdirSync(outDir, { recursive: true });

const date = new Date().toISOString();
const mdRows = rows.map((r) => {
  const wallRatio = r.sharpWallMs / r.zenpixWallMs;
  const cpuRatio  = r.sharpCpuMs  / r.zenpixCpuMs;
  return (
    `| ${r.n} | ${r.zenpixWallMs.toFixed(0)} | ${r.sharpWallMs.toFixed(0)} | **${wallRatio.toFixed(2)}×** ` +
    `| ${r.zenpixCpuMs.toFixed(0)} | ${r.sharpCpuMs.toFixed(0)} | **${cpuRatio.toFixed(2)}×** |`
  );
}).join("\n");

const md = `# Concurrent AVIF Encode Benchmark

**Date**: ${date}
**Fixture**: ${FIXTURE_ID}
**Scenario**: ${scenarioKey} (${scenario.inW}×${scenario.inH} → ${scenario.outW}×${scenario.outH})
**Quality**: ${QUALITY} / **Speed**: ${SPEED} / **Runs per N**: ${RUNS} (median)

| N | zenpix wall (ms) | Sharp wall (ms) | wall ratio | zenpix CPU user (ms) | Sharp CPU user (ms) | CPU ratio |
|--:|-----------------:|----------------:|-----------:|---------------------:|--------------------:|----------:|
${mdRows}

**wall ratio** = Sharp ÷ zenpix wall-clock (**>1** = zenpix finishes sooner under concurrent load)
**CPU ratio** = Sharp ÷ zenpix sum-of-CPU-user-time (**>1** = zenpix uses less CPU in total)
`;

const mdPath = join(outDir, "benchmark-concurrent.md");
writeFileSync(mdPath, md);

console.log("─".repeat(60));
console.log(md);
console.log(`Saved: ${mdPath}`);
