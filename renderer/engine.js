/* PixPeel 拆元素引擎（与“小剪动画”里的拆元素同一套算法）。纯前端，无依赖。 */
const uid=()=>Math.random().toString(36).slice(2,10);
const _yield=()=>new Promise(r=>{const c=new MessageChannel();c.port1.onmessage=()=>r();c.port2.postMessage(0)});
const SEG={src:null,layers:[],sel:new Set(),hov:null,tool:'pick',mode:'new',tol:40,merge:6,minA:.15,how:'auto',K:6,fromClip:null,lasso:null,ai:null,busy:false,seq:1,
  aiPts:[],aiLayer:null,aiNeg:false,
  tiles:[],cur:0,wall:{w:0,h:0},gap:18,tileH:520};

/* ── 清空一次导入的全部状态 ──
 * 每次重新导入 / 截图 / 清空画布都要先走这里：
 *   ① 释放每块图的 canvas 和像素数组（不释放的话反复导入内存只涨不降，越来越卡）
 *   ② 清掉图层的蒙版 / 缩略图缓存
 *   ③ 序号归 1（以前只增不减，所以第二次导入会从「元素 7」接着数）
 * AI worker 不销毁：模型下过一次就留着，只把「已嵌入的图」标记清掉，
 * 否则下次点选会用上一张图的 embedding。 */
function segReset(){
  for(const tl of SEG.tiles){
    const s=tl&&tl.src;
    if(!s)continue;
    if(s.cv){try{s.cv.width=0;s.cv.height=0}catch(e){}}
    s.cv=null;s.data=null;
  }
  for(const L of SEG.layers){L.m=null;L.mp=null;L.tint=null;L._cuts=null;L._srcCv=null;}
  SEG.src=null;SEG.layers=[];SEG.tiles=[];SEG.cur=0;SEG.wall={w:0,h:0};
  SEG.sel.clear();SEG.hov=null;SEG.lasso=null;SEG.fromClip=null;SEG.name='';
  SEG.aiPts=[];SEG.aiLayer=null;SEG.aiNeg=false;
  SEG.seq=1;
  if(SEG.ai){SEG.ai.embedded=false;SEG.ai.raw=null;SEG.ai.gen=(SEG.ai.gen||0)+1;}
}

