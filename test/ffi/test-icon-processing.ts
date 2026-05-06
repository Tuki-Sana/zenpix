/**
 * test/ffi/test-icon-processing.ts
 *
 * baitotime-icons の実画像を使った removeBackground + roundCorners 統合テスト。
 * 処理後の PNG を test/ffi/out-icon/ に書き出して目視確認できるようにする。
 *
 * Run: bun run test/ffi/test-icon-processing.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { decode, removeBackground, roundCorners, flattenBackground, encodePng } from "../../js/dist/index.js";

const FIXTURES = join(import.meta.dir, "..", "fixtures", "baitotime-icons", "icons");
const OUT_DIR  = join(import.meta.dir, "out-icon");

mkdirSync(OUT_DIR, { recursive: true });

let passed = 0;
let failed = 0;

function pass(label: string) {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label: string, reason: string) {
  console.error(`  ✗ ${label}: ${reason}`);
  failed++;
}

// ── テスト 1: icon-1024x1024.png — removeBackground のみ ──────────────────────
{
  const label = "icon-1024x1024.png → removeBackground → PNG";
  try {
    const raw = readFileSync(join(FIXTURES, "icon-1024x1024.png"));
    const decoded = decode(raw);
    const noBg = removeBackground(decoded, { threshold: 30 });

    if (noBg.channels !== 4) {
      fail(label, `channels=${noBg.channels} (expected 4)`);
    } else {
      // 左上 (0,0) のアルファが 0 になっているはず（白背景）
      const cornerAlpha = noBg.data[(0 * noBg.width + 0) * 4 + 3];
      if (cornerAlpha !== 0) {
        fail(label, `corner alpha=${cornerAlpha} (expected 0 — background not removed)`);
      } else {
        const out = encodePng(noBg);
        writeFileSync(join(OUT_DIR, "icon-1024-no-bg.png"), out);
        pass(`${label} — corner alpha=0, wrote out-icon/icon-1024-no-bg.png`);
      }
    }
  } catch (e) {
    fail(label, e instanceof Error ? e.message : String(e));
  }
}

// ── テスト 2: icon-1024x1024.png — removeBackground + roundCorners(80px) ─────
{
  const label = "icon-1024x1024.png → removeBackground + roundCorners(80) → PNG";
  try {
    const raw = readFileSync(join(FIXTURES, "icon-1024x1024.png"));
    const decoded = decode(raw);
    const noBg = removeBackground(decoded, { threshold: 30 });
    const rounded = roundCorners(noBg, { radius: 80 });

    if (rounded.channels !== 4) {
      fail(label, `channels=${rounded.channels} (expected 4)`);
    } else {
      // 左上 (0,0) のアルファが 0 のまま（角丸後も角は透過）
      const cornerAlpha = rounded.data[(0 * rounded.width + 0) * 4 + 3];
      // 中央付近のアルファが 255
      const cx = Math.floor(rounded.width / 2);
      const cy = Math.floor(rounded.height / 2);
      const centerAlpha = rounded.data[(cy * rounded.width + cx) * 4 + 3];

      if (cornerAlpha !== 0 || centerAlpha !== 255) {
        fail(label, `corner alpha=${cornerAlpha}, center alpha=${centerAlpha}`);
      } else {
        const out = encodePng(rounded);
        writeFileSync(join(OUT_DIR, "icon-1024-no-bg-rounded.png"), out);
        pass(`${label} — corner=0, center=255, wrote out-icon/icon-1024-no-bg-rounded.png`);
      }
    }
  } catch (e) {
    fail(label, e instanceof Error ? e.message : String(e));
  }
}

// ── テスト 3: icon-192x192.png — roundCorners("full") で完全な円形 ────────────
{
  const label = "icon-192x192.png → removeBackground + roundCorners(full) → PNG";
  try {
    const raw = readFileSync(join(FIXTURES, "icon-192x192.png"));
    const decoded = decode(raw);
    const noBg = removeBackground(decoded, { threshold: 30 });
    const circle = roundCorners(noBg, { radius: "full" });

    if (circle.channels !== 4) {
      fail(label, `channels=${circle.channels} (expected 4)`);
    } else {
      const out = encodePng(circle);
      writeFileSync(join(OUT_DIR, "icon-192-circle.png"), out);
      pass(`${label} — wrote out-icon/icon-192-circle.png`);
    }
  } catch (e) {
    fail(label, e instanceof Error ? e.message : String(e));
  }
}

// ── テスト 4: apple-touch-icon.png — 角丸のみ（RGBA 入力が必要なので事前変換） ─
{
  const label = "apple-touch-icon.png → roundCorners(20) → PNG";
  try {
    const raw = readFileSync(join(FIXTURES, "apple-touch-icon.png"));
    const decoded = decode(raw);
    // channels が 3 の場合は removeBackground で RGBA に変換（threshold=0 で除去なし）
    const rgba = decoded.channels === 4 ? decoded : removeBackground(decoded, { threshold: 0 });
    const rounded = roundCorners(rgba, { radius: 20 });

    if (rounded.channels !== 4) {
      fail(label, `channels=${rounded.channels}`);
    } else {
      const out = encodePng(rounded);
      writeFileSync(join(OUT_DIR, "apple-touch-icon-rounded.png"), out);
      pass(`${label} — wrote out-icon/apple-touch-icon-rounded.png`);
    }
  } catch (e) {
    fail(label, e instanceof Error ? e.message : String(e));
  }
}

// ── テスト 5: icon-192x192.png (RGBA) — flattenBackground + removeBackground ──
// 透過コーナーを持つ RGBA PNG を白に合成してから背景除去 → 白リングも消える
{
  const label = "icon-192x192.png → flattenBackground + removeBackground → PNG";
  try {
    const raw = readFileSync(join(FIXTURES, "icon-192x192.png"));
    const decoded = decode(raw);

    const flattened = flattenBackground(decoded); // RGBA → RGB (白背景に合成)
    if (flattened.channels !== 3) {
      fail(label, `flattenBackground channels=${flattened.channels} (expected 3)`);
    } else {
      const noBg = removeBackground(flattened, { threshold: 30 });

      // 外側の白リング付近のピクセルが透過になっているか確認
      // (中心 96,96 から r≈82 あたりが白リング)
      const cx = 96, cy = 96;
      const ringR = 82;
      const rx = Math.round(cx + ringR * Math.cos(Math.PI / 4));
      const ry = Math.round(cy + ringR * Math.sin(Math.PI / 4));
      const ringAlpha = noBg.data[(ry * noBg.width + rx) * 4 + 3];

      if (ringAlpha !== 0) {
        fail(label, `white ring pixel (${rx},${ry}) alpha=${ringAlpha} (expected 0 — ring not removed)`);
      } else {
        const out = encodePng(noBg);
        writeFileSync(join(OUT_DIR, "icon-192-flatten-no-bg.png"), out);
        pass(`${label} — white ring removed, wrote out-icon/icon-192-flatten-no-bg.png`);
      }
    }
  } catch (e) {
    fail(label, e instanceof Error ? e.message : String(e));
  }
}

// ── テスト 6: icon-1024x1024.png — flatten + remove-bg + roundCorners(full) ──
// 白リング除去 + 完全な円形アイコン（favicon 用途）
{
  const label = "icon-1024x1024.png → flatten + removeBg + roundCorners(full) → PNG";
  try {
    const raw = readFileSync(join(FIXTURES, "icon-1024x1024.png"));
    const decoded = decode(raw);
    const noBg = removeBackground(flattenBackground(decoded), { threshold: 30 });
    const circle = roundCorners(noBg, { radius: "full" });

    if (circle.channels !== 4) {
      fail(label, `channels=${circle.channels}`);
    } else {
      const out = encodePng(circle);
      writeFileSync(join(OUT_DIR, "icon-1024-favicon-circle.png"), out);
      pass(`${label} — wrote out-icon/icon-1024-favicon-circle.png`);
    }
  } catch (e) {
    fail(label, e instanceof Error ? e.message : String(e));
  }
}

// ── 結果表示 ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
