# API リファレンス

```typescript
import {
  decode, resize, encodeWebP, encodeAvif, encodePng,
  crop, convert,
  removeBackground, flattenBackground, roundCorners,
} from "zenpix";
```

---

## decode

```typescript
function decode(input: Buffer | Uint8Array): ImageBuffer
```

JPEG・PNG・静止画 WebP・AVIF・GIF（先頭フレームのみ、RGB 出力）をデコードして生ピクセルデータを返します。

**非対応フォーマット**: HEIC / HEIF・アニメーション WebP・アニメーション GIF（2フレーム目以降）。失敗時は `zenpix: decode failed` をスローします。

JPEG の EXIF Orientation は自動適用されます（Orientation 2〜8 すべて処理済み）。

```typescript
interface ImageBuffer {
  data: Buffer;     // 生ピクセル（row-major, top-left origin）
  width: number;
  height: number;
  channels: number; // 3 = RGB, 4 = RGBA
  icc?: Buffer;     // 埋め込み ICC プロファイル（ない画像では省略）
}
```

---

## resize

```typescript
function resize(image: ImageBuffer, options: ResizeOptions): ImageBuffer
```

Lanczos-3 フィルタでリサイズします。`width` / `height` の片方を省略するとアスペクト比を維持します。入力に `icc` がある場合は出力にも引き継ぎます。

```typescript
interface ResizeOptions {
  width?: number;
  height?: number;
  threads?: number;                           // 並列スレッド数（デフォルト: 1）
  fit?: "stretch" | "contain" | "cover";
  // "stretch"（デフォルト）: width / height をそのまま使用
  // "contain": 縦横比を保ちながら枠内に収める（letterbox）
  // "cover":   縦横比を保ちながら枠全体を覆う（中央クロップ）
}
```

---

## encodeWebP

```typescript
function encodeWebP(image: ImageBuffer, options?: WebPOptions): Buffer
```

WebP にエンコードします。`image.icc` が設定されていれば ICCP チャンクとして埋め込みます。

```typescript
interface WebPOptions {
  quality?: number;   // 0–100（デフォルト: 92）
  lossless?: boolean; // ロスレス（デフォルト: false）
}
```

---

## encodeAvif

```typescript
function encodeAvif(image: ImageBuffer, options?: AvifOptions): Buffer | Uint8Array | null
```

AVIF にエンコードします。以下の場合は `null` を返します：

- `quality` が 0–100 の範囲外
- `speed` が 0–10 の範囲外
- AVIF 無効でビルドされたバイナリを使用している

> Node.js / Bun では `Buffer`、Deno では `Uint8Array` を返します。

```typescript
interface AvifOptions {
  quality?: number; // 0–100（デフォルト: 60）
  speed?: number;   // 0–10（デフォルト: 6）。10 が最速
  threads?: number; // エンコードスレッド数（デフォルト: 1）。バッチ処理時は os.cpus().length を推奨
}
```

---

## encodePng

```typescript
function encodePng(image: ImageBuffer, options?: PngOptions): Buffer | Uint8Array
```

PNG にエンコードします。`image.icc` が設定されていれば iCCP チャンクとして埋め込みます。`compression` が 0–9 の範囲外の場合は `Error` をスローします。

```typescript
interface PngOptions {
  compression?: number; // zlib 圧縮レベル 0–9（デフォルト: 6）
}
```

---

## crop

```typescript
function crop(image: ImageBuffer, options: CropOptions): ImageBuffer
```

ピクセルデータから矩形領域を切り出します。ICC プロファイルは引き継ぎます。範囲外・ゼロ次元・不正値の場合は `Error` をスローします。

```typescript
interface CropOptions {
  left: number;   // 切り出し左端（px, 0 origin）
  top: number;    // 切り出し上端（px, 0 origin）
  width: number;  // 切り出し幅（px）
  height: number; // 切り出し高さ（px）
}
```

---

## convert

```typescript
function convert(
  input: Buffer | Uint8Array,
  options: ConvertOptions
): Buffer | Uint8Array | null
```

decode → crop → resize → encode を一発実行するパイプライン関数です。`encode.format` が `"avif"` のときのみ `null` を返す可能性があります。

```typescript
interface ConvertOptions {
  crop?: CropOptions;
  resize?: ResizeOptions;
  encode:
    | { format: "webp"; quality?: number; lossless?: boolean }
    | { format: "avif"; quality?: number; speed?: number; threads?: number }
    | { format: "png";  compression?: number };
}
```

**使用例**

```typescript
// decode → contain リサイズ → AVIF
const avif = convert(readFileSync("photo.jpg"), {
  resize: { width: 1920, height: 1080, fit: "contain" },
  encode: { format: "avif", quality: 60, speed: 10 },
});
if (avif) writeFileSync("output.avif", avif);

// decode → クロップ → WebP
const webp = convert(readFileSync("photo.jpg"), {
  crop: { left: 0, top: 0, width: 800, height: 600 },
  encode: { format: "webp", quality: 85 },
});
writeFileSync("thumb.webp", webp as Buffer);
```

---

## removeBackground

```typescript
function removeBackground(
  image: ImageBuffer,
  options?: { threshold?: number }
): ImageBuffer
```

四隅からのフラッドフィルで白系ピクセルを透過化します（RGB → RGBA）。`threshold` は白と判定する距離（0–255、デフォルト: 30）。ロゴの内側にある白（リングで囲まれている場合）は除去されません。

**使用例**

```typescript
import { decode, removeBackground, encodePng } from "zenpix";

const image = decode(readFileSync("icon.jpg"));
const noBg  = removeBackground(image, { threshold: 30 });
writeFileSync("icon-transparent.png", encodePng(noBg));
```

---

## flattenBackground

```typescript
function flattenBackground(image: ImageBuffer): ImageBuffer
```

RGBA 画像を白背景に合成して RGB に変換します。透過コーナー付き PNG に `removeBackground` を適用する前処理として使うと、外側の白リングごと除去できます。

**使用例**

```typescript
import { decode, flattenBackground, removeBackground, encodePng } from "zenpix";

const image = decode(readFileSync("icon.png")); // 透過コーナー付き PNG
const flat  = flattenBackground(image);          // RGBA → RGB（白背景に合成）
const noBg  = removeBackground(flat, { threshold: 30 });
writeFileSync("icon-clean.png", encodePng(noBg));
```

---

## roundCorners

```typescript
function roundCorners(
  image: ImageBuffer,
  options: { radius: number | "full" }
): ImageBuffer
```

角丸マスクを適用します（RGB → RGBA）。`radius: "full"` で完全な円形になります。

**使用例**

```typescript
import { decode, flattenBackground, removeBackground, roundCorners, encodePng } from "zenpix";

const image   = decode(readFileSync("icon.png"));
const noBg    = removeBackground(flattenBackground(image), { threshold: 30 });

// 角丸（40px）
const rounded = roundCorners(noBg, { radius: 40 });
writeFileSync("icon-rounded.png", encodePng(rounded));

// 完全な円形
const circle  = roundCorners(noBg, { radius: "full" });
writeFileSync("icon-circle.png", encodePng(circle));
```
