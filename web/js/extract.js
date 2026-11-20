/* PixPeel 网页版：拆元素
 * 自动拆 / 点选 / 魔棒 / AI 点选（SlimSAM），全部在浏览器里完成。 */
(function () {
  const $ = (id) => document.getElementById(id);
  const MAX_SIDE = window.matchMedia('(max-width:900px)').matches ? 1400 : 1800;

  const S = {
    img: null, layers: [], seq: 1,
    tool: 'pick', zoomFactor: 1, zoom: 1,
    how: 'auto', tol: 40, merge: 6, minA: 0.15, k: 6, wtol: 32,
    edge: true, boxes: true, busy: false
  };

  let canvas, ctx, over, octx, drop, empty, wrap, statusEl, busyEl, busyText, fileInput, listEl, mobileEl;
  let countEl, sheetCount, saveSelBtn, downloadSelBtn;

  const AI = { worker: null, ready: false, embedded: false, pending: null, expect: null, loading: false };

  function cacheDom() {
    canvas = $('exCanvas'); ctx = canvas && canvas.getContext('2d', { willReadFrequently: true });
    drop = $('exDrop'); empty = $('exEmpty'); wrap = $('exCanvasWrap');
    if (canvas && !over) {
      const stack = document.createElement('div');
      stack.className = 'exStack';
      canvas.parentNode.insertBefore(stack, canvas);
      stack.appendChild(canvas);
      over = document.createElement('canvas');
      over.id = 'exOverlay';
      over.setAttribute('aria-hidden', 'true');
      stack.appendChild(over);
      octx = over.getContext('2d');
    }
    statusEl = $('exStatus'); busyEl = $('exBusy'); busyText = $('exBusyText');
    fileInput = $('exFile'); listEl = $('exList'); mobileEl = $('exMobileStrip');
    countEl = $('exCount'); sheetCount = $('exSheetCount');
    saveSelBtn = $('exSaveSel'); downloadSelBtn = $('exDownloadSel');
  }

  /* ── 图像准备与分割 ── */
  function prep(source, name) {
    const sw = source.width || source.naturalWidth;
    const sh = source.height || source.naturalHeight;
    const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0, w, h);
    return { w, h, data: g.getImageData(0, 0, w, h).data, cv, name: name || 'image' };
  }

  function detectForeground(image, tol) {
    const { w, h, data } = image;
    const n = w * h;
    const fg = new Uint8Array(n);
    let transparent = 0;
    for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 24) transparent++;
    if (transparent > n * 0.02) {
      for (let i = 0; i < n; i++) fg[i] = data[i * 4 + 3] >= 24 ? 1 : 0;
      return fg;
    }
    const hist = new Map();
    const border = [];
    const take = (p) => {
      const j = p * 4;
      const key = ((data[j] >> 4) << 8) | ((data[j + 1] >> 4) << 4) | (data[j + 2] >> 4);
      hist.set(key, (hist.get(key) || 0) + 1);
      border.push(p);
    };
    for (let x = 0; x < w; x++) { take(x); take((h - 1) * w + x); }
    for (let y = 1; y < h - 1; y++) { take(y * w); take(y * w + w - 1); }
    let bestKey = -1, best = 0;
    for (const [key, value] of hist) if (value > best) { best = value; bestKey = key; }
    let r = 0, g = 0, b = 0, c = 0;
    for (const p of border) {
      const j = p * 4;
      const key = ((data[j] >> 4) << 8) | ((data[j + 1] >> 4) << 4) | (data[j + 2] >> 4);
      if (key === bestKey) { r += data[j]; g += data[j + 1]; b += data[j + 2]; c++; }
    }
    if (!c) return null;
    r /= c; g /= c; b /= c;
    const tolSq = tol * tol;
    const near = (p) => {
      const j = p * 4;
      if (data[j + 3] < 24) return true;
      const dr = data[j] - r, dg = data[j + 1] - g, db = data[j + 2] - b;
      return dr * dr + dg * dg + db * db <= tolSq;
    };
    let nearCount = 0;
    for (const p of border) if (near(p)) nearCount++;
    if (nearCount < border.length * 0.6) return null;
    const bgm = new Uint8Array(n);
    const stack = new Int32Array(n);
    let sp = 0;
    for (const p of border) if (near(p) && !bgm[p]) { bgm[p] = 1; stack[sp++] = p; }
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && !bgm[p - 1] && near(p - 1)) { bgm[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && !bgm[p + 1] && near(p + 1)) { bgm[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && !bgm[p - w] && near(p - w)) { bgm[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && !bgm[p + w] && near(p + w)) { bgm[p + w] = 1; stack[sp++] = p + w; }
    }
    for (let i = 0; i < n; i++) fg[i] = bgm[i] ? 0 : 1;
    return fg;
  }

  function kmeans(image, K) {
    const { w, h, data } = image;
    const n = w * h;
    const step = Math.max(1, Math.floor(n / 7000));
    const samples = [];
    for (let i = 0; i < n; i += step) samples.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
    if (!samples.length) return { lab: new Uint8Array(n), K: 0 };
    const centers = [samples[0].slice()];
    while (centers.length < K) {
      let bi = 0, bd = -1;
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        let d = Infinity;
        for (const c of centers) {
          const e = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
          if (e < d) d = e;
        }
        if (d > bd) { bd = d; bi = i; }
      }
      centers.push(samples[bi].slice());
    }
    for (let it = 0; it < 8; it++) {
      const sums = centers.map(() => [0, 0, 0, 0]);
      for (const s of samples) {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < centers.length; i++) {
          const c = centers[i];
          const e = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
          if (e < bd) { bd = e; bi = i; }
        }
        const q = sums[bi];
        q[0] += s[0]; q[1] += s[1]; q[2] += s[2]; q[3]++;
      }
      for (let i = 0; i < sums.length; i++) {
        const q = sums[i];
        if (q[3]) centers[i] = [q[0] / q[3], q[1] / q[3], q[2] / q[3]];
      }
    }
    const lab = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      let bi = 0, bd = Infinity;
      for (let k = 0; k < centers.length; k++) {
        const c = centers[k];
        const e = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
        if (e < bd) { bd = e; bi = k; }
      }
      lab[i] = bi;
    }
    return { lab, K: centers.length };
  }

  function dilate(mask, w, h, radius) {
    if (radius <= 0) return mask;
    const tmp = new Uint8Array(w * h);
    const out = new Uint8Array(w * h);
    const prefix = new Int32Array(Math.max(w, h) + 1);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      prefix[0] = 0;
      for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x] + mask[row + x];
      for (let x = 0; x < w; x++) tmp[row + x] = prefix[Math.min(w, x + radius + 1)] - prefix[Math.max(0, x - radius)] > 0 ? 1 : 0;
    }
    for (let x = 0; x < w; x++) {
      prefix[0] = 0;
      for (let y = 0; y < h; y++) prefix[y + 1] = prefix[y] + tmp[y * w + x];
      for (let y = 0; y < h; y++) out[y * w + x] = prefix[Math.min(h, y + radius + 1)] - prefix[Math.max(0, y - radius)] > 0 ? 1 : 0;
    }
    return out;
  }

  function cc(mask, w, h) {
    const n = w * h;
    const label = new Int32Array(n);
    const stack = new Int32Array(n);
    const comps = [];
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (!mask[i] || label[i]) continue;
      count++;
      let sp = 0, area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      stack[sp++] = i; label[i] = count;
      while (sp) {
        const p = stack[--sp];
        const x = p % w, y = (p / w) | 0;
        area++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const q = ny * w + nx;
            if (mask[q] && !label[q]) { label[q] = count; stack[sp++] = q; }
          }
        }
      }
      comps.push({ area, x0, y0, x1, y1 });
    }
    return { label, count, comps };
  }

  function bboxOf(mask, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        area++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (!area) return null;
    return { x0, y0, x1, y1, area };
  }

  function cutElement(image, mask, box) {
    const bw = box.x1 - box.x0 + 1;
    const bh = box.y1 - box.y0 + 1;
    const pad = 1;
    const W = bw + pad * 2;
    const H = bh + pad * 2;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const out = g.createImageData(W, H);
    const at = (x, y) => (x < 0 || y < 0 || x >= bw || y >= bh) ? 0 : mask[y * bw + x];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const mx = x - pad, my = y - pad;
        let neighbours = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) neighbours += at(mx + dx, my + dy);
        let alpha;
        if (S.edge) {
          alpha = at(mx, my) ? (neighbours >= 9 ? 1 : 0.55 + 0.45 * neighbours / 9) : (neighbours > 0 ? neighbours / 9 * 0.7 : 0);
        } else {
          alpha = at(mx, my) ? 1 : 0;
        }
        if (alpha <= 0) continue;
        const sx = Math.max(0, Math.min(image.w - 1, box.x0 + mx));
        const sy = Math.max(0, Math.min(image.h - 1, box.y0 + my));
        const si = (sy * image.w + sx) * 4;
        const di = (y * W + x) * 4;
        out.data[di] = image.data[si];
        out.data[di + 1] = image.data[si + 1];
        out.data[di + 2] = image.data[si + 2];
        out.data[di + 3] = Math.round(255 * alpha * image.data[si + 3] / 255);
      }
    }
    g.putImageData(out, 0, 0);
    return { cv, w: W, h: H };
  }

  function addLayer(mask, box, fullSize) {
    let local = mask;
    if (fullSize) {
      const bw = box.x1 - box.x0 + 1;
      const bh = box.y1 - box.y0 + 1;
      local = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          if (mask[(box.y0 + y) * S.img.w + box.x0 + x]) local[y * bw + x] = 1;
        }
      }
    }
    const cut = cutElement(S.img, local, box);
    const layer = {
      id: S.seq++, on: true, saved: false, area: box.area,
      box, w: cut.w, h: cut.h, canvas: cut.cv
    };
    S.layers.push(layer);
    return layer;
  }

  function wandMask(image, sx, sy, tol) {
    const { w, h, data } = image;
    const n = w * h;
    const mask = new Uint8Array(n);
    const stack = new Int32Array(n);
    let sp = 0;
    const start = sy * w + sx;
    const j0 = start * 4;
    const r = data[j0], g = data[j0 + 1], b = data[j0 + 2], a = data[j0 + 3];
    const tolSq = tol * tol;
    const ok = (p) => {
      const j = p * 4;
      if (Math.abs(data[j + 3] - a) > 60) return false;
      if (a < 24) return true;
      const dr = data[j] - r, dg = data[j + 1] - g, db = data[j + 2] - b;
      return dr * dr + dg * dg + db * db <= tolSq;
    };
    mask[start] = 1; stack[sp++] = start;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && !mask[p - 1] && ok(p - 1)) { mask[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && !mask[p + 1] && ok(p + 1)) { mask[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && !mask[p - w] && ok(p - w)) { mask[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && !mask[p + w] && ok(p + w)) { mask[p + w] = 1; stack[sp++] = p + w; }
    }
    return mask;
  }

  /* ── 拆分 ── */
  function runSplit() {
    if (!S.img) return;
    setBusy('正在拆分…');
    setTimeout(() => {
      const image = S.img;
      const minArea = Math.max(8, image.w * image.h * S.minA / 100);
      const found = [];
      let usedColor = S.how === 'color';
      let fg = null;
      if (!usedColor) {
        fg = detectForeground(image, S.tol);
        if (!fg && S.how === 'auto') usedColor = true;
      }
      if (!usedColor && fg) {
        /* 先在原始蒙版上找连通块；再把「同一行、挨得很近的小块」按组件分组合并。
         * 不直接膨胀整张蒙版，避免通过背景把相隔很远的元素串成一个大块。 */
        const parts = cc(fg, image.w, image.h);
        const comps = parts.comps;
        const g = Math.max(0, S.merge);
        if (comps.length && comps.length <= 900) {
          const parent = comps.map((_, i) => i);
          const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
          const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
          const gap = (a, b) => ({
            x: Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) - 1),
            y: Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1) - 1)
          });
          const small = (c) => c.area < 30000 && (c.y1 - c.y0) < 120;
          for (let i = 0; i < comps.length; i++) {
            for (let j = i + 1; j < comps.length; j++) {
              const a = comps[i], b = comps[j], gp = gap(a, b);
              if (gp.x <= g && gp.y <= g) { union(i, j); continue; }
              /* 文字：同一行、高度接近的小块，允许两倍字距 */
              if (gp.y <= g && small(a) && small(b)) {
                const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
                if (oy > Math.min(a.y1 - a.y0, b.y1 - b.y0) * .3 && gp.x <= g * 2) union(i, j);
              }
            }
          }
          const groups = new Map();
          comps.forEach((c, i) => {
            const r = find(i);
            if (!groups.has(r)) groups.set(r, []);
            groups.get(r).push(i);
          });
          for (const ids of groups.values()) {
            let x0 = image.w, y0 = image.h, x1 = -1, y1 = -1, area = 0;
            for (const id of ids) {
              const c = comps[id];
              if (c.x0 < x0) x0 = c.x0;
              if (c.y0 < y0) y0 = c.y0;
              if (c.x1 > x1) x1 = c.x1;
              if (c.y1 > y1) y1 = c.y1;
              area += c.area;
            }
            if (area < minArea) continue;
            const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
            const mask = new Uint8Array(bw * bh);
            for (const id of ids) {
              const c = comps[id], cid = id + 1;
              for (let y = c.y0; y <= c.y1; y++) {
                const row = y * image.w;
                for (let x = c.x0; x <= c.x1; x++) {
                  if (parts.label[row + x] === cid && fg[row + x]) mask[(y - y0) * bw + (x - x0)] = 1;
                }
              }
            }
            found.push({ box: { x0, y0, x1, y1, area }, mask, bw, bh });
          }
        } else {
          for (let id = 1; id <= parts.count; id++) {
            const cp = comps[id - 1];
            const bw = cp.x1 - cp.x0 + 1, bh = cp.y1 - cp.y0 + 1;
            const mask = new Uint8Array(bw * bh);
            let area = 0;
            for (let y = 0; y < bh; y++) {
              for (let x = 0; x < bw; x++) {
                const p = (cp.y0 + y) * image.w + cp.x0 + x;
                if (parts.label[p] === id && fg[p]) { mask[y * bw + x] = 1; area++; }
              }
            }
            if (area >= minArea) found.push({ box: { x0: cp.x0, y0: cp.y0, x1: cp.x1, y1: cp.y1, area }, mask, bw, bh });
          }
        }
      } else {
        const km = kmeans(image, S.k);
        for (let k = 0; k < km.K; k++) {
          const group = new Uint8Array(image.w * image.h);
          let any = 0;
          for (let i = 0; i < group.length; i++) if (km.lab[i] === k) { group[i] = 1; any++; }
          if (any < minArea) continue;
          const parts = cc(group, image.w, image.h);
          for (let id = 1; id <= parts.count; id++) {
            const cp = parts.comps[id - 1];
            if (cp.area < minArea) continue;
            const bw = cp.x1 - cp.x0 + 1, bh = cp.y1 - cp.y0 + 1;
            const mask = new Uint8Array(bw * bh);
            for (let y = 0; y < bh; y++) {
              for (let x = 0; x < bw; x++) {
                if (parts.label[(cp.y0 + y) * image.w + cp.x0 + x] === id) mask[y * bw + x] = 1;
              }
            }
            found.push({ box: { x0: cp.x0, y0: cp.y0, x1: cp.x1, y1: cp.y1, area: cp.area }, mask, bw, bh });
          }
        }
      }
      found.sort((a, b) => b.box.area - a.box.area);
      S.layers = []; S.seq = 1;
      found.slice(0, 60).forEach((item) => addLayer(item.mask, item.box));
      renderElements();
      drawOverlay();
      setBusy(null);
      setStatus(found.length ? '拆出 ' + S.layers.length + ' 个元素' : (usedColor ? '没有找到可拆的元素，试试调低最小面积或用点选' : '背景太复杂，换颜色聚类或点选'));
    }, 20);
  }

  /* ── 画布 ── */
  function drawStage() {
    if (!S.img || !canvas) return;
    canvas.width = S.img.w;
    canvas.height = S.img.h;
    ctx.clearRect(0, 0, S.img.w, S.img.h);
    ctx.drawImage(S.img.cv, 0, 0);
    if (over) { over.width = S.img.w; over.height = S.img.h; }
    layoutCanvas();
    drawOverlay();
  }

  function layoutCanvas() {
    if (!S.img || !wrap || wrap.hidden) return;
    const box = wrap.getBoundingClientRect();
    const pad = window.innerWidth <= 900 ? 16 : 36;
    const fit = Math.min(
      Math.max(80, box.width - pad) / S.img.w,
      Math.max(80, box.height - pad) / S.img.h
    );
    S.zoom = fit * S.zoomFactor;
    const cw = Math.round(S.img.w * S.zoom) + 'px';
    const ch = Math.round(S.img.h * S.zoom) + 'px';
    canvas.style.width = cw; canvas.style.height = ch;
    if (over) { over.style.width = cw; over.style.height = ch; }
    const label = $('exZoomLabel');
    if (label) label.textContent = Math.round(S.zoom * 100) + '%';
  }

  function drawOverlay() {
    if (!S.img || !octx) return;
    octx.clearRect(0, 0, over.width, over.height);
    if (!S.boxes || !S.layers.length) return;
    const z = S.zoom || 1;
    octx.save();
    octx.lineWidth = Math.max(1 / z, 1.4 / z);
    octx.setLineDash([6 / z, 4 / z]);
    octx.font = '600 ' + Math.max(10 / z, 11 / z) + 'px ui-monospace, monospace';
    S.layers.forEach((l, i) => {
      const b = l.box;
      if (!b) return;
      octx.strokeStyle = l.on ? 'rgba(255,90,42,.92)' : 'rgba(120,120,130,.55)';
      octx.strokeRect(b.x0 + 1, b.y0 + 1, b.x1 - b.x0 - 2, b.y1 - b.y0 - 2);
      const label = String(i + 1);
      const tw = octx.measureText(label).width + 8 / z;
      const th = 15 / z;
      octx.fillStyle = l.on ? 'rgba(255,90,42,.92)' : 'rgba(120,120,130,.7)';
      const bx = b.x0 + 2, by = b.y0 + 2;
      octx.fillRect(bx, by, tw, th);
      octx.fillStyle = '#fff';
      octx.fillText(label, bx + 4 / z, by + 11 / z);
    });
    octx.restore();
  }

  function useImage(source, name) {
    try { S.img = prep(source, name); } catch (e) { setStatus('这张图读不出来'); return; }
    S.zoomFactor = 1; S.layers = []; S.seq = 1;
    empty.hidden = true; wrap.hidden = false;
    drawStage();
    if (AI.ready) AI.embedded = false;
    renderElements();
    setStatus('已载入，正在拆分…');
    runSplit();
  }

  function loadFile(file) {
    if (!file || !String(file.type).startsWith('image/')) return;
    if (file.size > 40 * 1024 * 1024) { setStatus('图片太大了（上限 40MB）'); return; }
    setStatus('正在载入图片…');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); useImage(img, file.name); };
    img.onerror = () => { URL.revokeObjectURL(url); setStatus('这张图读不出来'); };
    img.src = url;
  }

  function buildSample() {
    setStatus('正在生成示例…');
    const en = window.PPI18N && PPI18N.lang() === 'en';
    const w = 1000, h = 660;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = '#efe4d6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1410';
    g.font = '700 78px Georgia, "Times New Roman", serif';
    g.fillText('MISTVALE', 86, 160);
    g.fillStyle = '#8a7769';
    g.font = '20px "Microsoft YaHei", "Segoe UI", sans-serif';
    g.fillText(en ? 'A screenshot, split into usable pieces.' : '一张截图，拆成能用的素材。', 90, 200);
    g.fillStyle = '#ff5a2a';
    g.beginPath(); g.roundRect(86, 250, 250, 76, 16); g.fill();
    g.fillStyle = '#fff';
    if (en) {
      g.font = '700 24px "Segoe UI", sans-serif';
      g.fillText('START GAME', 118, 297);
    } else {
      g.font = '700 30px "Microsoft YaHei", sans-serif';
      g.fillText('开始游戏', 142, 300);
    }
    g.fillStyle = '#e4f26d';
    g.beginPath(); g.arc(786, 292, 88, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1a1410'; g.lineWidth = 10; g.stroke();
    g.fillStyle = '#1a1410';
    g.font = '700 36px Georgia, serif';
    g.fillText('NEW', 746, 306);
    g.fillStyle = '#fff';
    g.beginPath(); g.roundRect(86, 420, 660, 140, 18); g.fill();
    g.fillStyle = '#1a1410';
    g.font = '600 25px "Microsoft YaHei", "Segoe UI", sans-serif';
    g.fillText(en ? 'Drop elements in, get stickers.' : '拖进来的元素，直接变成贴纸', 118, 472);
    g.fillStyle = '#8a7769';
    g.font = '18px "Microsoft YaHei", "Segoe UI", sans-serif';
    g.fillText(en ? 'Click the canvas, or use Wand / AI pick.' : '点画面，或用魔棒与 AI 点选', 118, 512);
    g.fillStyle = '#ffb59b';
    g.beginPath(); g.arc(480, 600, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#52e3bd';
    g.beginPath(); g.roundRect(560, 586, 200, 44, 22); g.fill();
    const img = new Image();
    img.onload = () => useImage(img, 'sample.png');
    img.src = cv.toDataURL('image/png');
  }

  /* ── 元素列表 ── */
  function thumbUrl(layer) { return layer.canvas.toDataURL('image/png'); }

  function renderElements() {
    if (!listEl) return;
    const n = S.layers.length;
    if (countEl) countEl.textContent = String(n);
    if (sheetCount) sheetCount.textContent = String(n);
    const selected = S.layers.filter(l => l.on).length;
    if (saveSelBtn) saveSelBtn.disabled = !S.layers.some(l => l.on && !l.saved);
    if (downloadSelBtn) downloadSelBtn.disabled = !selected;

    listEl.innerHTML = '';
    mobileEl.innerHTML = '';
    if (!n) {
      listEl.innerHTML = '<p class="elEmpty">拆出来的元素会出现在这里。<br>点画布上的元素也可以直接取出。</p>';
      return;
    }
    S.layers.forEach((layer, index) => {
      const url = thumbUrl(layer);
      const card = document.createElement('div');
      card.className = 'elCard' + (layer.on ? ' sel' : '');
      card.innerHTML = `
        <div class="elThumb"><img src="${url}" alt="元素 ${index + 1}"><span class="elTick">✓</span></div>
        <div class="elMeta"><b>元素 ${index + 1}</b><span>${layer.w}×${layer.h}${layer.saved ? ' · 已入库' : ''}</span></div>
        <div class="elActs">
          <button data-act="save" class="${layer.saved ? 'saved' : ''}" type="button">${layer.saved ? '已存' : '存'}</button>
          <button data-act="down" type="button">下</button>
        </div>`;
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-act]')) return;
        layer.on = !layer.on;
        renderElements(); drawOverlay();
      });
      card.querySelector('[data-act="save"]').addEventListener('click', (e) => { e.stopPropagation(); saveLayers([layer]); });
      card.querySelector('[data-act="down"]').addEventListener('click', (e) => { e.stopPropagation(); downloadLayer(layer, index + 1); });
      listEl.appendChild(card);

      if (mobileEl) {
        const m = document.createElement('button');
        m.type = 'button';
        m.className = 'mCard' + (layer.on ? ' sel' : '');
        m.innerHTML = `<span><img src="${url}" alt=""></span><b>${index + 1}${layer.saved ? ' ✓' : ''}</b>`;
        m.addEventListener('click', () => { layer.on = !layer.on; renderElements(); drawOverlay(); });
        mobileEl.appendChild(m);
      }
    });
  }

  async function saveLayers(layers) {
    const usable = (layers || []).filter(l => l && !l.saved);
    if (!usable.length) { PPApp.toast('没有新的元素可保存'); return; }
    const uid = PPApp.session().uid;
    const entries = [];
    for (const l of usable) {
      const blob = await new Promise((res) => l.canvas.toBlob(res, 'image/png'));
      if (!blob) continue;
      entries.push({ name: (window.PPI18N && PPI18N.lang() === 'en' ? 'Element ' : '元素 ') + (S.layers.indexOf(l) + 1), blob, w: l.w, h: l.h });
    }
    const rows = await PPStore.add(uid, entries);
    if (!rows.length) { PPApp.toast('保存失败，可能是浏览器禁止了本机存储'); return; }
    usable.forEach(l => { l.saved = true; });
    renderElements();
    PPApp.afterLibraryChange();
    PPApp.toast(`已保存 ${rows.length} 个元素到元素库`);
  }

  function downloadLayer(layer, index) {
    const a = document.createElement('a');
    a.download = 'pixpeel-' + index + '.png';
    a.href = layer.canvas.toDataURL('image/png');
    a.click();
  }

  /* ── AI（SlimSAM，可选） ── */
  function aiWorker() {
    if (AI.worker) return AI.worker;
    const modelBase = new URL('models/', document.baseURI).href;
    const code = `
      let model, proc, raw, emb, RI;
      const ID = 'slimsam';
      const LOCAL = ${JSON.stringify(modelBase)};
      const post = (m, tr) => self.postMessage(m, tr || []);
      self.onmessage = async e => {
        const m = e.data;
        try {
          if (m.t === 'init') {
            let T = null;
            post({ t: 'status', msg: 'loading lib' });
            for (const u of [
              'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm',
              'https://fastly.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm',
              'https://unpkg.com/@huggingface/transformers@3.0.2/+esm'
            ]) { try { T = await import(u); break; } catch (x) {} }
            if (!T) throw new Error('transformers.js failed');
            T.env.allowLocalModels = true;
            T.env.allowRemoteModels = false;
            T.env.localModelPath = LOCAL;
            RI = T.RawImage;
            const cb = p => { if (p && p.total) post({ t: 'progress', loaded: p.loaded, total: p.total, file: p.file }); };
            post({ t: 'status', msg: 'loading model' });
            model = await T.SamModel.from_pretrained(ID, { dtype: 'q8', progress_callback: cb });
            proc = await T.AutoProcessor.from_pretrained(ID);
            post({ t: 'ready' });
          } else if (m.t === 'embed') {
            raw = await RI.fromBlob(m.blob);
            const inp = await proc(raw);
            emb = await model.get_image_embeddings(inp);
            post({ t: 'embedded' });
          } else if (m.t === 'click') {
            const inputs = await proc(raw, { input_points: [[m.pts]] });
            const out = await model({ ...emb, ...inputs });
            const masks = await proc.post_process_masks(out.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
            const t0 = masks[0], d = t0.dims, H = d[d.length - 2], W = d[d.length - 1];
            const scores = out.iou_scores.data;
            let bi = 0;
            for (let i = 1; i < scores.length; i++) if (scores[i] > scores[bi]) bi = i;
            const mask = new Uint8Array(W * H);
            const off = bi * W * H;
            for (let i = 0; i < W * H; i++) mask[i] = t0.data[off + i] ? 1 : 0;
            post({ t: 'mask', m: mask, W, H }, [mask.buffer]);
          }
        } catch (err) {
          post({ t: 'err', msg: String(err && err.message || err) });
        }
      };`;
    const worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    worker.onmessage = (event) => {
      const m = event.data;
      if (m.t === 'status') { setAiStatus('正在加载 AI 模型…'); return; }
      if (m.t === 'progress') {
        const pct = Math.min(99, Math.round(m.loaded / m.total * 100));
        const fill = $('exAiFill'); if (fill) fill.style.width = pct + '%';
        setAiStatus('模型下载中 ' + pct + '%');
        return;
      }
      if (m.t === 'ready') {
        AI.ready = true;
        const fill = $('exAiFill'); if (fill) fill.style.width = '100%';
        setAiStatus('模型已就绪，点画布上的元素试试');
        const btn = $('exAiLoad'); if (btn) { btn.textContent = 'SlimSAM 已就绪'; btn.disabled = true; }
        if (AI.pending && AI.pending.expect === 'ready') { const r = AI.pending; AI.pending = null; r.resolve(m); }
        return;
      }
      if (m.t === 'embedded') {
        AI.embedded = true;
        if (AI.pending && AI.pending.expect === 'embedded') { const r = AI.pending; AI.pending = null; r.resolve(m); }
        return;
      }
      if (m.t === 'mask') {
        if (AI.pending && AI.pending.expect === 'mask') { const r = AI.pending; AI.pending = null; r.resolve(m); }
        return;
      }
      if (m.t === 'err') {
        if (AI.pending) { const r = AI.pending; AI.pending = null; r.reject(new Error(m.msg)); }
        setAiStatus('AI 不可用：' + String(m.msg).slice(0, 70));
      }
    };
    AI.worker = worker;
    return worker;
  }

  function aiCall(message, expect, transfer) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (AI.pending && AI.pending.expect === expect) { AI.pending = null; reject(new Error('timeout')); }
      }, 10 * 60 * 1000);
      AI.pending = {
        expect,
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      };
      aiWorker();
      AI.worker.postMessage(message, transfer || []);
    });
  }

  async function ensureAI() {
    if (AI.ready) return;
    if (AI.loading) throw new Error('模型正在加载');
    AI.loading = true;
    setBusy('正在加载 AI 模型…');
    try { await aiCall({ t: 'init' }, 'ready'); }
    finally { AI.loading = false; setBusy(null); }
  }

  async function aiPick(x, y) {
    if (!S.img) return;
    try {
      await ensureAI();
      if (!AI.embedded) {
        setBusy('正在分析这张图…');
        const blob = await new Promise((res) => S.img.cv.toBlob(res, 'image/png'));
        await aiCall({ t: 'embed', blob }, 'embedded');
      }
      setBusy('正在找边界…');
      const data = await aiCall({ t: 'click', pts: [[x, y]] }, 'mask');
      const mask = new Uint8Array(data.m);
      if (data.W !== S.img.w || data.H !== S.img.h) throw new Error('AI 没有找到有效区域');
      const box = bboxOf(mask, S.img.w, S.img.h);
      if (!box || box.area < 30) throw new Error('AI 没有找到有效区域');
      addLayer(mask, box, true);
      renderElements(); drawOverlay();
      setStatus('AI 已取出一个元素');
    } catch (e) {
      setStatus('AI 点选失败：' + String(e.message || e).slice(0, 80));
      PPApp.toast('AI 点选不可用，可以先用自动拆分或魔棒');
    } finally { setBusy(null); }
  }

  /* ── 状态 ── */
  function setStatus(text) { if (statusEl) statusEl.textContent = text; }
  function setAiStatus(text) { const el = $('exAiStatus'); if (el) el.textContent = text; }
  function setBusy(text) {
    S.busy = !!text;
    if (!busyEl) return;
    if (!text) { busyEl.hidden = true; return; }
    if (busyText) busyText.textContent = text;
    busyEl.hidden = false;
  }

  /* ── 交互 ── */
  function setTool(tool) {
    S.tool = tool;
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    if (canvas) canvas.style.cursor = 'crosshair';
  }

  function pickAt(x, y) {
    if (!S.img) return;
    const mask = wandMask(S.img, x, y, S.wtol);
    const box = bboxOf(mask, S.img.w, S.img.h);
    if (!box || box.area < 20) { setStatus('这里没有取到元素，换个位置'); return; }
    if (box.area > S.img.w * S.img.h * 0.55) { setStatus('这里是背景，点元素内部试试'); return; }
    addLayer(mask, box, true);
    renderElements(); drawOverlay();
    setStatus('已取出一个元素');
  }

  function bind() {
    cacheDom();
    if (!canvas) return;

    $('btn-import') && ($('btn-import').onclick = () => fileInput.click());
    ['exImport', 'exImport2'].forEach(id => { const el = $(id); if (el) el.onclick = () => fileInput.click(); });
    ['exSample', 'exSample2', 'exSample3'].forEach(id => { const el = $(id); if (el) el.onclick = (e) => { e.stopPropagation(); buildSample(); }; });
    if (empty) empty.addEventListener('click', () => fileInput.click());
    if (drop) drop.addEventListener('click', (e) => { if (!e.target.closest('.exCanvasWrap')) fileInput.click(); });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) loadFile(fileInput.files[0]);
      fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('dragover'); }));
    drop.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });

    window.addEventListener('paste', (e) => {
      if (!PPApp || PPApp.view() !== 'extract') return;
      const active = document.activeElement;
      if (active && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (String(item.type).startsWith('image/')) {
          const f = item.getAsFile();
          if (f) loadFile(f);
          break;
        }
      }
    });

    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });

    $('exClear').onclick = () => {
      S.img = null; S.layers = []; S.seq = 1;
      if (wrap) wrap.hidden = true;
      if (empty) empty.hidden = false;
      renderElements();
      setStatus('等待导入一张图');
      AI.embedded = false;
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (!S.img) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) * S.img.w / rect.width);
      const y = Math.round((e.clientY - rect.top) * S.img.h / rect.height);
      if (x < 0 || y < 0 || x >= S.img.w || y >= S.img.h) return;
      if (S.tool === 'ai') { aiPick(x, y); return; }
      pickAt(x, y);
    });

    $('exResplit').onclick = runSplit;
    $('exHow').onchange = (e) => { S.how = e.target.value; document.querySelector('.colorOnly').hidden = S.how !== 'color'; };
    bindSlider('exTol', 'tol');
    bindSlider('exMerge', 'merge');
    bindSlider('exMinA', 'minA', v => v.toFixed(2) + '%');
    bindSlider('exK', 'k');
    bindSlider('exWtol', 'wtol');
    $('exEdge').onchange = (e) => { S.edge = e.target.checked; };
    $('exBoxes').onchange = (e) => { S.boxes = e.target.checked; drawOverlay(); };

    $('exSelAll').onclick = () => { S.layers.forEach(l => l.on = true); renderElements(); drawOverlay(); };
    $('exSelNone').onclick = () => { S.layers.forEach(l => l.on = false); renderElements(); drawOverlay(); };
    $('exSaveSel').onclick = () => saveLayers(S.layers.filter(l => l.on));
    $('exSaveAll').onclick = () => saveLayers(S.layers);
    $('exDownloadSel').onclick = () => {
      const picked = S.layers.filter(l => l.on);
      picked.forEach((l, i) => setTimeout(() => downloadLayer(l, i + 1), i * 160));
      PPApp.toast('已开始下载 ' + picked.length + ' 个 PNG');
    };

    $('exZoomIn').onclick = () => { S.zoomFactor = Math.min(6, S.zoomFactor * 1.25); layoutCanvas(); drawOverlay(); };
    $('exZoomOut').onclick = () => { S.zoomFactor = Math.max(.2, S.zoomFactor / 1.25); layoutCanvas(); drawOverlay(); };
    $('exFit').onclick = () => { S.zoomFactor = 1; layoutCanvas(); drawOverlay(); };

    $('exAiLoad').onclick = async () => {
      const btn = $('exAiLoad');
      btn.disabled = true;
      try { await ensureAI(); }
      catch (e) { setAiStatus('AI 模型加载失败：' + String(e.message || e).slice(0, 70)); btn.disabled = false; }
    };

    /* 参数 / 元素 面板（桌面 + 移动端底部抽屉） */
    document.querySelectorAll('.exTabs [data-panel]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.exTabs [data-panel]').forEach(b => b.classList.toggle('on', b === btn));
        document.querySelectorAll('.exPanel').forEach(p => p.classList.toggle('on', p.dataset.panel === btn.dataset.panel));
      });
    });
    const sheetToggle = $('exSheetToggle');
    if (sheetToggle) sheetToggle.onclick = () => {
      const el = $('exInspector');
      el.classList.toggle('open');
      document.body.classList.toggle('exSheetOpen', el.classList.contains('open'));
    };
    const sheetClose = $('exSheetClose');
    if (sheetClose) sheetClose.onclick = () => {
      $('exInspector').classList.remove('open');
      document.body.classList.remove('exSheetOpen');
    };

    window.addEventListener('resize', () => {
      if (PPApp.view() === 'extract' && S.img) { layoutCanvas(); drawOverlay(); }
    });
  }

  function bindSlider(id, key, format) {
    const input = $(id), out = $(id + 'V');
    if (!input) return;
    const sync = () => {
      const v = Number(input.value);
      S[key] = v;
      if (out) out.textContent = format ? format(v) : v;
    };
    input.addEventListener('input', sync);
    sync();
  }

  window.PPExtract = {
    init: bind,
    loadSample: buildSample,
    openFile: loadFile,
    onEnter() {
      if (!canvas) return;
      cacheDom();
      if (S.img) { requestAnimationFrame(() => { layoutCanvas(); drawOverlay(); }); }
      const el = $('exInspector');
      if (el && window.innerWidth <= 900) el.classList.remove('open');
      document.body.classList.remove('exSheetOpen');
    },
    state: S,
    refresh: renderElements
  };
})();