/* ── 多图拼贴墙：批量导入的图统一缩放、均分网格铺在一张大画布上 ── */
function segAddTile(src,name){
  const t={id:uid(),name:name||t('image'),src,w:src.w,h:src.h,x:0,y:0,sc:1};
  SEG.tiles.push(t);segLayout();return t;
}
function segLayout(){
  const ts=SEG.tiles;if(!ts.length){SEG.wall={w:0,h:0};return}
  const GAP=SEG.gap;
  /* 所有图统一缩放（大小一致才好看），但高度按实际内容算，别留空白 */
  let sc=1;for(const t of ts)sc=Math.min(sc,SEG.tileH/t.h);
  let tw=0;for(const t of ts){t.sc=sc;tw=Math.max(tw,t.w*sc)}
  const cols=Math.max(1,Math.ceil(Math.sqrt(ts.length))),rows=Math.ceil(ts.length/cols);
  const rowH=[];ts.forEach((t,i)=>{const r=Math.floor(i/cols);rowH[r]=Math.max(rowH[r]||0,t.h*t.sc)});
  ts.forEach((t,i)=>{const r=Math.floor(i/cols);t.x=(i%cols)*(tw+GAP);t.y=rowH.slice(0,r).reduce((a,b)=>a+b+GAP,0)});
  SEG.wall={w:cols*(tw+GAP)-GAP,h:rowH.reduce((a,b)=>a+b+GAP,0)-GAP};
}
/** 画布坐标 → 落在哪张图上 */
function segTileAt(wx,wy){
  for(const t of SEG.tiles){if(wx>=t.x&&wy>=t.y&&wx<t.x+t.w*t.sc&&wy<t.y+t.h*t.sc)return t}
  return null;
}
function segCurTile(){return SEG.tiles[SEG.cur]||null}
const SEGCOL=['#ff5d8f','#4dd0e1','#ffd54f','#9ccc65','#b388ff','#ff8a65','#4db6ac','#f06292','#7986cb','#aed581','#ffb74d','#4fc3f7'];
function segPrep(el,w,h){
  const s=Math.min(1,1600/Math.max(w,h)),W=Math.max(1,Math.round(w*s)),H=Math.max(1,Math.round(h*s));
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;const g=cv.getContext('2d',{willReadFrequently:true});g.drawImage(el,0,0,W,H);
  const id=g.getImageData(0,0,W,H);return{w:W,h:H,data:id.data,cv};
}
/* 膨胀（盒形，行列各一遍） */
function segDil(m,w,h,r){
  if(r<=0)return m;
  const t=new Uint8Array(w*h),o=new Uint8Array(w*h),ps=new Int32Array(Math.max(w,h)+1);
  for(let y=0;y<h;y++){const row=y*w;ps[0]=0;for(let x=0;x<w;x++)ps[x+1]=ps[x]+m[row+x];
    for(let x=0;x<w;x++)t[row+x]=ps[Math.min(w,x+r+1)]-ps[Math.max(0,x-r)]>0?1:0}
  for(let x=0;x<w;x++){ps[0]=0;for(let y=0;y<h;y++)ps[y+1]=ps[y]+t[y*w+x];
    for(let y=0;y<h;y++)o[y*w+x]=ps[Math.min(h,y+r+1)]-ps[Math.max(0,y-r)]>0?1:0}
  return o;
}
function segErode(m,w,h,r){const inv=new Uint8Array(w*h);for(let i=0;i<inv.length;i++)inv[i]=m[i]?0:1;const d=segDil(inv,w,h,r);const o=new Uint8Array(w*h);for(let i=0;i<o.length;i++)o[i]=d[i]?0:1;return o}
/* 8 连通域 */
function segCC(m,w,h){
  const n=w*h,lab=new Int32Array(n),st=new Int32Array(n),comps=[null];let cnt=0;
  for(let i=0;i<n;i++){
    if(!m[i]||lab[i])continue;
    cnt++;let sp=0,area=0,x0=w,y0=h,x1=0,y1=0;st[sp++]=i;lab[i]=cnt;
    while(sp){
      const p=st[--sp],x=p%w,y=(p/w)|0;area++;
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      for(let dy=-1;dy<=1;dy++){const ny=y+dy;if(ny<0||ny>=h)continue;
        for(let dx=-1;dx<=1;dx++){const nx=x+dx;if(nx<0||nx>=w)continue;const q=ny*w+nx;if(m[q]&&!lab[q]){lab[q]=cnt;st[sp++]=q}}}
    }
    comps.push({area,x0,y0,x1,y1});
  }
  return{lab,n:cnt,comps};
}
function segLayerFromFull(full,w,h,name){
  let x0=w,y0=h,x1=-1,y1=-1,area=0;
  for(let y=0;y<h;y++){const row=y*w;for(let x=0;x<w;x++)if(full[row+x]){area++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
  if(!area)return null;
  const bw=x1-x0+1,bh=y1-y0+1,m=new Uint8Array(bw*bh);
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++)m[y*bw+x]=full[(y0+y)*w+x0+x];
  return segMk({bx:x0,by:y0,bw,bh,m,area,name});
}
/** 切语言时，把自动命名的元素重新本地化（用户手动改过名字的不动）。返回有没有改动 */
function relabelLayers() {
  let n = 0;
  for (const L of (SEG.layers || [])) {
    let nm = null;
    if (L.autoName != null) nm = t('elem') + ' ' + L.autoName;
    else if (L.autoKind) nm = t(L.autoKind === 'line' ? 'kindLine' : 'kindText', { n: L.autoKindN || 1 });
    else continue;
    if (L.name !== nm) { L.name = nm; n++; }
  }
  return n > 0;
}
function segMk(o){
  const L=Object.assign({id:uid(),on:true},o);
  if(!L.name){L.name=t('elem')+' '+(SEG.seq++);L.autoName=SEG.seq-1;}   /* 自动命名：记下序号，切语言时能重新本地化 */
  L.color=SEGCOL[(SEG.layers.length+SEG.seq)%SEGCOL.length];
  const c=document.createElement('canvas');c.width=L.bw;c.height=L.bh;const g=c.getContext('2d'),id=g.createImageData(L.bw,L.bh);
  const rgb=[parseInt(L.color.slice(1,3),16),parseInt(L.color.slice(3,5),16),parseInt(L.color.slice(5,7),16)];
  for(let i=0;i<L.m.length;i++)if(L.m[i]){const j=i*4;id.data[j]=rgb[0];id.data[j+1]=rgb[1];id.data[j+2]=rgb[2];id.data[j+3]=255}
  g.putImageData(id,0,0);L.tint=c;return L;
}
function segFull(L){const {w,h}=SEG.src,f=new Uint8Array(w*h);for(let y=0;y<L.bh;y++)for(let x=0;x<L.bw;x++)if(L.m[y*L.bw+x])f[(L.by+y)*w+L.bx+x]=1;return f}
/* 取出前景（透明度 / 背景色） */
function segFg(img,tol){
  const {w,h,data}=img,n=w*h,fg=new Uint8Array(n);let tr=0;
  for(let i=0;i<n;i++)if(data[i*4+3]<24)tr++;
  if(tr>n*.02){for(let i=0;i<n;i++)fg[i]=data[i*4+3]>=24?1:0;return{fg,mode:'alpha'}}
  const hist=new Map(),bd=[];
  const take=p=>{const j=p*4,key=(data[j]>>4)<<8|(data[j+1]>>4)<<4|(data[j+2]>>4);hist.set(key,(hist.get(key)||0)+1);bd.push(p)};
  for(let x=0;x<w;x++){take(x);take((h-1)*w+x)}for(let y=1;y<h-1;y++){take(y*w);take(y*w+w-1)}
  let best=-1,bc=0;for(const [k,c] of hist)if(c>bc){bc=c;best=k}
  let r=0,g=0,b=0,c=0;for(const p of bd){const j=p*4,key=(data[j]>>4)<<8|(data[j+1]>>4)<<4|(data[j+2]>>4);if(key===best){r+=data[j];g+=data[j+1];b+=data[j+2];c++}}
  r/=c;g/=c;b/=c;
  const t2=tol*tol,near=p=>{const j=p*4;if(data[j+3]<24)return true;const dr=data[j]-r,dg=data[j+1]-g,db=data[j+2]-b;return dr*dr+dg*dg+db*db<=t2};
  let okb=0;for(const p of bd)if(near(p))okb++;
  if(okb<bd.length*.6)return{fg:null,mode:'color'};
  const bgm=new Uint8Array(n),st=new Int32Array(n);let sp=0;
  for(const p of bd)if(near(p)&&!bgm[p]){bgm[p]=1;st[sp++]=p}
  while(sp){const p=st[--sp],x=p%w,y=(p/w)|0;
    if(x>0&&!bgm[p-1]&&near(p-1)){bgm[p-1]=1;st[sp++]=p-1}
    if(x<w-1&&!bgm[p+1]&&near(p+1)){bgm[p+1]=1;st[sp++]=p+1}
    if(y>0&&!bgm[p-w]&&near(p-w)){bgm[p-w]=1;st[sp++]=p-w}
    if(y<h-1&&!bgm[p+w]&&near(p+w)){bgm[p+w]=1;st[sp++]=p+w}}
  for(let i=0;i<n;i++)fg[i]=bgm[i]?0:1;
  return{fg,mode:'bg',bg:[r,g,b]};
}
/* 带外框的截图 / 海报：外面一圈深色边框把整张图围起来，普通「从边缘去背景」
 * 只能去掉框外面的颜色，框里面全被当成前景连成一块，最后只剩一个「元素」。
 * 这种情况（前景铺满整图 + 背景模式）改用内部主色当背景，把大面积的同色区域去掉。 */
function segInnerBg(img, fg, tol) {
  const { w, h, data } = img, n = w * h;
  const q = (i) => { const j = i * 4; return ((data[j] >> 4) << 8) | ((data[j + 1] >> 4) << 4) | (data[j + 2] >> 4); };
  const hist = new Map();
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (!fg[i] || data[i * 4 + 3] < 24) continue;
    const k = q(i); hist.set(k, (hist.get(k) || 0) + 1); total++;
  }
  if (!total) return null;
  let best = -1, bc = 0;
  for (const [k, c] of hist) if (c > bc) { bc = c; best = k; }
  if (bc < total * 0.25) return null;          /* 没有明显主色，可能真的是照片 */
  let r = 0, g = 0, b = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    if (!fg[i] || q(i) !== best) continue;
    const j = i * 4; r += data[j]; g += data[j + 1]; b += data[j + 2]; cnt++;
  }
  if (!cnt) return null;
  r /= cnt; g /= cnt; b /= cnt;
  const t = Math.max(32, Math.min(90, (tol || 24) * 1.5)), t2 = t * t;
  const out = new Uint8Array(n);
  let kept = 0, gone = 0;
  for (let i = 0; i < n; i++) {
    if (!fg[i]) continue;
    const j = i * 4, dr = data[j] - r, dg = data[j + 1] - g, db = data[j + 2] - b;
    if (data[j + 3] >= 24 && dr * dr + dg * dg + db * db <= t2) gone++;
    else { out[i] = 1; kept++; }
  }
  if (!kept || gone < total * 0.15) return null;
  return out;
}
function segKmeans(img,K){
  const {w,h,data}=img,n=w*h,step=Math.max(1,Math.floor(n/6000)),S_=[];
  for(let i=0;i<n;i+=step)S_.push([data[i*4],data[i*4+1],data[i*4+2]]);
  const C=[S_[0].slice()];
  while(C.length<K){let bi=0,bd=-1;S_.forEach((s,i)=>{let d=1e9;for(const c of C){const e=(s[0]-c[0])**2+(s[1]-c[1])**2+(s[2]-c[2])**2;if(e<d)d=e}if(d>bd){bd=d;bi=i}});C.push(S_[bi].slice())}
  for(let it=0;it<8;it++){
    const sum=C.map(()=>[0,0,0,0]);
    for(const s of S_){let bi=0,bd=1e9;C.forEach((c,i)=>{const e=(s[0]-c[0])**2+(s[1]-c[1])**2+(s[2]-c[2])**2;if(e<bd){bd=e;bi=i}});const q=sum[bi];q[0]+=s[0];q[1]+=s[1];q[2]+=s[2];q[3]++}
    sum.forEach((q,i)=>{if(q[3])C[i]=[q[0]/q[3],q[1]/q[3],q[2]/q[3]]});
  }
  const lab=new Uint8Array(n);
  for(let i=0;i<n;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2];let bi=0,bd=1e9;for(let k=0;k<C.length;k++){const c=C[k],e=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2;if(e<bd){bd=e;bi=k}}lab[i]=bi}
  return{lab,K:C.length};
}
async function segAuto(){
  const img=SEG.src,{w,h}=img,n=w*h,minA=Math.max(8,SEG.minA/100*n),out=[];
  let how=SEG.how,info='';
  let f=null;
  if(how!=='color'){f=segFg(img,SEG.tol);if(f.mode==='color'){if(how==='auto'){how='color';info=t('eInfoColor')}else f=null}else info=f.mode==='alpha'?t('eAlpha'):t('eBgDone')}
  /* 前景几乎铺满整张图 = 被外框包住了，改用内部主色再分一次（见 segInnerBg） */
  if(f&&f.mode==='bg'&&f.fg){
    const cc0=segCC(f.fg,w,h);let big=0;
    for(let q=1;q<=cc0.n;q++)if(cc0.comps[q].area>big)big=cc0.comps[q].area;
    if(big>n*0.85){const f2=segInnerBg(img,f.fg,SEG.tol);if(f2){f={fg:f2,mode:'bg'};info=t('eBgInner')}}
  }
  if(how==='color'||!f||!f.fg){
    const km=segKmeans(img,SEG.K);
    for(let k=0;k<km.K;k++){
      const m=new Uint8Array(n);let any=0;for(let i=0;i<n;i++)if(km.lab[i]===k){m[i]=1;any++}
      if(any<minA)continue;
      const cc=segCC(m,w,h);
      for(let q=1;q<=cc.n;q++){const cp=cc.comps[q];if(cp.area<minA)continue;
        const bw=cp.x1-cp.x0+1,bh=cp.y1-cp.y0+1,mm=new Uint8Array(bw*bh);
        for(let y=0;y<bh;y++)for(let x=0;x<bw;x++)if(cc.lab[(cp.y0+y)*w+cp.x0+x]===q)mm[y*bw+x]=1;
        out.push({bx:cp.x0,by:cp.y0,bw,bh,m:mm,area:cp.area});
      }
      await _yield();
    }
  }else{
    const dm=segDil(f.fg,w,h,SEG.merge),cc=segCC(dm,w,h);
    for(let q=1;q<=cc.n;q++){
      const cp=cc.comps[q],bw=cp.x1-cp.x0+1,bh=cp.y1-cp.y0+1,mm=new Uint8Array(bw*bh);let area=0;
      for(let y=0;y<bh;y++){const ro=(cp.y0+y)*w+cp.x0;for(let x=0;x<bw;x++){if(cc.lab[ro+x]===q&&f.fg[ro+x]){mm[y*bw+x]=1;area++}}}
      if(area<minA)continue;
      out.push({bx:cp.x0,by:cp.y0,bw,bh,m:mm,area});
    }
  }
  out.sort((a,b)=>b.area-a.area);
  /* 批量拆解时只清掉「当前这张图」的旧元素，其它图的结果要留着 */
  SEG.layers=SEG.layers.filter(l=>l.tile!==SEG.cur);SEG.sel.clear();
  for(const o of out.slice(0,60)){const L=segMk(o);L.tile=SEG.cur;SEG.layers.push(L);}
  return info+(out.length>60?t('eTooMany'):'');
}
/* ── 自动文字 / 线条整理 ──
 * 拆解出来的单个字母、汉字笔画、分割线常常是一小块一小块的。
 * 这里做两件不破坏原图的事：
 *   ① 细长条认成「线条」，按顺序命名；
 *   ② 同一行、高度接近、间距很小的碎块合并成一个「文字块」。
 * 由用户点按钮触发，自动拆分本身不会偷偷合并。 */
