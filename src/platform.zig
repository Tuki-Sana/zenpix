/// platform.zig — コンパイル時プラットフォーム選択
///
/// 使い方: const platform = @import("platform.zig");
///         const tile_h = platform.DEFAULT_TILE_HEIGHT;
///
/// ターゲットが wasm32 なら platform/wasm.zig、それ以外は platform/native.zig を選ぶ。
/// 呼び出し元はプラットフォームを意識しなくてよい。

const builtin = @import("builtin");
const is_wasm = builtin.target.cpu.arch == .wasm32;
const p = if (is_wasm) @import("platform/wasm.zig") else @import("platform/native.zig");

pub const CpuFeatures = p.CpuFeatures;
pub const detectCpuFeatures = p.detectCpuFeatures;
pub const MAX_WORKER_THREADS = p.MAX_WORKER_THREADS;
pub const DEFAULT_TILE_HEIGHT = p.DEFAULT_TILE_HEIGHT;
