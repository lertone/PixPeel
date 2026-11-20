/* ───────────────── 真实超分模型（内置 Real-ESRGAN general x4v3） ─────────────────
 * 模型：realesr-general-x4v3（SRVGGNetCompact，1.21M 参数，BSD-3-Clause）
 * 输入 1×3×128×128 RGB / 0–1，输出 1×3×512×512，固定 4x。
 * 做法：按 128 的块切图（边缘复制补边），每块保留 16px 上下文，输出取中间 96×4 的区域，
 * 块与块正好拼接、不重叠；透明元素单独把 alpha 用 Lanczos 放大，再和模型 RGB 合并。
 * 模型和 ORT 的 wasm 都在安装包里，不联网。 */
const SR = { session: null, loading: null, ready: false, failed: false, tile: 128, scale: 4, pad: 16 };

async function srEnsure() {
  if (SR.ready) return true;
  if (SR.failed) return false;
  if (SR.loading) return SR.loading;
  SR.loading = (async () => {
    try {
      if (typeof ort === 'undefined') throw new Error('onnxruntime-web not loaded');
      const model = await api.readAsset('sr/model.onnx');
      if (!model) throw new Error('SR assets missing');
      /* WebGPU 快得多（约 0.55s/块），没有 WebGPU 时退回 WASM（约 3s/块）。
         wasmBinary 只能在真的走 WASM 时设置，提前设置会干扰 WebGPU 后端初始化。 */
      try {
        SR.session = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' });
        SR.ep = 'webgpu';
      } catch (gpuErr) {
        console.warn('WebGPU unavailable, falling back to WASM', gpuErr);
        SR.gpuError = String(gpuErr && gpuErr.message || gpuErr);
        const wasm = await api.readAsset('sr/ort-wasm-simd-threaded.wasm');
        if (!wasm) throw new Error('WASM runtime missing');
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        const wb = wasm instanceof ArrayBuffer ? wasm : wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
        ort.env.wasm.wasmBinary = wb;
        SR.session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
        SR.ep = 'wasm';
      }
      SR.ready = true;
      return true;
    } catch (e) {
      console.warn('SR init failed', e);
      SR.failed = true; SR.error = String(e && e.message || e);
      return false;
    } finally { SR.loading = null; }
  })();
  return SR.loading;
}

/** 把源图拆成 RGB（透明处用邻近颜色向外生长，避免模型把边缘带成黑/白）和 alpha */
function srPrepare(srcCv) {
  const w = srcCv.width, h = srcCv.height;
  const d = srcCv.getContext('2d').getImageData(0, 0, w, h).data;
  const rgb = new Float32Array(w * h * 3), alpha = new Float32Array(w * h);
  const filled = new Uint8Array(w * h);
  let vis = 0, semi = 0, anyTrans = false, ar = 0, ag = 0, ab = 0;
  for (let i = 0; i < w * h; i++) {
    const a = d[i * 4 + 3]; alpha[i] = a / 255;
    if (a > 8) {
      rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2];
      filled[i] = 1; vis++; ar += d[i * 4]; ag += d[i * 4 + 1]; ab += d[i * 4 + 2];
      if (a < 235) semi++;
    } else anyTrans = true;
  }
  if (!vis) return null;
  const avg = [ar / vis, ag / vis, ab / vis];
  /* 8 邻域向外生长，让透明区域也有合理的 RGB；剩下的用整体平均色兜底 */
  let cur = filled;
  for (let pass = 0; pass < 12; pass++) {
    let any = false;
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cur[i]) { next[i] = 1; continue; }
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx; if (!cur[j]) continue;
          r += rgb[j * 3]; g += rgb[j * 3 + 1]; b += rgb[j * 3 + 2]; n++;
        }
      }
      if (n) { rgb[i * 3] = r / n; rgb[i * 3 + 1] = g / n; rgb[i * 3 + 2] = b / n; next[i] = 1; any = true; }
    }
    cur = next;
    if (!any) break;
  }
  for (let i = 0; i < w * h; i++) if (!cur[i]) { rgb[i * 3] = avg[0]; rgb[i * 3 + 1] = avg[1]; rgb[i * 3 + 2] = avg[2]; }
  return { rgb, alpha, w, h, anyTrans, hard: vis > 0 && semi / vis < 0.1 };
}