function segGroupText(){
  const {w,h}=SEG.src,cur=SEG.cur;
  if(!SEG.layers.length)return{t:0,l:0};
  let lines=0;
  for(const L of SEG.layers){
    if(L.tile!==cur)continue;
    const ar=Math.max(L.bw/L.bh,L.bh/L.bw),th=Math.min(L.bw,L.bh);
    if(ar>=7&&th<=Math.max(8,Math.min(w,h)*0.02)&&L.autoName!=null){L.autoKind='line';L.autoKindN=++lines;L.autoName=null;L.name=t('kindLine',{n:lines})}
  }
  const maxS=Math.max(24,Math.min(w,h)*0.22);
  const cand=SEG.layers.filter(L=>L.tile===cur&&L.autoKind!=='line'&&L.bw<=w*0.32&&L.bh<=h*0.28&&Math.max(L.bw,L.bh)<=maxS);
  const used=new Set();let blocks=0;
  for(let i=0;i<cand.length;i++){
    const A=cand[i];if(used.has(A))continue;
    const group=[A],ay=A.by+A.bh/2;
    for(let j=i+1;j<cand.length;j++){
      const B=cand[j];if(used.has(B))continue;
      const by=B.by+B.bh/2;
      if(Math.abs(by-ay)>Math.max(4,Math.min(A.bh,B.bh)*0.9))continue;
      if(Math.min(A.bh,B.bh)/Math.max(A.bh,B.bh)<0.45)continue;
      const gap=Math.max(B.bx-(A.bx+A.bw),A.bx-(B.bx+B.bw));
      if(gap>Math.max(6,Math.max(A.bh,B.bh)*1.4))continue;
      group.push(B);
    }
    if(group.length<2)continue;
    const full=new Uint8Array(w*h);
    for(const L of group){
      used.add(L);
      for(let y=0;y<L.bh;y++)for(let x=0;x<L.bw;x++)if(L.m[y*L.bw+x])full[(L.by+y)*w+L.bx+x]=1;
    }
    const nl=segLayerFromFull(full,w,h);if(!nl)continue;
    nl.tile=cur;nl.on=A.on;nl.color=A.color;nl.manual=true;nl.autoName=null;
    nl.autoKind='text';nl.autoKindN=++blocks;nl.name=t('kindText',{n:blocks});
    const idx=Math.min(...group.map(L=>SEG.layers.indexOf(L)));
    SEG.layers=SEG.layers.filter(L=>!group.includes(L));
    SEG.layers.splice(Math.max(0,Math.min(idx,SEG.layers.length)),0,nl);
  }
  return{t:blocks,l:lines};
}
/* 魔棒 */
function segWand(x,y,tol){
  const {w,h,data}=SEG.src,n=w*h,m=new Uint8Array(n),st=new Int32Array(n);let sp=0;
  const p0=y*w+x,j0=p0*4,r=data[j0],g=data[j0+1],b=data[j0+2],a0=data[j0+3],t2=tol*tol;
  const ok=p=>{const j=p*4;if(Math.abs(data[j+3]-a0)>60)return false;if(a0<24)return true;const dr=data[j]-r,dg=data[j+1]-g,db=data[j+2]-b;return dr*dr+dg*dg+db*db<=t2};
  m[p0]=1;st[sp++]=p0;
  while(sp){const p=st[--sp],px=p%w,py=(p/w)|0;
    if(px>0&&!m[p-1]&&ok(p-1)){m[p-1]=1;st[sp++]=p-1}
    if(px<w-1&&!m[p+1]&&ok(p+1)){m[p+1]=1;st[sp++]=p+1}
    if(py>0&&!m[p-w]&&ok(p-w)){m[p-w]=1;st[sp++]=p-w}
    if(py<h-1&&!m[p+w]&&ok(p+w)){m[p+w]=1;st[sp++]=p+w}}
  return m;
}
/* 把一个整图蒙版并进图层：新建 / 加到所选 / 从所选减去 */
/* 加 / 减的对象：点选中的元素 → 否则勾选了的元素 →（只有“减去”）圈到的元素 */
function segTargets(full){
  const {w}=SEG.src,cur=SEG.cur;
  /* 只认当前这张图上的选中层；切图块时如果还留着别的图的选中，会按错坐标改错元素 */
  const act=SEG.layers.find(l=>l.id===[...SEG.sel][0]&&(l.tile==null||l.tile===cur));
  if(act)return[act];
  const on=SEG.layers.filter(l=>l.on&&l.tile===cur);
  const hits=SEG.layers.filter(L=>{
    if(L.tile!==cur)return false;
    for(let y=0;y<L.bh;y++)for(let x=0;x<L.bw;x++)if(L.m[y*L.bw+x]&&full[(L.by+y)*w+L.bx+x])return true;
    return false;
  });
  /* 加 / 减 / 拆：没显式选中时，直接作用在圈到的那个元素上（最上面的一层） */
  if(SEG.mode==='add'||SEG.mode==='sub'||SEG.mode==='split'){
    if(hits.length)return[hits[hits.length-1]];
    return on.length===1?on:[];
  }
  if(on.length)return on;
  return hits;
}
/** 用一份整图蒙版替换某一层（AI 连续点选 / 反选时不断修正同一层用） */
function segReplaceLayer(L, full){
  const {w,h}=SEG.src;
  const nl=segLayerFromFull(full,w,h,L.name);
  if(!nl)return null;
  nl.color=L.color;nl.on=L.on;nl.tile=L.tile;nl.autoName=L.autoName;nl.manual=true;
  const ix=SEG.layers.indexOf(L);
  if(ix>=0)SEG.layers[ix]=nl;else SEG.layers.push(nl);
  return nl;
}
function segApply(full){
  const {w,h}=SEG.src;
  /* manual：用户亲手画/加减过的蒙版，边缘处理不能再自作主张（见 segPolishMask） */
  if(SEG.mode==='new'){const nl=segLayerFromFull(full,w,h);if(!nl){toast(t('eNoSel'));return}nl.tile=SEG.cur;nl.manual=true;SEG.layers.push(nl);SEG.sel=new Set([nl.id]);return}
  /* 拆出一块：选区 ∩ 当前元素 → 独立的新元素；原元素只保留剩下的部分 */
  if(SEG.mode==='split'){
    const ts=segTargets(full);
    if(!ts.length){toast(t('eNeedSel'));return}
    let added=null;
    for(const L of ts){
      const cur=segFull(L);
      const keep=new Uint8Array(cur.length),take=new Uint8Array(cur.length);let hit=0;
      for(let i=0;i<cur.length;i++){if(cur[i]){if(full[i]){take[i]=1;hit++}else keep[i]=1}}
      if(!hit)continue;
      const ix=SEG.layers.indexOf(L);
      const rest=segLayerFromFull(keep,w,h,L.name);
      let at=ix;
      if(rest){rest.color=L.color;rest.on=L.on;rest.tile=L.tile;rest.autoName=L.autoName;rest.manual=true;SEG.layers[ix]=rest;at=ix+1}
      else SEG.layers.splice(ix,1);
      const part=segLayerFromFull(take,w,h,t('splitPart',{n:L.name}));
      if(part){part.color=L.color;part.on=true;part.tile=L.tile;part.manual=true;part.autoName=null;SEG.layers.splice(at,0,part);added=part}
    }
    if(!added){toast(t('eSplitNone'));return}
    SEG.sel=new Set([added.id]);return;
  }
  const ts=segTargets(full);
  if(!ts.length){toast(t(SEG.mode==='add'?'eNeedSel':'eNoHit'));return}
  let last=null,changed=0;
  for(const L of ts){
    const cur=segFull(L);let ch=0;
    for(let i=0;i<cur.length;i++){
      if(SEG.mode==='add'){if(full[i]&&!cur[i]){cur[i]=1;ch++}}
      else if(full[i]&&cur[i]){cur[i]=0;ch++}
    }
    if(!ch)continue;
    const nl=segLayerFromFull(cur,w,h,L.name),ix=SEG.layers.indexOf(L);
    if(!nl){SEG.layers.splice(ix,1);SEG.sel.delete(L.id);changed++;continue}
    nl.color=L.color;nl.on=true;nl.tile=L.tile;nl.autoName=L.autoName;nl.manual=true;SEG.layers[ix]=nl;last=nl;changed++;
  }
  if(!changed){toast(t('eNoChange'));return}
  SEG.sel=last?new Set([last.id]):new Set();
}
/* ── 边缘处理：补小缺口 + 润化边缘（默认开启） ──
 * 拆出来的元素边缘常有三种毛病：细小的断口、1px 锯齿、边缘发虚。
 * 这里用纯本机算法处理，不联网、不加载任何模型：
 *   ① 形态学闭运算（先膨胀后腐蚀）→ 把边缘上的 1~2px 小缺口补上
 *   ② 裂缝填充 → 把「两侧都有前景、但中间断开」的窄缝补上（最多 4px），
 *      只在前景左右（或上下）都存在时才补，所以不会把两个离得远的元素粘在一起
 *   ③ 洪水填充 → 填掉被完全包住的洞（字母 O 中间那种）
 *   ④ 导出时对 alpha 通道做一次轻微平滑 → 消掉台阶状的锯齿
 */
