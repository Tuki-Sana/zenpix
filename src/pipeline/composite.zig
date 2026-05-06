/// composite.zig — 背景除去・マスク合成
///
/// removeBackground: 四隅 BFS フラッドフィルで白系背景を透過化する (RGB→RGBA)。
/// roundCorners:     RGBA 画像の四隅に rounded-rect アルファマスクを適用する。

const std = @import("std");

// ─────────────────────────────────────────────────────────────────────────────
// removeBackground
// ─────────────────────────────────────────────────────────────────────────────

/// 四隅 BFS フラッドフィルで白系ピクセルを透過化する。
///
/// - 入力は RGB (channels=3) または RGBA (channels=4) を受け付ける。
/// - 出力は常に RGBA (4 ch)。
/// - threshold: 0–255。各チャンネルが (255 - threshold) 以上なら「白系」とみなす。
///   例: threshold=30 → R,G,B ≥ 225 で白判定。
/// - 結果バッファは alloc で確保。呼び出し元が free すること。
pub fn removeBackground(
    src: []const u8,
    width: u32,
    height: u32,
    channels: u8,
    threshold: u8,
    alloc: std.mem.Allocator,
) ![]u8 {
    const w: usize = width;
    const h: usize = height;
    const ch: usize = channels;

    // RGBA 出力バッファを確保し、src をコピー（RGB なら alpha=255 を付与）
    const out_len = w * h * 4;
    const out = try alloc.alloc(u8, out_len);
    errdefer alloc.free(out);

    for (0..h) |y| {
        for (0..w) |x| {
            const si = (y * w + x) * ch;
            const di = (y * w + x) * 4;
            out[di + 0] = src[si + 0]; // R
            out[di + 1] = src[si + 1]; // G
            out[di + 2] = src[si + 2]; // B
            out[di + 3] = if (ch == 4) src[si + 3] else 255;
        }
    }

    // 訪問済みフラグ（1バイト/ピクセル）
    const visited = try alloc.alloc(u8, w * h);
    defer alloc.free(visited);
    @memset(visited, 0);

    // BFS キュー（最大 w*h 要素）
    const Queue = struct {
        buf: []u32,
        head: usize = 0,
        tail: usize = 0,

        fn push(self: *@This(), v: u32) void {
            self.buf[self.tail] = v;
            self.tail += 1;
        }
        fn pop(self: *@This()) u32 {
            const v = self.buf[self.head];
            self.head += 1;
            return v;
        }
        fn empty(self: @This()) bool {
            return self.head == self.tail;
        }
    };

    const q_buf = try alloc.alloc(u32, w * h);
    defer alloc.free(q_buf);
    var q = Queue{ .buf = q_buf };

    const lo: u8 = 255 - threshold;

    // 四隅をシードとして追加
    const corners = [_][2]usize{
        .{ 0, 0 }, .{ w - 1, 0 }, .{ 0, h - 1 }, .{ w - 1, h - 1 },
    };
    for (corners) |c| {
        const idx = c[1] * w + c[0];
        if (visited[idx] == 0) {
            visited[idx] = 1;
            q.push(@intCast(idx));
        }
    }

    // BFS
    const dx = [_]i32{ 1, -1, 0, 0 };
    const dy = [_]i32{ 0, 0, 1, -1 };

    while (!q.empty()) {
        const cur: usize = q.pop();
        const cx: usize = cur % w;
        const cy: usize = cur / w;

        // 白系チェック（RGB チャンネル）
        const pi = cur * 4;
        const r = out[pi + 0];
        const g = out[pi + 1];
        const b = out[pi + 2];
        if (r < lo or g < lo or b < lo) continue; // 白じゃない → 止まる

        // 透過化
        out[pi + 3] = 0;

        // 隣接ピクセルをエンキュー
        for (0..4) |d| {
            const nx = @as(i64, @intCast(cx)) + dx[d];
            const ny = @as(i64, @intCast(cy)) + dy[d];
            if (nx < 0 or nx >= @as(i64, @intCast(w))) continue;
            if (ny < 0 or ny >= @as(i64, @intCast(h))) continue;
            const ni: usize = @as(usize, @intCast(ny)) * w + @as(usize, @intCast(nx));
            if (visited[ni] == 0) {
                visited[ni] = 1;
                q.push(@intCast(ni));
            }
        }
    }

    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// roundCorners
// ─────────────────────────────────────────────────────────────────────────────

/// RGBA 画像の四隅に rounded-rect アルファマスクを適用する。
///
/// - 入力・出力ともに RGBA (4ch)。入力は変更しない。
/// - radius: 角の半径 (px)。0 で何もしない。radius >= min(w,h)/2 で完全な楕円。
/// - 角の境界を 1px の anti-alias でブレンドする。
/// - 結果バッファは alloc で確保。呼び出し元が free すること。
pub fn roundCorners(
    src: []const u8,
    width: u32,
    height: u32,
    radius: u32,
    alloc: std.mem.Allocator,
) ![]u8 {
    const w: usize = width;
    const h: usize = height;
    const r: f64 = @floatFromInt(@min(radius, @min(width / 2, height / 2)));

    const out_len = w * h * 4;
    const out = try alloc.alloc(u8, out_len);
    errdefer alloc.free(out);
    @memcpy(out, src[0..out_len]);

    if (r == 0.0) return out;

    // 各ピクセルについて、四隅の角ゾーンにいるか判定
    // 角ゾーン: x < r かつ y < r (左上) など
    // 中心からの距離 dist > r なら透過、dist < r-1 なら変更なし、その間は anti-alias
    for (0..h) |y| {
        for (0..w) |x| {
            const fx: f64 = @floatFromInt(x);
            const fy: f64 = @floatFromInt(y);
            const fw: f64 = @floatFromInt(w);
            const fh: f64 = @floatFromInt(h);

            // 各軸で角ゾーンにいるか
            const in_left   = fx < r;
            const in_right  = fx >= fw - r;
            const in_top    = fy < r;
            const in_bottom = fy >= fh - r;

            // 四隅のいずれかにいる場合のみ処理
            if (!((in_left or in_right) and (in_top or in_bottom))) continue;

            // 各コーナーのアーク円の中心（ピクセル座標）
            // top-left: (r, r)  top-right: (W-1-r, r)
            // bottom-left: (r, H-1-r)  bottom-right: (W-1-r, H-1-r)
            const cx: f64 = if (in_left) r else fw - 1.0 - r;
            const cy: f64 = if (in_top)  r else fh - 1.0 - r;

            const dx = fx - cx;
            const dy = fy - cy;
            const dist = @sqrt(dx * dx + dy * dy);

            const pi = (y * w + x) * 4;
            if (dist >= r) {
                // 完全に外側 → 透過
                out[pi + 3] = 0;
            } else if (dist >= r - 1.0) {
                // anti-alias ゾーン (1px)
                const frac = r - dist; // 0.0〜1.0
                const orig_alpha: f64 = @floatFromInt(out[pi + 3]);
                out[pi + 3] = @intFromFloat(@round(orig_alpha * frac));
            }
            // dist < r-1: 変更なし（既存 alpha を保持）
        }
    }

    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// テスト
// ─────────────────────────────────────────────────────────────────────────────

test "removeBackground: 白背景が透過になる" {
    const alloc = std.testing.allocator;
    // 3x3 RGB: 全白
    var src = [_]u8{255} ** (3 * 3 * 3);
    const out = try removeBackground(&src, 3, 3, 3, 30, alloc);
    defer alloc.free(out);

    // 全ピクセルの alpha が 0 になっているはず
    for (0..9) |i| {
        try std.testing.expectEqual(@as(u8, 0), out[i * 4 + 3]);
    }
}

test "removeBackground: 内側の白は残る（閉じた形）" {
    const alloc = std.testing.allocator;
    // 5x5 RGB。外周=白、内側1ピクセル(2,2)=赤で、それ以外の内部=白
    // 外周が白で閉じているので、外のBFSは内部に届かない
    // ただし 5x5 の場合、外周だけが白でリングを形成する構造を作る
    //
    // レイアウト (W=白, R=赤):
    //   W W W W W
    //   W R R R W
    //   W R W R W  ← (2,2) は白だが外と繋がっていない
    //   W R R R W
    //   W W W W W
    var src = [_]u8{0} ** (5 * 5 * 3);
    // 全部白
    @memset(&src, 255);
    // 内側リング(1,1)-(3,3)を赤に
    for ([_][2]usize{ .{1,1},.{2,1},.{3,1},.{1,2},.{3,2},.{1,3},.{2,3},.{3,3} }) |pos| {
        const off = (pos[1] * 5 + pos[0]) * 3;
        src[off + 0] = 200; // R
        src[off + 1] = 0;   // G
        src[off + 2] = 0;   // B
    }
    // (2,2) は白のまま（内側に閉じ込められた白）

    const out = try removeBackground(&src, 5, 5, 3, 30, alloc);
    defer alloc.free(out);

    // 外周4辺のピクセルは透過になる
    // (0,0) corner
    try std.testing.expectEqual(@as(u8, 0), out[0 * 4 + 3]);
    // (4,4) corner
    try std.testing.expectEqual(@as(u8, 0), out[(4 * 5 + 4) * 4 + 3]);

    // 内側の赤ピクセル(1,1)は不透過のまま
    try std.testing.expectEqual(@as(u8, 255), out[(1 * 5 + 1) * 4 + 3]);

    // 内側に閉じ込められた白(2,2)は BFS が届かないので不透過のまま
    try std.testing.expectEqual(@as(u8, 255), out[(2 * 5 + 2) * 4 + 3]);
}

test "roundCorners: 角が透過になる" {
    const alloc = std.testing.allocator;
    // 10x10 RGBA 全不透過
    var src = [_]u8{0} ** (10 * 10 * 4);
    for (0..100) |i| {
        src[i * 4 + 0] = 0;
        src[i * 4 + 1] = 128;
        src[i * 4 + 2] = 255;
        src[i * 4 + 3] = 255;
    }
    const out = try roundCorners(&src, 10, 10, 3, alloc);
    defer alloc.free(out);

    // (0,0) は角の外側なので透過
    try std.testing.expectEqual(@as(u8, 0), out[(0 * 10 + 0) * 4 + 3]);
    // (5,5) は中央なので不透過
    try std.testing.expectEqual(@as(u8, 255), out[(5 * 10 + 5) * 4 + 3]);
}

test "roundCorners: radius=0 で変化なし" {
    const alloc = std.testing.allocator;
    var src = [_]u8{255} ** (4 * 4 * 4);
    const out = try roundCorners(&src, 4, 4, 0, alloc);
    defer alloc.free(out);
    try std.testing.expectEqualSlices(u8, &src, out);
}