/** alpha 用 Lanczos 放大，硬边贴纸再做一次 smoothstep 收边 */
function srAlphaUp(alpha, w, h, F, hard) {
  const dw = w * F, dh = h * F;
  const pre = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { const a = alpha[i] * 255; pre[i * 4] = pre[i * 4 + 1] = pre[i * 4 + 2] = a; pre[i * 4 + 3] = a; }
  const up = lzResize(pre, w, h, dw, dh);
  const out = new Float32Array(dw * dh);
  for (let i = 0; i < dw * dh; i++) {
    let a = up[i * 4 + 3] / 255;
    if (hard) { let t = (a - 0.5) / 0.45 + 0.5; t = t < 0 ? 0 : t > 1 ? 1 : t; a = t * t * (3 - 2 * t); }
    out[i] = a;
  }
  return out;
}

function srTensor(tile) {
  return new ort.Tensor('float32', tile, [1, 3, SR.tile, SR.tile]);
}

/** 用模型把画布 4x 放大，再缩到目标倍数 f（2–4）。onProgress(done,total) */
async function srUpscale(srcCv, f, onProgress) {
  const ok = await srEnsure();
  if (!ok) throw new Error('SR unavailable');
  const prep = srPrepare(srcCv);
  if (!prep) throw new Error('empty image');
  const { rgb, alpha, w, h, anyTrans, hard } = prep;
  const F = SR.scale, tile = SR.tile, pad = SR.pad, core = tile - pad * 2;
  const outW = w * F, outH = h * F;
  const out = new Float32Array(outW * outH * 3);
  const xs = [], ys = [];
  for (let x = 0; x < w; x += core) xs.push(x);
  for (let y = 0; y < h; y += core) ys.push(y);
  const total = xs.length * ys.length; let done = 0;
  const C = tile * tile;
  for (const cy of ys) for (const cx of xs) {
    const cw = Math.min(core, w - cx), ch = Math.min(core, h - cy);
    const ox = Math.max(0, Math.min(w - tile, cx - pad));
    const oy = Math.max(0, Math.min(h - tile, cy - pad));
    const tx0 = cx - ox, ty0 = cy - oy;
    const buf = new Float32Array(3 * C);
    for (let ty = 0; ty < tile; ty++) {
      const sy = Math.min(h - 1, oy + ty);
      for (let tx = 0; tx < tile; tx++) {
        const sx = Math.min(w - 1, ox + tx), si = (sy * w + sx) * 3, di = ty * tile + tx;
        buf[di] = rgb[si] / 255;
        buf[C + di] = rgb[si + 1] / 255;
        buf[2 * C + di] = rgb[si + 2] / 255;
      }
    }
    const res = await SR.session.run({ image: srTensor(buf) });
    const t = res.upscaled_image.data;              // [1,3,512,512] NCHW
    const S = tile * F;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        for (let dy = 0; dy < F; dy++) {
          const sy = (ty0 + y) * F + dy, dyOut = (cy + y) * F + dy;
          for (let dx = 0; dx < F; dx++) {
            const sx = (tx0 + x) * F + dx, dxOut = (cx + x) * F + dx;
            const si = sy * S + sx, di = (dyOut * outW + dxOut) * 3;
            out[di] = Math.min(1, Math.max(0, t[si]));
            out[di + 1] = Math.min(1, Math.max(0, t[S * S + si]));
            out[di + 2] = Math.min(1, Math.max(0, t[2 * S * S + si]));
          }
        }
      }
    }
    done++; if (onProgress) onProgress(done, total);
  }
  const aUp = anyTrans ? srAlphaUp(alpha, w, h, F, hard) : null;
  const cv = document.createElement('canvas'); cv.width = outW; cv.height = outH;
  const g = cv.getContext('2d'), im = g.createImageData(outW, outH);
  for (let i = 0; i < outW * outH; i++) {
    im.data[i * 4] = out[i * 3] * 255;
    im.data[i * 4 + 1] = out[i * 3 + 1] * 255;
    im.data[i * 4 + 2] = out[i * 3 + 2] * 255;
    im.data[i * 4 + 3] = anyTrans ? Math.round(aUp[i] * 255) : 255;
  }
  g.putImageData(im, 0, 0);
  if (f === F) return cv;
  /* 需要 2x / 3x 时从 4x 结果高质量缩回去 */
  const outCv = document.createElement('canvas'); outCv.width = w * f; outCv.height = h * f;
  const og = outCv.getContext('2d'); og.imageSmoothingQuality = 'high';
  og.drawImage(cv, 0, 0, outCv.width, outCv.height);
  return outCv;
} 