const segEdgeOn = () => !(typeof CFG !== 'undefined' && CFG && CFG.edgeSmooth === false);
/** 最多补多宽的裂缝（像素）。0 = 不补。默认 4 */
const segGapWidth = () => {
  const v = (typeof CFG !== 'undefined' && CFG && CFG.edgeGap != null) ? +CFG.edgeGap : 4;
  return Number.isFinite(v) && v > 0 ? Math.min(8, Math.round(v)) : 0;
};
function segDilate(m, w, h, r) {
  const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let k = -r; k <= r && !v; k++) { const xx = x + k < 0 ? 0 : (x + k >= w ? w - 1 : x + k); if (m[y * w + xx]) v = 1; }
    a[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let k = -r; k <= r && !v; k++) { const yy = y + k < 0 ? 0 : (y + k >= h ? h - 1 : y + k); if (a[yy * w + x]) v = 1; }
    b[y * w + x] = v;
  }
  return b;
}
function segErode(m, w, h, r) {
  const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 1;
    for (let k = -r; k <= r && v; k++) { const xx = x + k < 0 ? 0 : (x + k >= w ? w - 1 : x + k); if (!m[y * w + xx]) v = 0; }
    a[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 1;
    for (let k = -r; k <= r && v; k++) { const yy = y + k < 0 ? 0 : (y + k >= h ? h - 1 : y + k); if (!a[yy * w + x]) v = 0; }
    b[y * w + x] = v;
  }
  return b;
}
/** 填掉被完全包住的洞（字母 O 的中间、甜甜圈中间这类），不会误伤相邻的独立元素 */
function segFillHoles(m,w,h){
  const seen=new Uint8Array(w*h),st=[];
  const push=i=>{if(!seen[i]&&!m[i]){seen[i]=1;st.push(i)}};
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x)}
  for(let y=0;y<h;y++){push(y*w);push(y*w+w-1)}
  while(st.length){const p=st.pop(),x=p%w,y=(p/w)|0;
    if(x>0)push(p-1);if(x<w-1)push(p+1);if(y>0)push(p-w);if(y<h-1)push(p+w)}
  const out=new Uint8Array(m);
  for(let i=0;i<m.length;i++)if(!m[i]&&!seen[i])out[i]=1;
  return out;
}
/**
 * 补裂缝：把「中间断开、但两侧都是前景」的窄缝接上。
 * 判定方式是从每个背景像素往左右（和上下）各看几格，
 * 只有当两个方向都找到前景、且缝隙总宽不超过 maxGap 时才补。
 * 所以两个离得很远的元素不会被粘在一起。
 * 走样（阶梯状）的裂缝需要多跑几遍才会完全合拢。
 */
