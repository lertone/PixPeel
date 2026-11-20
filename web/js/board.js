/* PixPeel 网页版：画板
 * 图片 / 文字 / 基础形状，单指拖动、双指缩放旋转，自动存档，导出 PNG。 */
(function () {
  const $ = (id) => document.getElementById(id);
  const FAMILY = {
    sans: '"HarmonyOS Sans SC","MiSans","PingFang SC","Microsoft YaHei",system-ui,sans-serif',
    serif: 'Georgia,"Songti SC","SimSun",serif',
    display: '"PP Bebas",Impact,"Arial Narrow",sans-serif'
  };
  const SHAPE_ICON = { rect: '▭', round: '▢', ellipse: '◯', triangle: '△', star: '☆', line: '—', arrow: '→' };
  const SHAPE_NAME = { rect: '矩形', round: '圆角矩形', ellipse: '椭圆', triangle: '三角形', star: '星形', line: '线条', arrow: '箭头' };

  const B = {
    W: 1080, H: 1080, bg: '#f7f4ed', layers: [], sel: null,
    scale: 1, uid: null, active: false, mode: null,
    pointers: new Map(), drag: null, pinch: null,
    hist: [], hi: -1, saveTimer: null, loaded: false
  };
  let nextId = 1;
  let canvas, ctx, stage, handlesEl;
  let editingId = null;
  let assetUrls = [];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const deg = (r) => Math.round(r * 180 / Math.PI);
  const rad = (d) => d * Math.PI / 180;

  /* ── 图像 ── */
  function loadImage(blob) {
    return new Promise((res) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    });
  }

  function measureText(l) {
    const mc = measureText.cv || (measureText.cv = document.createElement('canvas'));
    const g = mc.getContext('2d');
    const size = +l.size || 72;
    g.font = `${+l.weight || 700} ${size}px ${FAMILY[l.font] || FAMILY.sans}`;
    const lines = String(l.text == null ? '' : l.text).split('\n');
    let w = 8;
    for (const line of lines) w = Math.max(w, g.measureText(line || ' ').width);
    l.w = Math.max(8, Math.ceil(w));
    l.h = Math.max(8, Math.ceil(lines.length * size * 1.16));
    return l;
  }

  function addItem(item, quiet) {
    return (async () => {
      if (!item || !item.blob) return false;
      const img = await loadImage(item.blob);
      if (!img) { PPApp.toast('这张图读不出来'); return false; }
      const w = item.w || img.naturalWidth || img.width;
      const h = item.h || img.naturalHeight || img.height;
      const s = Math.min(1, (B.W * .62) / w, (B.H * .62) / h);
      const off = (B.layers.length % 5) * 22 - 44;
      const l = {
        id: nextId++, kind: 'img', name: item.name || '图片',
        x: B.W / 2 + off, y: B.H / 2 + off, s, r: 0, op: 1, vis: true, lock: false,
        w, h, blob: item.blob, img
      };
      pushHistory();
      B.layers.push(l);
      B.sel = l.id;
      draw(); renderLayers(); renderProps(); scheduleSave();
      if (!quiet) PPApp.toast('已加入画板');
      return true;
    })();
  }

  function addUpload(file) {
    return (async () => {
      if (!file || !String(file.type).startsWith('image/')) return;
      const bm = await createImageBitmap(file).catch(() => null);
      if (!bm) { PPApp.toast('这张图读不出来'); return; }
      const cv = document.createElement('canvas');
      cv.width = bm.width; cv.height = bm.height;
      cv.getContext('2d').drawImage(bm, 0, 0);
      const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
      if (!blob) return;
      await addItem({ name: file.name.replace(/\.[^.]+$/, '') || '图片', blob, w: bm.width, h: bm.height });
    })();
  }

  /* ── 图层 ── */
  function sel() { return B.layers.find(l => l.id === B.sel) || null; }

  function addTextLayer(text, opts) {
    if (!text || !String(text).trim()) return null;
    const l = {
      id: nextId++, kind: 'text', name: '文字',
      x: B.W / 2, y: B.H / 2, s: 1, r: 0, op: 1, vis: true, lock: false,
      text: String(text).trim(), size: (opts && opts.size) || 88,
      color: (opts && opts.color) || '#111318', font: (opts && opts.font) || 'sans',
      weight: (opts && opts.weight) || 700, align: 'center'
    };
    measureText(l);
    pushHistory();
    B.layers.push(l); B.sel = l.id;
    draw(); renderLayers(); renderProps(); scheduleSave();
    return l;
  }

  function addShape(kind) {
    const k = SHAPE_NAME[kind] ? kind : 'rect';
    const def = {
      rect: { w: 360, h: 240, fill: '#ff5a2a', lineColor: '#111318', lineW: 0 },
      round: { w: 360, h: 240, fill: '#52e3bd', lineColor: '#06241c', lineW: 0, radius: 42 },
      ellipse: { w: 320, h: 220, fill: '#e4f26d', lineColor: '#111318', lineW: 0 },
      triangle: { w: 300, h: 260, fill: '#2d6cdf', lineColor: '#111318', lineW: 0 },
      star: { w: 300, h: 300, fill: '#ff5a2a', lineColor: '#111318', lineW: 0, points: 5 },
      line: { w: 380, h: 80, fill: 'none', lineColor: '#111318', lineW: 12 },
      arrow: { w: 380, h: 120, fill: '#111318', lineColor: '#111318', lineW: 12 }
    }[k];
    const l = {
      id: nextId++, kind: 'shape', shape: k, name: SHAPE_NAME[k],
      x: B.W / 2, y: B.H / 2, s: 1, r: 0, op: 1, vis: true, lock: false,
      w: Math.min(def.w, B.W * .6), h: Math.min(def.h, B.H * .6),
      fill: def.fill, lineColor: def.lineColor, lineW: def.lineW,
      radius: def.radius || 0, points: def.points || 5
    };
    pushHistory();
    B.layers.push(l); B.sel = l.id;
    draw(); renderLayers(); renderProps(); scheduleSave();
  }

  function pushHistory() {
    const snap = B.layers.map(l => ({ ...l }));
    B.hist = B.hist.slice(0, B.hi + 1);
    B.hist.push(snap);
    if (B.hist.length > 40) B.hist.shift();
    B.hi = B.hist.length - 1;
  }
  let lastPropPush = 0;
  function pushHistoryThrottled() {
    const now = Date.now();
    if (now - lastPropPush < 500) return;
    lastPropPush = now;
    pushHistory();
  }
  function restore(snap) {
    B.layers = snap.map(l => ({ ...l }));
    if (B.sel != null && !B.layers.some(l => l.id === B.sel)) B.sel = null;
    draw(); renderLayers(); renderProps(); scheduleSave();
  }
  function undo() {
    if (B.hi <= 0) return;
    B.hi--; restore(B.hist[B.hi]);
  }
  function redo() {
    if (B.hi >= B.hist.length - 1) return;
    B.hi++; restore(B.hist[B.hi]);
  }

  function removeSel() {
    const l = sel(); if (!l) return;
    pushHistory();
    B.layers = B.layers.filter(x => x !== l);
    B.sel = null;
    draw(); renderLayers(); renderProps(); scheduleSave();
  }

  function duplicateSel() {
    const l = sel(); if (!l) return;
    pushHistory();
    const copy = { ...l, id: nextId++, x: l.x + 26, y: l.y + 26 };
    if (l.kind === 'text') measureText(copy);
    B.layers.push(copy); B.sel = copy.id;
    draw(); renderLayers(); renderProps(); scheduleSave();
  }

  function orderSel(dir) {
    const l = sel(); if (!l) return;
    const i = B.layers.indexOf(l);
    pushHistory();
    if (dir === 'top') { B.layers.splice(i, 1); B.layers.push(l); }
    else if (dir === 'bottom') { B.layers.splice(i, 1); B.layers.unshift(l); }
    else if (dir === 'up' && i < B.layers.length - 1) { B.layers.splice(i, 1); B.layers.splice(i + 1, 0, l); }
    else if (dir === 'down' && i > 0) { B.layers.splice(i, 1); B.layers.splice(i - 1, 0, l); }
    draw(); renderLayers(); scheduleSave();
  }

  /* ── 绘制 ── */
  function drawLayer(g, l) {
    if (l.vis === false) return;
    g.save();
    g.globalAlpha *= clamp(l.op == null ? 1 : l.op, 0, 1);
    g.translate(l.x, l.y);
    g.rotate(l.r || 0);
    g.scale(l.s || 1, l.s || 1);
    if (l.kind === 'img' && l.img) {
      g.drawImage(l.img, -l.w / 2, -l.h / 2, l.w, l.h);
    } else if (l.kind === 'text') {
      g.fillStyle = l.color || '#111318';
      g.font = `${+l.weight || 700} ${+l.size || 72}px ${FAMILY[l.font] || FAMILY.sans}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const lines = String(l.text == null ? '' : l.text).split('\n');
      const lh = (+l.size || 72) * 1.16;
      lines.forEach((line, i) => g.fillText(line, 0, (i - (lines.length - 1) / 2) * lh));
    } else if (l.kind === 'shape') {
      drawShape(g, l);
    }
    g.restore();
  }

  function starPath(g, w, h, n) {
    const R = Math.min(w, h) / 2, r = R * .45, N = Math.max(3, Math.min(20, Math.round(n || 5)));
    for (let i = 0; i < N * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / N, rr = i % 2 ? r : R;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
  }

  function drawShape(g, l) {
    const w = l.w, h = l.h;
    const fill = l.fill || '#ff5a2a';
    const lineW = +l.lineW || 0;
    const lineColor = l.lineColor || '#111318';
    g.beginPath();
    if (l.shape === 'round') {
      const r = clamp(+l.radius || 0, 0, Math.min(w, h) / 2);
      if (r > 0) g.roundRect(-w / 2, -h / 2, w, h, r); else g.rect(-w / 2, -h / 2, w, h);
    } else if (l.shape === 'ellipse') {
      g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (l.shape === 'triangle') {
      g.moveTo(0, -h / 2); g.lineTo(w / 2, h / 2); g.lineTo(-w / 2, h / 2); g.closePath();
    } else if (l.shape === 'star') {
      starPath(g, w, h, l.points);
    } else if (l.shape === 'line') {
      g.moveTo(-w / 2, 0); g.lineTo(w / 2, 0);
      g.lineCap = 'round'; g.lineWidth = Math.max(1, lineW || 8); g.strokeStyle = lineColor; g.stroke();
      return;
    } else if (l.shape === 'arrow') {
      const t = Math.max(2, lineW || 10), hw = Math.min(h, Math.max(t * 2.4, 12));
      const hl = Math.min(w * .45, Math.max(hw * 1.1, 18));
      g.moveTo(-w / 2, -t / 2); g.lineTo(w / 2 - hl, -t / 2); g.lineTo(w / 2 - hl, -hw / 2);
      g.lineTo(w / 2, 0); g.lineTo(w / 2 - hl, hw / 2); g.lineTo(w / 2 - hl, t / 2); g.lineTo(-w / 2, t / 2);
      g.closePath();
      g.fillStyle = fill === 'none' ? lineColor : fill; g.fill();
      return;
    } else {
      g.rect(-w / 2, -h / 2, w, h);
    }
    if (fill && fill !== 'none') { g.fillStyle = fill; g.fill(); }
    if (lineW > 0) { g.lineWidth = lineW; g.strokeStyle = lineColor; g.lineJoin = 'round'; g.stroke(); }
  }

  function paint(g) {
    if (B.bg && B.bg !== 'transparent') { g.fillStyle = B.bg; g.fillRect(0, 0, B.W, B.H); }
    for (const l of B.layers) drawLayer(g, l);
  }

  function draw() {
    if (!canvas) return;
    if (canvas.width !== B.W || canvas.height !== B.H) { canvas.width = B.W; canvas.height = B.H; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, B.W, B.H);
    paint(ctx);
    positionHandles();
  }

  function resize() {
    if (!stage || !B.active) return;
    const wrap = $('bdStageWrap');
    if (!wrap) return;
    const aw = wrap.clientWidth - 36, ah = wrap.clientHeight - 36;
    if (aw < 40 || ah < 40) return;
    const s = Math.max(.05, Math.min(aw / B.W, ah / B.H));
    B.scale = s;
    stage.style.width = Math.round(B.W * s) + 'px';
    stage.style.height = Math.round(B.H * s) + 'px';
    draw();
  }

  /* ── 选框 ── */
  function layerSize(l) {
    if (l.kind === 'text') { measureText(l); }
    return { w: l.w, h: l.h };
  }
  function corners(l) {
    const sz = layerSize(l);
    const hw = sz.w * (l.s || 1) / 2, hh = sz.h * (l.s || 1) / 2;
    const c = Math.cos(l.r || 0), s = Math.sin(l.r || 0);
    const P = (lx, ly) => [ (l.x + lx * c - ly * s) * B.scale, (l.y + lx * s + ly * c) * B.scale ];
    const cs = [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)];
    const top = P(0, -hh);
    const rot = [top[0] + s * 30, top[1] - c * 30];
    return { cs, top, rot };
  }

  function positionHandles() {
    if (!handlesEl) return;
    const l = sel();
    if (!l || l.vis === false || l.lock) { handlesEl.hidden = true; handlesEl.innerHTML = ''; return; }
    const { cs, top, rot } = corners(l);
    const pts = cs.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
    handlesEl.hidden = false;
    handlesEl.innerHTML = `
      <svg viewBox="0 0 ${Math.max(1, B.W * B.scale)} ${Math.max(1, B.H * B.scale)}" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="${pts}" fill="none" stroke="rgba(255,90,42,.9)" stroke-width="1.5" stroke-dasharray="5 4"/>
        <line x1="${top[0]}" y1="${top[1]}" x2="${rot[0]}" y2="${rot[1]}" stroke="rgba(82,227,189,.95)" stroke-width="2"/>
      </svg>
      ${['nw', 'ne', 'se', 'sw'].map((k, i) => `<span class="handle" data-h="${k}" style="left:${cs[i][0]}px;top:${cs[i][1]}px"></span>`).join('')}
      <span class="handle rot" data-h="rot" style="left:${rot[0]}px;top:${rot[1]}px"></span>`;
    handlesEl.querySelectorAll('.handle').forEach(h => {
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        startTransform(e, h.dataset.h);
      });
    });
  }

  function startTransform(e, kind) {
    const l = sel(); if (!l || l.lock) return;
    pushHistory();
    const cx = l.x * B.scale, cy = l.y * B.scale;
    const rect = stage.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const st = {
      kind, l,
      s0: l.s || 1, r0: l.r || 0,
      d0: Math.hypot(sx - cx, sy - cy) || 1,
      a0: Math.atan2(sy - cy, sx - cx),
      x0: l.x, y0: l.y, w0: l.w, h0: l.h
    };
    if (kind === 'rot') dragHandle(e, st, 'rot'); else dragHandle(e, st, 'scale');
  }

  function dragHandle(e, st, kind) {
    const rect = stage.getBoundingClientRect();
    const move = (ev) => {
      const l = st.l;
      const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
      const cx = l.x * B.scale, cy = l.y * B.scale;
      if (kind === 'rot') {
        let r = st.r0 + Math.atan2(sy - cy, sx - cx) - st.a0;
        if (ev.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12);
        l.r = r;
      } else {
        const d = Math.hypot(sx - cx, sy - cy);
        l.s = clamp(st.s0 * d / st.d0, .02, 30);
      }
      draw(); renderProps();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      scheduleSave();
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    e.preventDefault();
  }

  /* ── 命中与拖动 ── */
  function toDoc(clientX, clientY) {
    const r = stage.getBoundingClientRect();
    return { x: (clientX - r.left) / B.scale, y: (clientY - r.top) / B.scale };
  }
  function hitTest(docX, docY) {
    for (let i = B.layers.length - 1; i >= 0; i--) {
      const l = B.layers[i];
      if (l.vis === false || l.lock) continue;
      const sz = layerSize(l);
      const hw = sz.w * (l.s || 1) / 2, hh = sz.h * (l.s || 1) / 2;
      const dx = docX - l.x, dy = docY - l.y;
      const c = Math.cos(-(l.r || 0)), s = Math.sin(-(l.r || 0));
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return l;
    }
    return null;
  }

  function onDown(e) {
    if (!B.active) return;
    if (e.target.closest('.handle')) return;
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch (err) { }
    const pt = { x: e.clientX, y: e.clientY };
    B.pointers.set(e.pointerId, pt);

    if (B.pointers.size === 1) {
      const d = toDoc(e.clientX, e.clientY);
      const l = hitTest(d.x, d.y);
      if (l) {
        if (B.sel !== l.id) { B.sel = l.id; draw(); renderLayers(); renderProps(); }
        pushHistory();
        B.mode = { k: 'move', id: l.id, sx: e.clientX, sy: e.clientY, x0: l.x, y0: l.y };
      } else {
        B.sel = null; B.mode = null;
        draw(); renderLayers(); renderProps();
      }
    } else if (B.pointers.size === 2 && B.sel) {
      const l = sel(); if (!l) return;
      const [a, b] = [...B.pointers.values()];
      pushHistory();
      B.mode = null;
      B.pinch = {
        l, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        a0: Math.atan2(b.y - a.y, b.x - a.x),
        mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
        x0: l.x, y0: l.y, s0: l.s || 1, r0: l.r || 0
      };
    }
  }

  function onMove(e) {
    if (!B.active) return;
    const pt = B.pointers.get(e.pointerId);
    if (!pt) return;
    pt.x = e.clientX; pt.y = e.clientY; e.preventDefault();
    if (B.pointers.size >= 2 && B.pinch) {
      const [a, b] = [...B.pointers.values()];
      const p = B.pinch, l = p.l;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      l.s = clamp(p.s0 * d / p.d0, .02, 30);
      l.r = p.r0 + (ang - p.a0);
      l.x = p.x0 + (mx - p.mx) / B.scale;
      l.y = p.y0 + (my - p.my) / B.scale;
      draw(); renderProps();
      return;
    }
    if (B.mode && B.mode.k === 'move') {
      const l = sel(); if (!l) return;
      l.x = B.mode.x0 + (e.clientX - B.mode.sx) / B.scale;
      l.y = B.mode.y0 + (e.clientY - B.mode.sy) / B.scale;
      draw(); renderProps();
    }
  }

  function onUp(e) {
    if (!B.active) return;
    B.pointers.delete(e.pointerId);
    if (B.pointers.size === 0) {
      const was = B.mode || B.pinch;
      B.mode = null; B.pinch = null;
      if (was) { renderProps(); scheduleSave(); }
    } else if (B.pointers.size === 1) {
      B.pinch = null;
      B.mode = null;
    }
  }

  /* ── 面板 ── */
  function thumbFor(l) {
    if (l.kind === 'img' && l.img) {
      if (!l._thumb) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d');
        const k = Math.min(58 / l.w, 58 / l.h, 1);
        const w = l.w * k, h = l.h * k;
        g.drawImage(l.img, (64 - w) / 2, (64 - h) / 2, w, h);
        l._thumb = c.toDataURL('image/png');
      }
      return `<img src="${l._thumb}" alt="">`;
    }
    if (l.kind === 'text') return `<span class="txt">T</span>`;
    return `<span class="txt">${SHAPE_ICON[l.shape] || '▭'}</span>`;
  }

  function renderLayers() {
    const box = $('bdLayerList'); if (!box) return;
    const count = $('bdLayerCount'); if (count) count.textContent = String(B.layers.length);
    box.innerHTML = '';
    for (let i = B.layers.length - 1; i >= 0; i--) {
      const l = B.layers[i];
      const row = document.createElement('div');
      row.className = 'bdLayerRow' + (l.id === B.sel ? ' on' : '');
      row.dataset.id = l.id;
      row.innerHTML = `
        <div class="thumb ${l.kind}">${thumbFor(l)}</div>
        <b>${escapeHtml(l.name || '图层')}</b>
        <span class="lyrActs">
          <button data-l="vis" class="${l.vis === false ? 'off' : ''}" title="显示 / 隐藏" type="button">${l.vis === false ? '○' : '●'}</button>
          <button data-l="lock" class="${l.lock ? 'off' : ''}" title="锁定" type="button">${l.lock ? '▣' : '▢'}</button>
        </span>`;
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        B.sel = l.id; draw(); renderLayers(); renderProps();
      });
      row.querySelector('[data-l="vis"]').addEventListener('click', (e) => {
        e.stopPropagation(); pushHistory(); l.vis = l.vis === false; draw(); renderLayers(); scheduleSave();
      });
      row.querySelector('[data-l="lock"]').addEventListener('click', (e) => {
        e.stopPropagation(); pushHistory(); l.lock = !l.lock; draw(); renderLayers(); renderProps(); scheduleSave();
      });
      box.appendChild(row);
    }
    if (!B.layers.length) box.innerHTML = '<p class="bdSideEmpty">画板还是空的。<br>从左边素材库点一个元素进来。</p>';
  }

  function renderProps() {
    const box = $('bdProps'); if (!box) return;
    const l = sel();
    if (!l) { box.innerHTML = '<h4>属性</h4><p class="bdSideEmpty">选中一个图层，<br>这里可以调透明度和角度。</p>'; return; }
    const op = Math.round((l.op == null ? 1 : l.op) * 100);
    const rot = deg(l.r || 0);
    const sc = Math.round((l.s || 1) * 100);
    let extra = '';
    if (l.kind === 'text') {
      extra = `<div class="propBtns"><button class="btn tiny" data-p="edit" type="button">编辑文字</button></div>
        <div class="propRow"><span>颜色</span><input type="color" data-p="color" value="${l.color || '#111318'}" style="width:34px;height:24px;padding:0;border:0;background:none"><b></b></div>`;
    } else if (l.kind === 'shape') {
      extra = `<div class="propRow"><span>填充</span><input type="color" data-p="fill" value="${l.fill && l.fill !== 'none' ? l.fill : '#ff5a2a'}"><label class="loginCheck" style="margin:0"><input type="checkbox" data-p="hollow" ${l.fill === 'none' ? 'checked' : ''}> 空心</label></div>
        <div class="propRow"><span>描边</span><input type="color" data-p="lineColor" value="${l.lineColor || '#111318'}"><input type="range" data-p="lineW" min="0" max="40" step="1" value="${l.lineW || 0}"><b>${l.lineW || 0}</b></div>
        ${l.shape === 'round' ? `<div class="propRow"><span>圆角</span><input type="range" data-p="radius" min="0" max="200" step="1" value="${l.radius || 0}"><b>${l.radius || 0}</b></div>` : ''}
        ${l.shape === 'star' ? `<div class="propRow"><span>角数</span><input type="range" data-p="points" min="3" max="20" step="1" value="${l.points || 5}"><b>${l.points || 5}</b></div>` : ''}`;
    }
    box.innerHTML = `<h4>${escapeHtml(l.name || '图层')}</h4>
      <div class="propRow"><span>透明</span><input type="range" data-p="op" min="0" max="100" step="1" value="${op}"><b>${op}%</b></div>
      <div class="propRow"><span>角度</span><input type="range" data-p="rot" min="-180" max="180" step="1" value="${rot}"><b>${rot}°</b></div>
      <div class="propRow"><span>大小</span><input type="range" data-p="scale" min="2" max="400" step="1" value="${sc}"><b>${sc}%</b></div>
      ${extra}
      <div class="propBtns">
        <button class="btn tiny" data-p="up" type="button">上移</button>
        <button class="btn tiny" data-p="down" type="button">下移</button>
        <button class="btn tiny" data-p="top" type="button">置顶</button>
        <button class="btn tiny" data-p="bottom" type="button">置底</button>
        <button class="btn tiny" data-p="dup" type="button">复制</button>
        <button class="btn tiny danger" data-p="del" type="button">删除</button>
      </div>`;

    box.oninput = (e) => {
      const p = e.target.dataset.p; if (!p) return;
      const v = e.target.value;
      pushHistoryThrottled();
      if (p === 'op') { l.op = +v / 100; e.target.nextElementSibling.textContent = v + '%'; }
      else if (p === 'rot') { l.r = rad(+v); e.target.nextElementSibling.textContent = v + '°'; }
      else if (p === 'scale') { l.s = +v / 100; e.target.nextElementSibling.textContent = v + '%'; }
      else if (p === 'fill') l.fill = v;
      else if (p === 'lineColor') l.lineColor = v;
      else if (p === 'lineW') { l.lineW = +v; e.target.nextElementSibling.textContent = v; }
      else if (p === 'radius') { l.radius = +v; e.target.nextElementSibling.textContent = v; }
      else if (p === 'points') { l.points = +v; e.target.nextElementSibling.textContent = v; }
      else if (p === 'color') l.color = v;
      draw(); scheduleSave();
    };
    box.onchange = (e) => {
      const p = e.target.dataset.p;
      if (p === 'hollow') { pushHistory(); l.fill = e.target.checked ? 'none' : '#ff5a2a'; if (e.target.checked && !l.lineW) l.lineW = 6; draw(); renderProps(); scheduleSave(); }
    };
    box.querySelectorAll('button[data-p]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.p;
        if (p === 'edit') openTextEditor(l);
        else if (p === 'up' || p === 'down' || p === 'top' || p === 'bottom') orderSel(p);
        else if (p === 'dup') duplicateSel();
        else if (p === 'del') removeSel();
      });
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function refreshAssets() {
    const grid = $('bdAssetGrid'); if (!grid) return;
    for (const u of assetUrls) { try { URL.revokeObjectURL(u); } catch (e) { } }
    assetUrls = [];
    const items = await PPStore.list(PPApp.session().uid);
    const count = $('bdAssetsCount'); if (count) count.textContent = String(items.length);
    const empty = $('bdAssetsEmpty'); if (empty) empty.hidden = !!items.length;
    grid.innerHTML = '';
    for (const item of items) {
      const u = URL.createObjectURL(item.blob);
      assetUrls.push(u);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = item.name + ' · ' + item.w + '×' + item.h;
      btn.innerHTML = `<img src="${u}" alt="${escapeHtml(item.name)}">`;
      btn.addEventListener('click', async () => {
        await addItem(item);
        if (window.innerWidth <= 900) $('bdAssets').classList.remove('open');
      });
      grid.appendChild(btn);
    }
  }

  /* ── 文字弹窗 ── */
  function openTextEditor(layer) {
    editingId = layer ? layer.id : null;
    $('textTitle').textContent = layer ? '编辑文字' : '添加文字';
    $('textBody').value = layer ? layer.text : '';
    $('textSize').value = String(layer ? layer.size : 88);
    $('textSizeV').textContent = String(layer ? layer.size : 88);
    $('textColor').value = /^#[0-9a-f]{6}$/i.test(layer ? layer.color : '') ? layer.color : '#111318';
    $('textFont').value = layer ? layer.font : 'sans';
    $('textWeight').value = String(layer ? layer.weight : 700);
    $('textModal').hidden = false;
    document.body.classList.add('lock');
    setTimeout(() => $('textBody').focus(), 40);
  }
  function closeTextEditor() {
    $('textModal').hidden = true;
    document.body.classList.remove('lock');
    editingId = null;
  }
  function commitText() {
    const text = $('textBody').value;
    if (!text.trim()) { PPApp.toast('先写点文字'); return; }
    const opts = {
      size: clamp(+$('textSize').value || 88, 12, 300),
      color: $('textColor').value, font: $('textFont').value, weight: +$('textWeight').value || 700
    };
    if (editingId != null) {
      const l = B.layers.find(x => x.id === editingId);
      if (l) {
        pushHistory();
        l.text = text.trim(); l.size = opts.size; l.color = opts.color; l.font = opts.font; l.weight = opts.weight;
        measureText(l); draw(); renderLayers(); renderProps(); scheduleSave();
      }
    } else {
      addTextLayer(text, opts);
    }
    closeTextEditor();
  }

  /* ── 尺寸 / 存档 ── */
  function setSize(w, h) {
    w = clamp(Math.round(w), 120, 4096); h = clamp(Math.round(h), 120, 4096);
    pushHistory();
    B.W = w; B.H = h;
    resize(); renderProps(); scheduleSave();
  }

  function serialize() {
    return {
      v: 1, W: B.W, H: B.H, bg: B.bg,
      layers: B.layers.map(l => ({
        id: l.id, kind: l.kind, name: l.name, x: l.x, y: l.y, s: l.s, r: l.r, op: l.op,
        vis: l.vis !== false, lock: !!l.lock, w: l.w, h: l.h, blob: l.blob || null,
        text: l.text, size: l.size, color: l.color, font: l.font, weight: l.weight, align: l.align,
        shape: l.shape, fill: l.fill, lineColor: l.lineColor, lineW: l.lineW, radius: l.radius, points: l.points
      }))
    };
  }
  function scheduleSave() {
    if (!B.uid) return;
    clearTimeout(B.saveTimer);
    B.saveTimer = setTimeout(flushSave, 500);
  }
  async function flushSave() {
    clearTimeout(B.saveTimer);
    if (!B.uid || !B.loaded) return;
    await PPStore.saveBoard(B.uid, serialize());
  }

  async function loadFor(uid) {
    if (!uid) return;
    if (B.uid === uid && B.loaded) return;
    await flushSave();
    B.uid = uid; B.loaded = false;
    B.layers = []; B.sel = null; B.hist = []; B.hi = -1; B.pointers.clear();
    const rec = await PPStore.getBoard(uid);
    if (rec) {
      B.W = clamp(rec.W || 1080, 120, 4096);
      B.H = clamp(rec.H || 1080, 120, 4096);
      B.bg = rec.bg || '#f7f4ed';
      for (const x of (rec.layers || [])) {
        const l = { ...x };
        if (l.kind === 'img' && l.blob) {
          l.img = await loadImage(l.blob);
          if (!l.img) continue;
        }
        if (l.kind === 'text') measureText(l);
        B.layers.push(l);
      }
      nextId = Math.max(1, ...B.layers.map(l => l.id || 0)) + 1;
      B.hist = [B.layers.map(l => ({ ...l }))]; B.hi = 0;
    } else {
      B.W = 1080; B.H = 1080; B.bg = '#f7f4ed';
      B.hist = [[]]; B.hi = 0;
    }
    B.loaded = true;
    const sz = $('bdSize');
    if (sz) {
      const key = B.W + 'x' + B.H;
      sz.value = [...sz.options].some(o => o.value === key) ? key : 'custom';
    }
    const bg = $('bdBg'); if (bg && /^#[0-9a-f]{6}$/i.test(B.bg)) bg.value = B.bg;
    draw(); renderLayers(); renderProps(); refreshAssets();
    requestAnimationFrame(resize);
  }

  /* ── 交互绑定 ── */
  function bind() {
    canvas = $('bdCanvas'); ctx = canvas && canvas.getContext('2d');
    stage = $('bdStage'); handlesEl = $('bdHandles');
    if (!canvas || !stage) return;

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('dblclick', (e) => {
      const d = toDoc(e.clientX, e.clientY);
      const l = hitTest(d.x, d.y);
      if (l && l.kind === 'text') { B.sel = l.id; draw(); renderLayers(); renderProps(); openTextEditor(l); }
    });

    $('bdText').onclick = () => openTextEditor(null);
    $('textGo').onclick = commitText;
    $('textSize').addEventListener('input', (e) => { $('textSizeV').textContent = e.target.value; });

    const shapeBtn = $('bdShapeBtn'), shapeMenu = $('bdShapeMenu');
    shapeBtn.onclick = (e) => {
      e.stopPropagation();
      const on = shapeMenu.classList.toggle('on');
      if (on) {
        const r = shapeBtn.getBoundingClientRect();
        shapeMenu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 150)) + 'px';
        shapeMenu.style.top = Math.min(window.innerHeight - 280, r.bottom + 6) + 'px';
      }
    };
    shapeMenu.querySelectorAll('[data-shape]').forEach(b => b.addEventListener('click', () => { addShape(b.dataset.shape); shapeMenu.classList.remove('on'); }));
    document.addEventListener('click', (e) => { if (!e.target.closest('.shapeMenuWrap')) shapeMenu.classList.remove('on'); });

    $('bdUndo').onclick = undo;
    $('bdRedo').onclick = redo;
    $('bdExport').onclick = exportPng;
    $('bdExportMobile').onclick = exportPng;
    $('bdClear').onclick = async () => {
      if (await PPApp.confirm('清空画板？', '画板上的图层会全部移除，元素库不受影响。')) {
        pushHistory(); B.layers = []; B.sel = null;
        draw(); renderLayers(); renderProps(); scheduleSave();
      }
    };

    $('bdSize').onchange = (e) => {
      if (e.target.value === 'custom') { $('sizeModal').hidden = false; document.body.classList.add('lock'); return; }
      const [w, h] = e.target.value.split('x').map(Number);
      setSize(w, h);
    };
    $('sizeGo').onclick = () => {
      setSize(+$('sizeW').value || 1080, +$('sizeH').value || 1080);
      $('sizeModal').hidden = true; document.body.classList.remove('lock');
    };
    $('bdBg').oninput = (e) => { B.bg = e.target.value; draw(); scheduleSave(); };
    const bgClear = $('bdBgClear');
    if (bgClear) bgClear.onclick = () => { B.bg = 'transparent'; draw(); scheduleSave(); };

    $('bdAssetsBtn').onclick = () => {
      if (window.innerWidth <= 900) { $('bdAssets').classList.toggle('open'); $('bdLayers').classList.remove('open'); }
      else PPApp.toast('素材库就在画板左侧');
    };
    $('bdAssetsMobile').onclick = () => { $('bdAssets').classList.toggle('open'); $('bdLayers').classList.remove('open'); };
    $('bdLayersMobile').onclick = () => { $('bdLayers').classList.toggle('open'); $('bdAssets').classList.remove('open'); };
    const up = $('bdUpload');
    if (up) up.onclick = () => $('bdFile').click();
    const bf = $('bdFile');
    if (bf) bf.onchange = () => { for (const f of [...bf.files]) addUpload(f); bf.value = ''; };

    window.addEventListener('resize', () => { if (B.active) resize(); });
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => { if (B.active) resize(); });
      ro.observe($('bdStageWrap'));
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
    document.addEventListener('keydown', (e) => {
      if (!B.active || PPApp.view() !== 'board') return;
      const t = document.activeElement;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key.startsWith('Arrow') && sel()) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const l = sel();
        if (e.key === 'ArrowLeft') l.x -= step;
        if (e.key === 'ArrowRight') l.x += step;
        if (e.key === 'ArrowUp') l.y -= step;
        if (e.key === 'ArrowDown') l.y += step;
        draw(); renderProps(); scheduleSave();
      }
    });
  }

  async function exportPng() {
    const c = document.createElement('canvas');
    c.width = B.W; c.height = B.H;
    const g = c.getContext('2d');
    paint(g);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    if (!blob) { PPApp.toast('导出失败'); return; }
    const a = document.createElement('a');
    const stamp = new Date().toLocaleString('sv').replace(/[: ]/g, '-');
    a.download = `pixpeel-board-${stamp}.png`;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    PPApp.toast('已导出 PNG');
  }

  window.PPBoard = {
    init: async function () { bind(); await loadFor(PPApp.session().uid); },
    activate() {
      B.active = true;
      if (B.uid !== PPApp.session().uid) loadFor(PPApp.session().uid);
      else { refreshAssets(); requestAnimationFrame(resize); }
    },
    deactivate() { B.active = false; flushSave(); },
    switchUser(uid) { B.active = true; B.loaded = false; return loadFor(uid); },
    addItem, addUpload, refreshAssets, resize, flushSave, draw,
    get layers() { return B.layers; }
  };
})();
