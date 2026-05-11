# zenpix

![zenpix](assets/zenpix-banner.jpg)

Zig 製の高速画像処理ライブラリです。JPEG / PNG / WebP / AVIF / GIF をデコードし、Lanczos-3 リサイズを経て WebP / AVIF / PNG にエンコードします。Node.js / Bun / Deno 対応（FFI 経由）。ビルド環境は不要です。

**npm:** [zenpix](https://www.npmjs.com/package/zenpix)（Node / Bun / Deno・ネイティブ） · [zenpix-wasm](https://www.npmjs.com/package/zenpix-wasm)（ブラウザ向け AVIF エンコード）

---

## インストール

```bash
npm install zenpix
```

> ESM 専用パッケージです。`package.json` に `"type": "module"` が必要です。CommonJS（`require`）は非対応です。

**Deno:**

```typescript
import { decode, encodeAvif } from "npm:zenpix/deno";
// 実行時に --allow-ffi フラグが必要
```

---

## クイックスタート

```typescript
import { decode, resize, encodeAvif, convert } from "zenpix";
import { readFileSync, writeFileSync } from "fs";

// decode → resize → AVIF
const image   = decode(readFileSync("photo.jpg"));
const resized = resize(image, { width: 1920, height: 1080, fit: "cover" });
const avif    = encodeAvif(resized, { quality: 60, threads: 4 });
if (avif) writeFileSync("output.avif", avif);

// convert() でワンライナー
const result = convert(readFileSync("photo.jpg"), {
  resize: { width: 1920, height: 1080, fit: "cover" },
  encode: { format: "avif", quality: 60 },
});
if (result) writeFileSync("output.avif", result);
```

**CLI** — インストール不要で使えます：

```bash
npx zenpix photo.jpg                          # → photo.avif
npx zenpix *.jpg --out-dir ./avif/ --threads 4
npx zenpix icon.jpg favicon.png --remove-bg --round-corners full
```

---

## なぜ zenpix か

少コア VPS（2〜4 vCPU）で Sharp の AVIF 変換を使うと、CPU を大量消費して他のリクエストが遅延します。zenpix は **Sharp の約 40% の CPU user 時間**で動作するため、同じサーバーで約 2.5 倍のリクエストをさばけます。

| ツール | wall-clock | CPU user |
|---|---:|---:|
| Sharp quality=60（libvips 自動スレッド） | 0.422s | 2.630s |
| zenpix speed=6（threads=14） | 0.610s | **1.060s** |

条件: 3840×2160 PNG → 1920×1080 AVIF（quality=60）、macOS arm64。[詳細なベンチマーク →](./docs/reference/benchmarks.md)

---

## 主な機能

- **デコード**: JPEG / PNG / WebP / AVIF / GIF（先頭フレーム）
- **リサイズ**: Lanczos-3、SIMD 最適化（NEON/SSE2）、fit モード（stretch / contain / cover）
- **エンコード**: WebP / AVIF（`threads` オプションで per-call 指定可）/ PNG
- **パイプライン**: `convert()` — decode → crop → resize → encode を一発実行
- **CLI**: `npx zenpix`（バッチ・stdin/stdout 対応）
- **背景除去**: `removeBackground` / `roundCorners` / `flattenBackground`

---

## 動作環境

| ランタイム | macOS arm64 | macOS x64 | Linux x64 | Windows x64 |
|---|:---:|:---:|:---:|:---:|
| Node.js 18+ | ✅ | ✅ | ✅ | ✅ |
| Bun | ✅ | ✅ | ✅ | ✅ |
| Deno 2.x | ✅ | ✅ | ✅ | ✅ |

---

## ドキュメント

- [はじめに / API リファレンス](./docs/reference/index.md)
- [CLI ガイド](./docs/reference/cli.md)
- [ベンチマーク詳細](./docs/reference/benchmarks.md)
- [動作環境・トラブルシューティング](./docs/reference/environments.md)

---

## ライセンス

MIT © 2026 月村つかさ

使用ライブラリ: libjpeg-turbo, zlib, libpng, libwebp, libavif, libaom, stb_image.h — 詳細は [THIRD_PARTY_LICENSES](./THIRD_PARTY_LICENSES)。

---

## 開発者向け

```bash
mise use zig@0.13.0
git submodule update --init --recursive
zig build lib   # FFI テスト用の共有ライブラリをビルド
npm run build   # TypeScript → js/dist/
npm run test:bun
```

詳細は [docs/operations.md](./docs/operations.md) と [docs/release.md](./docs/release.md) を参照してください。