function segFillCracks(m, w, h, maxGap) {
  const D = maxGap || 5;              // 缝隙最大宽度（含两侧各一格前景之间的空白）
  let cur = m;
  for (let pass = 0; pass < 3; pass++) {
    const out = new Uint8Array(cur);
    let changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cur[i]) { out[i] = 1; continue; }
        let r = 0, l = 0, dn = 0, up = 0;
        for (let k = 1; k <= D; k++) {
          if (!r && x + k < w && cur[i + k]) r = k;
          if (!l && x - k >= 0 && cur[i - k]) l = k;
          if (!dn && y + k < h && cur[i + k * w]) dn = k;
          if (!up && y - k >= 0 && cur[i - k * w]) up = k;
        }
        /* 缝隙宽度 = 到两侧前景的距离之和 - 1 */
        if ((r && l && r + l - 1 <= D) || (dn && up && dn + up - 1 <= D)) { out[i] = 1; changed = true; }
      }
    }
    cur = out;
    if (!changed) break;
  }
  return cur;
}
/** 补过缺口的蒙版（结果缓存在图层上，避免每次重绘都算） */
function segPolishMask(L) {
  if (L.mp) return L.mp;
  /* 蒙版变了，之前切好的透明底图也作废 */
  L._cuts = null;
  if (!segEdgeOn() || !L.m) return (L.mp = L.m);
  /* 用户手动画/加减过的图层：蒙版就是他亲手定的，别补缝、别填洞。
     否则「从当前减去」抠掉的内部细节会被 segFillHoles 原样填回来，看起来像没生效。 */
  if (L.manual) return (L.mp = L.m);
  /* 先闭运算补上边缘上的小缝隙，再接窄裂缝，最后填掉封闭的洞 */
  let m = segErode(segDilate(L.m, L.bw, L.bh, 1), L.bw, L.bh, 1);
  const gap = segGapWidth();
  if (gap > 0) m = segFillCracks(m, L.bw, L.bh, gap);
  m = segFillHoles(m, L.bw, L.bh);
  return (L.mp = m);
}
/* 取出一个图层的透明底图。
 * 结果按 pad 缓存在 L._cuts 上：元素列表、预览面板、导出会反复要同一张图，
 * 以前每次都重建 canvas + 全像素扫描，多图批量导入时这是最大的一笔开销。 */
