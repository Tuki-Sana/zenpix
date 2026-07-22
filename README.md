# zenpix

> [!IMPORTANT]
> **Archived:** This repository contains the legacy Zig implementation of zenpix and is no longer maintained. After a macOS update affected build reproducibility and Zig-based CI build times became impractical, development moved to the [current C-based zenpix](https://github.com/tsukasa-art/zenpix).

![zenpix](assets/zenpix-banner.jpg)

High-performance image processing library built with Zig. Decodes JPEG / PNG / WebP / AVIF / GIF and encodes to WebP / AVIF / PNG with Lanczos-3 resizing. Works with Node.js, Bun, and Deno via FFI — no build tools required.

**[日本語ドキュメント](./README.ja.md)**

**npm:** [zenpix](https://www.npmjs.com/package/zenpix) (Node / Bun / Deno, native) · [zenpix-wasm](https://www.npmjs.com/package/zenpix-wasm) (browser AVIF encoding)

---

## Install

```bash
npm install zenpix
```

> ESM only. Add `"type": "module"` to your `package.json`. CommonJS (`require`) is not supported.

**Deno:**

```typescript
import { decode, encodeAvif } from "npm:zenpix/deno";
// requires --allow-ffi flag
```

---

## Quick Start

```typescript
import { decode, resize, encodeAvif, convert } from "zenpix";
import { readFileSync, writeFileSync } from "fs";

// decode → resize → AVIF
const image   = decode(readFileSync("photo.jpg"));
const resized = resize(image, { width: 1920, height: 1080, fit: "cover" });
const avif    = encodeAvif(resized, { quality: 60, threads: 4 });
if (avif) writeFileSync("output.avif", avif);

// one-liner pipeline
const result = convert(readFileSync("photo.jpg"), {
  resize: { width: 1920, height: 1080, fit: "cover" },
  encode: { format: "avif", quality: 60 },
});
if (result) writeFileSync("output.avif", result);
```

**CLI** — no install needed:

```bash
npx zenpix photo.jpg                          # → photo.avif
npx zenpix *.jpg --out-dir ./avif/ --threads 4
npx zenpix icon.jpg favicon.png --remove-bg --round-corners full
```

---

## Why zenpix?

On low-core VPS environments (2–4 vCPUs), Sharp's AVIF encoding consumes significant CPU time, starving concurrent requests. zenpix uses **~40% of Sharp's CPU user time**, meaning the same server can handle ~2.5× more requests.

| Tool | wall-clock | CPU user |
|---|---:|---:|
| Sharp quality=60 (libvips auto-thread) | 0.422s | 2.630s |
| zenpix speed=6 (threads=14) | 0.610s | **1.060s** |

Pipeline: 3840×2160 PNG → 1920×1080 AVIF (quality=60), macOS arm64. [Full benchmark →](./docs/reference/benchmarks.md)

---

## Features

- **Decode**: JPEG / PNG / WebP / AVIF / GIF (first frame)
- **Resize**: Lanczos-3, SIMD optimized (NEON/SSE2), fit modes (stretch / contain / cover)
- **Encode**: WebP / AVIF (per-call `threads` option) / PNG
- **Pipeline**: `convert()` — decode → crop → resize → encode in one call
- **CLI**: `npx zenpix` with batch, stdin/stdout support
- **Background removal**: `removeBackground` / `roundCorners` / `flattenBackground`

---

## Platform Support

| Runtime | macOS arm64 | macOS x64 | Linux x64 | Windows x64 |
|---|:---:|:---:|:---:|:---:|
| Node.js 18+ | ✅ | ✅ | ✅ | ✅ |
| Bun | ✅ | ✅ | ✅ | ✅ |
| Deno 2.x | ✅ | ✅ | ✅ | ✅ |

---

## Documentation

- [Getting Started / API Reference](./docs/reference/index.md)
- [CLI Guide](./docs/reference/cli.md)
- [Benchmarks](./docs/reference/benchmarks.md)
- [Environments & Troubleshooting](./docs/reference/environments.md)

---

## License

MIT © 2026 Tsukasa Tsukimura

Uses: libjpeg-turbo, zlib, libpng, libwebp, libavif, libaom, stb_image.h — see [THIRD_PARTY_LICENSES](./THIRD_PARTY_LICENSES).

---

## For Contributors

```bash
mise use zig@0.13.0
git submodule update --init --recursive
zig build lib   # build shared library for FFI tests
npm run build   # TypeScript → js/dist/
npm run test:bun
```

See [docs/operations.md](./docs/operations.md) and [docs/release.md](./docs/release.md).
