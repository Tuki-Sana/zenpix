# ベンチマーク

---

## 比較の読み方

zenpix と Sharp を比較するとき、**wall-clock** と **CPU user** の2軸で見ることが重要です。

| 指標 | 意味 | zenpix の立ち位置 |
|---|---|---|
| **wall-clock** | 処理が完了するまでの実時間 | Sharp がリード（単発リクエストなら Sharp が速い） |
| **CPU user** | プロセスが消費した全コアの合算 CPU 時間 | zenpix が大幅に小さい |

**CPU user が重要な理由**: 2〜4 コアの VPS で複数リクエストを同時処理するとき、CPU user の差はコアの奪い合いとなり他リクエストの遅延に直結します。wall-clock が速くても CPU をたくさん使うツールは、同時処理が増えるほど全体のスループットを下げます。

---

## 一点比較（手動計測）

**条件**: 3840×2160 PNG → 1920×1080 AVIF（quality=60）  
**環境**: macOS aarch64（Apple M4 Pro）、イラスト系フィクスチャ（`bench_chara_chika.png`）  
**計測**: `/usr/bin/time`、warm-up 3 / measure 7、中央値  
**バージョン**: zenpix 0.8.0

| ツール | wall-clock | CPU user | ファイルサイズ |
|---|---:|---:|---:|
| Sharp quality=60（libvips 自動スレッド） | 0.422s | 2.630s | 63 KB |
| zenpix speed=10（シングルスレッド） | 0.512s | 0.530s | 106 KB |
| zenpix speed=6（シングルスレッド） | 0.992s | 1.000s | 73 KB |
| **zenpix speed=6（threads=14）** | **0.610s** | 1.060s | 73 KB |

**ポイント**:
- wall-clock は Sharp が 0.422s でリード
- CPU user は zenpix が Sharp の **約 40%**（1.060s vs 2.630s）
- `threads=14` により speed=6 の wall-clock が 0.992s → 0.610s（38% 短縮）、CPU user はほぼ横ばい
- ファイルサイズは quality=60 を揃えても実装差あり。圧縮率を揃えた比較は `bench/bench-quality.ts` 参照

---

## マトリクスベンチ（bench/bench.ts）

**条件**: PNG decode → Sharp で代表解像度へリサイズ → AVIF encode（quality=60 / speed=6）  
warm-up 2・計測 10、各セルは wall-clock 中央値（ms）  
**ratio = Sharp 中央値 ÷ zenpix 中央値**（1 超なら zenpix が速い）

### VPS 実測（Ubuntu・vCPU 2・RAM 2 GB）

3 回計測、各セルで 3 値の中央値を採用。2026-05-04 計測、zenpix 0.4.0。

| フィクスチャ | FHD（ratio） | WQHD（ratio） | 4K（ratio） |
|---|---:|---:|---:|
| bench_input（タイル系） | 0.26 | 0.25 | 0.24 |
| bench_chara_chika | **1.35** | **1.26** | **1.21** |
| bench_chara_kanata | **1.36** | **1.27** | **1.21** |
| bench_landscape_dark | **1.13** | **1.20** | 0.97 |
| bench_landscape_impasto | **1.47** | **1.37** | **1.44** |
| bench_landscape_light | **1.03** | 0.93 | 0.79 |

**傾向**: タイル系（bench_input）は Sharp が速い。キャラ・厚塗り風景では zenpix が有利な行が多い。

### Mac 実測（14 インチ MacBook Pro・Apple M4 Pro・RAM 24 GB）

3 回計測、各セルで 3 値の中央値を採用。2026-04-15 計測。

| フィクスチャ | FHD（ratio） | WQHD（ratio） | 4K（ratio） |
|---|---:|---:|---:|
| bench_input | 0.26 | 0.18 | 0.15 |
| bench_chara_chika | 0.60 | 0.44 | 0.41 |
| bench_chara_kanata | 0.63 | 0.46 | 0.38 |
| bench_landscape_dark | 0.55 | 0.51 | 0.38 |
| bench_landscape_impasto | 0.57 | 0.44 | 0.37 |
| bench_landscape_light | 0.53 | 0.46 | 0.35 |

**傾向**: Mac ではすべてのセルで ratio が 1 未満（Sharp が速い）。**外向きの主眼は VPS 表**。Mac 表は同一マシンでのリグレッション検知用。

### Mac マルチスレッド（threads=14）

同条件・同フィクスチャ、`encodeAvif` に `threads=14`（`os.cpus().length`）を指定。2026-05-04 計測。

| フィクスチャ | FHD（ratio） | WQHD（ratio） | 4K（ratio） |
|---|---:|---:|---:|
| bench_input | 0.33 | 0.22 | 0.19 |
| bench_chara_chika | **1.01** | 0.77 | 0.69 |
| bench_chara_kanata | **1.00** | 0.76 | 0.70 |
| bench_landscape_dark | 0.69 | 0.76 | 0.54 |
| bench_landscape_impasto | 0.95 | 0.72 | 0.78 |
| bench_landscape_light | 0.74 | 0.64 | 0.48 |

**傾向**: シングルスレッドより全行で ratio が改善。キャラ系 FHD は Sharp とほぼ互角（1.00〜1.01）。

---

## まとめ

| ユースケース | 推奨 |
|---|---|
| 単発リクエストの wall-clock 優先 | Sharp |
| VPS・少コア環境での同時処理 | **zenpix**（CPU user が約 40%） |
| CPU budget を per-call でコントロールしたい | **zenpix**（`threads` オプション） |
| イラスト・キャラ系の AVIF 変換（VPS） | **zenpix**（ratio 1.2〜1.5） |

---

## ベンチマークの再実行

```bash
npm run build
npx tsx bench/bench.ts

# フィクスチャを絞る
BENCH_FIXTURES=bench_input,bench_chara_chika npx tsx bench/bench.ts

# マルチスレッド計測
npm run bench:threads

# 品質揃えの比較
npm run bench:quality
```

成果物は `bench/results/benchmark.json` / `benchmark.md` に出力されます。