function segCut(L,pad){
  const p=pad||1;
  /* 先拿蒙版：重新算蒙版时 segPolishMask 会把 L._cuts 作废，
     所以缓存对象必须在那之后再建，否则写进去的是个没人引用的孤儿对象。 */
  const M=segPolishMask(L);
  const cache=L._cuts||(L._cuts={});
  if(cache[p])return cache[p];
  const tl=SEG.tiles[L.tile]||segCurTile(),src=(tl&&tl.src)||SEG.src;
  const {w,data}=src,W=L.bw+p*2,H=L.bh+p*2;
  const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d'),id=g.createImageData(W,H);
  const mv=(x,y)=>(x<0||y<0||x>=L.bw||y>=L.bh)?0:M[y*L.bw+x];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const mx=x-p,my=y-p;let s=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)s+=mv(mx+dx,my+dy);
    const a=mv(mx,my)?(s>=9?1:(.55+.45*s/9)):(s>0?s/9*.7:0);
    if(a<=0)continue;
    const sx=L.bx+mx,sy=L.by+my,si=(Math.max(0,sy)*w+Math.max(0,Math.min(w-1,sx)))*4,d=(y*W+x)*4;
    id.data[d]=data[si];id.data[d+1]=data[si+1];id.data[d+2]=data[si+2];id.data[d+3]=Math.round(255*a*data[si+3]/255);
  }
  g.putImageData(id,0,0);
  const soft=segSoftWidth();
  if(soft>0)segSoftEdge(g,W,H,soft);
  else if(segEdgeOn())segSmoothEdge(g,W,H);
  return(cache[p]={cv:c,px:L.bx-p,py:L.by-p});
}
/* ── 软边：把边缘羽化，并把半透明像素的颜色往内部颜色拉，减轻白边 / 黑边 ── */
const segSoftWidth = () => {
  const v = (typeof CFG !== 'undefined' && CFG && CFG.softEdge != null) ? +CFG.softEdge : 0;
  return Number.isFinite(v) && v > 0 ? Math.min(6, Math.round(v)) : 0;
};
function segSoftEdge(g,W,H,r){
  const id=g.getImageData(0,0,W,H),d=id.data,n=W*H;
  const A=new Float32Array(n),R=new Float32Array(n),G=new Float32Array(n),B=new Float32Array(n);
  for(let i=0;i<n;i++){
    const a=d[i*4+3]/255;A[i]=a;
    /* 只让「接近不透明」的像素参与内部颜色统计，避免边缘颜色把平均色带偏 */
    if(a>.8){R[i]=d[i*4];G[i]=d[i*4+1];B[i]=d[i*4+2]}
  }
  const box=(src,horiz)=>{
    const out=new Float32Array(n);
    for(let o=0;o<(horiz?H:W);o++){
      let sum=0;
      for(let k=-r;k<=r;k++)sum+=src[horiz?o*W+Math.min(W-1,Math.max(0,k)):Math.min(H-1,Math.max(0,k))*W+o];
      for(let i=0;i<(horiz?W:H);i++){
        out[horiz?o*W+i:i*W+o]=sum/(2*r+1);
        const add=Math.min((horiz?W:H)-1,i+r+1),sub=Math.max(0,i-r);
        sum+=src[horiz?o*W+add:add*W+o]-src[horiz?o*W+sub:sub*W+o];
      }
    }
    return out;
  };
  const a1=box(A,true),a2=box(a1,false);
  const r1=box(R,true),r2=box(r1,false);
  const g1=box(G,true),g2=box(g1,false);
  const b1=box(B,true),b2=box(b1,false);
  for(let i=0;i<n;i++){
    const a=a2[i];
    d[i*4+3]=Math.max(0,Math.min(255,Math.round(a*255)));
    if(a>.01&&a<.98){
      const f=(1-a)*.75;
      d[i*4]=Math.round(d[i*4]*(1-f)+r2[i]*f);
      d[i*4+1]=Math.round(d[i*4+1]*(1-f)+g2[i]*f);
      d[i*4+2]=Math.round(d[i*4+2]*(1-f)+b2[i]*f);
    }
  }
  g.putImageData(id,0,0);
}
/* ② 润化边缘：把 alpha 通道里 0~255 之间的过渡带再抹平一点，去掉台阶锯齿 */
function segSmoothEdge(g,W,H){
  const id=g.getImageData(0,0,W,H),d=id.data,n=W*H;
  const A=new Float32Array(n);
  for(let i=0;i<n;i++)A[i]=d[i*4+3];
  const out=new Float32Array(n);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    let sum=0,wsum=0;
    for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=H)continue;
      for(let dx=-1;dx<=1;dx++){const xx=x+dx;if(xx<0||xx>=W)continue;
        const a=A[yy*W+xx];sum+=a;wsum++}}
    const avg=wsum?sum/wsum:0;
    out[y*W+x]=A[y*W+x]*.65+avg*.35;
  }
  for(let i=0;i<n;i++)d[i*4+3]=Math.max(0,Math.min(255,Math.round(out[i])));
  g.putImageData(id,0,0);
}
/* ── AI 点选（SlimSAM，放在 Worker 里，需联网下载模型） ── */
/* 模型有两种：量化版（q8，默认）和浮点版。
 * 量化：模型小（十几 MB）、下载快、省内存，日常够用；
 * 浮点：精度略高，但体积和内存都要多一倍多，机器够好再换。 */
let AI_MODE = 'q8';
/* 浮点版在内存不够的机器上会加载失败（甚至把标签页拖垮）。
 * 一旦失败就自动降级回量化版重试一次，只降级一次，不来回横跳。 */
let AI_DOWNGRADED = false;
function aiSetMode(m) {
  const n = (m === 'fp32') ? 'fp32' : 'q8';
  if (n === AI_MODE) return;
  AI_MODE = n;
  if (SEG.ai) { try { SEG.ai.w.terminate(); URL.revokeObjectURL(SEG.ai.url); } catch (e) { } SEG.ai = null; }
}
/** 浮点版加载失败 → 换回量化版，返回 true 表示已降级 */
function aiFallbackToQ8() {
  if (AI_MODE !== 'fp32' || AI_DOWNGRADED) return false;
  AI_DOWNGRADED = true;
  aiSetMode('q8');
  return true;
}
const aiCacheKey = () => 'pp_ai_' + AI_MODE;
const aiCached = () => { try { return localStorage.getItem(aiCacheKey()) === '1'; } catch (e) { return false; } };
const aiMarkReady = () => { try { localStorage.setItem(aiCacheKey(), '1'); } catch (e) { } };

/* 两种模型的体积和需求，写在面板上给用户看 */
const AI_META = {
  q8: { size: '15–40 MB', req: 'aiReqQ' },
  fp32: { size: '40–100 MB', req: 'aiReqF' }
};
function aiInfo() {
  const m = AI_META[AI_MODE] || AI_META.q8;
  return { mode: AI_MODE, size: m.size, req: m.req, ready: aiCached() };
}
/** 提前把模型下好（点了 AI 点选再下也行，这里可以手动触发） */
async function aiDownload() {
  const A = segAIWorker();
  if (A.ready) { aiMarkReady(); return true; }
  segBusy(t('aiDlModel', { size: aiInfo().size }));
  try { await segAIcall({ t: 'init' }, 'ready'); A.ready = true; aiMarkReady(); segBusy(''); toast(t('aiDlDone')); return true; }
  catch (e) {
    segBusy('');
    /* 浮点版扛不住？自动换量化版再试一次 */
    if (aiFallbackToQ8()) { toast(t('aiFallback')); return await aiDownload(); }
    toast(t('aiDlFail', { e: String(e.message || e).slice(0, 60) })); return false;
  }
}
/** 换模型：把旧的 worker 停掉，下次点 AI 就用新的那套权重 */
function aiSwap() {
  aiSetMode(AI_MODE === 'q8' ? 'fp32' : 'q8');
  if (SEG.ai) { try { SEG.ai.w.terminate(); URL.revokeObjectURL(SEG.ai.url); } catch (e) { } SEG.ai = null; }
  aiSetMode(AI_MODE);
  return aiInfo();
}
/** AI 工具面板：显示当前用的是哪个模型、多大、要不要先下载 */
function aiPanel() {
  const i = aiInfo();
  const name = i.mode === 'fp32' ? t('aiModelF') : t('aiModelQ');
  return `<div class="aibox">
    <div class="airow"><span>${t('aiNow')}</span><b>${name}</b></div>
    <div class="airow"><span>${t('aiModelSize')}</span><span>${i.size}</span></div>
    <div class="airow"><span>${t('aiReq')}</span><span>${t(i.req)}</span></div>
    <div class="airow"><span>${t('aiState')}</span><span>${i.ready ? t('aiReady') : t('aiNotReady')}</span></div>
    <div class="chips">
      <button class="btn sm" id="aiDl">${i.ready ? t('aiRedl') : t('aiDl')}</button>
      <button class="btn sm" id="aiSwap">${i.mode === 'q8' ? t('aiUseF') : t('aiUseQ')}</button>
    </div>
  </div>`;
}
/** 面板按钮的点击处理（在 segParams 渲染完之后调用） */
function aiBind() {
  const dl = document.querySelector('#aiDl'); if (dl) dl.onclick = () => aiDownload();
  const sw = document.querySelector('#aiSwap'); if (sw) sw.onclick = () => { aiSwap(); if (segParams) segParams(); toast(t('aiSwapped', { m: AI_MODE === 'fp32' ? t('aiModelF') : t('aiModelQ') })); };
}

function segAIWorker(){
  if(SEG.ai)return SEG.ai;
  const M=JSON.stringify({lib:t('aiLib'),libFail:t('aiLibFail'),pick:t('aiPick'),from:t('aiFrom'),modelFail:t('aiModelFail')});
  const DT=JSON.stringify(AI_MODE === 'fp32' ? null : 'q8');
  const code=`const M=${M};const DT=${DT};let model,proc,emb,raw,RI;
  const ID='Xenova/slimsam-77-uniform';
  const fast=urls=>{const ctl=urls.map(()=>new AbortController());const to=setTimeout(()=>ctl.forEach(c=>c.abort()),6000);return Promise.any(urls.map((u,i)=>fetch(u,{signal:ctl[i].signal,cache:'no-store'}).then(r=>{if(!r.ok)throw 0;ctl.forEach((c,j)=>j!==i&&c.abort());return u}))).then(u=>{clearTimeout(to);return u}).catch(()=>{clearTimeout(to);return null})};
  self.onmessage=async e=>{const m=e.data;try{
   if(m.t==='init'){
     let T=null;postMessage({t:'st',msg:M.lib});
     for(const u of ['https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm','https://fastly.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm','https://unpkg.com/@huggingface/transformers@3.0.2/+esm']){try{T=await import(u);break}catch(x){}}
     if(!T)throw new Error(M.libFail);
     T.env.allowLocalModels=false;RI=T.RawImage;
     postMessage({t:'st',msg:M.pick});
     const hosts=['https://huggingface.co','https://hf-mirror.com'];
     const ok=await fast(hosts.map(h=>h+'/'+ID+'/resolve/main/config.json'));
     const order=ok?[hosts.find(h=>ok.startsWith(h)),...hosts.filter(h=>!ok.startsWith(h))]:hosts.slice().reverse();
     const files={},pg=p=>{if(p.file&&p.total){files[p.file]={l:p.loaded||0,t:p.total};let l=0,t=0;for(const k in files){l+=files[k].l;t+=files[k].t}postMessage({t:'prog',l,tt:t})}};
     let lastErr=null;
     for(const h of order){
       T.env.remoteHost=h+'/';
       for(const dt of (DT?[DT,null]:[null])){
         try{postMessage({t:'st',msg:M.from.replace('{h}',h.replace('https://',''))});
           const o={progress_callback:pg};if(dt)o.dtype=dt;
           model=await T.SamModel.from_pretrained(ID,o);proc=await T.AutoProcessor.from_pretrained(ID);lastErr=null;break}catch(x){lastErr=x;model=null}
       }
       if(model)break;
     }
     if(!model)throw lastErr||new Error(M.modelFail);
     postMessage({t:'ready'})}
   else if(m.t==='embed'){raw=await RI.fromBlob(m.blob);const inp=await proc(raw);emb=await model.get_image_embeddings(inp);postMessage({t:'embedded'})}
   else if(m.t==='click'){const opt={input_points:[[m.pts]]};if(m.labels&&m.labels.some(l=>!l))opt.input_labels=[[m.labels]];const inputs=await proc(raw,opt);const out=await model({...emb,...inputs});
     const masks=await proc.post_process_masks(out.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);
     const t=masks[0],d=t.dims,H=d[d.length-2],W=d[d.length-1],sc=out.iou_scores.data;let bi=0;for(let i=1;i<sc.length;i++)if(sc[i]>sc[bi])bi=i;
     const o=new Uint8Array(W*H),off=bi*W*H;for(let i=0;i<W*H;i++)o[i]=t.data[off+i]?1:0;postMessage({t:'mask',m:o,W,H},[o.buffer])}
  }catch(err){postMessage({t:'err',msg:String(err&&err.message||err)})}}`;
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
  const w=new Worker(url);SEG.ai={w,ready:false,embedded:false,url,gen:0};return SEG.ai;
}
function segAIcall(msg,want,transfer){
  const A=segAIWorker();
  return new Promise((res,rej)=>{
    const h=e=>{const d=e.data;
      if(d.t==='st'){segBusy(d.msg);return}
      if(d.t==='prog'){const mb=x=>(x/1048576).toFixed(1);segBusy(t('aiDl',{l:mb(d.l),t:mb(d.tt)}));return}
      if(d.t==='err'){A.w.removeEventListener('message',h);rej(new Error(d.msg));return}
      if(d.t===want){A.w.removeEventListener('message',h);res(d)}};
    A.w.addEventListener('message',h);A.w.postMessage(msg,transfer||[]);
  });
}
async function segAIClick(x,y,neg){
  const A=segAIWorker();
  /* 导入新图时 segReset 会把 gen 加一：这期间还在跑的 embedding / 点击结果都作废，
     否则会用上一张图的 embedding 去算新图的蒙版（同尺寸时连尺寸检查都拦不住）。 */
  const gen=A.gen||0, stale=()=>A.gen!==gen;
  /* 新点落在上一轮的图层外面 → 用户多半在点另一个东西，自动开一轮新的提示点 */
  if(!neg&&SEG.aiLayer){
    const L=SEG.layers.find(l=>l.id===SEG.aiLayer);
    if(!L)SEG.aiLayer=null;
    else if(x<L.bx-6||x>L.bx+L.bw+6||y<L.by-6||y>L.by+L.bh+6){SEG.aiPts=[];SEG.aiLayer=null}
  }
  if(neg&&!SEG.aiPts.some(p=>!p.neg)){toast(t('aiNeedPos'));return}
  SEG.aiPts.push({x,y,neg:!!neg});
  if(SEG.aiPts.length>16)SEG.aiPts.shift();
  /* 先把提示点画出来：即使模型还在下载 / 失败，用户也能看到自己点了什么 */
  segRender();
  if(typeof segParams==='function')segParams();
  try{
    if(!A.ready){segBusy(aiCached()?t('aiSee'):t('aiLoad'));await segAIcall({t:'init'},'ready');A.ready=true;aiMarkReady()}
    if(stale())return;
    if(!A.embedded){segBusy(t('aiSee'));const bl=await new Promise(r=>SEG.src.cv.toBlob(r,'image/png'));await segAIcall({t:'embed',blob:bl},'embedded');if(stale())return;A.embedded=true}
    segBusy(SEG.aiPts.length>1?t('aiRefine',{n:SEG.aiPts.length}):t('aiFind'));
    const d=await segAIcall({t:'click',pts:SEG.aiPts.map(p=>[p.x,p.y]),labels:SEG.aiPts.map(p=>p.neg?0:1)},'mask');
    segBusy('');
    if(stale())return;
    const {w,h}=SEG.src;if(d.W!==w||d.H!==h){toast(t('aiSize'));return}
    const target=SEG.aiLayer?SEG.layers.find(l=>l.id===SEG.aiLayer):null;
    if(target){
      /* 同一轮里继续点：直接替换这一层的蒙版，越点越准，不会越点越多层 */
      const nl=segReplaceLayer(target,d.m);
      if(nl){SEG.aiLayer=nl.id;SEG.sel=new Set([nl.id])}
    }else{
      segApply(d.m);
      const id=[...SEG.sel][0]||null;SEG.aiLayer=id;
    }
    segRender();
  }catch(e){
    segBusy('');console.warn(e);segRender();
    /* 浮点版在这台机器上起不来？自动换量化版重试一次 */
    if(aiFallbackToQ8()){
      toast(t('aiFallback'));
      try{ SEG.ai=null; SEG.aiPts.pop(); await segAIClick(x,y,neg); }
      catch(e2){ console.warn(e2); toast(t('aiFail',{e:String(e2.message||e2).slice(0,60)})); }
      return;
    }
    toast(t('aiFail',{e:String(e.message||e).slice(0,60)}));
  }
}
function segBusy(t){const b=$('#segBusy');if(!b)return;b.textContent=t||'';b.style.display=t?'grid':'none'}
