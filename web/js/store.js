/* PixPeel 网页版：本机账号 + IndexedDB 暂存
 * 没有服务器。游客和账号的数据都只在这台设备。 */
(function () {
  const DB_NAME = 'pixpeel-web';
  const DB_VER = 1;
  const SESSION_KEY = 'pp_web_session';
  const GUEST = { uid: 'guest', name: '游客', guest: true };

  let db = null;
  let useMem = false;
  const mem = { items: [], boards: new Map() };

  const uidFor = (name) => 'acct:' + String(name || '').trim().toLowerCase().replace(/\s+/g, '-');
  const rid = () => (crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));

  function open() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) { useMem = true; return resolve(null); }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { useMem = true; return resolve(null); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('items')) {
          const s = d.createObjectStore('items', { keyPath: 'id' });
          s.createIndex('uid', 'uid', { unique: false });
        }
        if (!d.objectStoreNames.contains('boards')) d.createObjectStore('boards', { keyPath: 'uid' });
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => { useMem = true; resolve(null); };
    });
  }

  const tx = (store, mode) => db.transaction(store, mode).objectStore(store);
  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.uid) return s;
      }
    } catch (e) { }
    return { ...GUEST };
  }
  function setSession(s) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { }
  }
  function logout() { const s = { ...GUEST }; setSession(s); return s; }
  function login(name, mergeGuest) {
    const clean = String(name || '').trim().slice(0, 24);
    if (!clean) return null;
    const prev = getSession();
    const s = { uid: uidFor(clean), name: clean, guest: false, createdAt: Date.now() };
    setSession(s);
    if (mergeGuest && prev.uid === 'guest') mergeFromGuest(s.uid);
    return s;
  }

  async function listItems(uid) {
    if (useMem) return mem.items.filter(x => x.uid === uid).sort((a, b) => b.created - a.created);
    try {
      const all = await reqP(tx('items', 'readonly').index('uid').getAll(uid));
      return (all || []).sort((a, b) => b.created - a.created);
    } catch (e) { return []; }
  }
  async function countItems(uid) {
    try { return (await listItems(uid)).length; } catch (e) { return 0; }
  }
  async function addItems(uid, entries) {
    const now = Date.now();
    const rows = (entries || []).filter(x => x && x.blob).map((x, i) => ({
      id: rid(),
      uid,
      name: String(x.name || '元素').slice(0, 60),
      blob: x.blob,
      w: Math.max(1, Math.round(x.w || 0)),
      h: Math.max(1, Math.round(x.h || 0)),
      created: now + i
    }));
    if (!rows.length) return [];
    if (useMem) { mem.items.push(...rows); return rows; }
    try {
      const t = db.transaction('items', 'readwrite');
      const st = t.objectStore('items');
      for (const r of rows) st.put(r);
      await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
      return rows;
    } catch (e) { return []; }
  }
  async function removeItems(uid, ids) {
    const set = new Set(ids || []);
    if (useMem) { mem.items = mem.items.filter(x => !(x.uid === uid && set.has(x.id))); return true; }
    try {
      const t = db.transaction('items', 'readwrite');
      const st = t.objectStore('items');
      for (const id of set) st.delete(id);
      await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
      return true;
    } catch (e) { return false; }
  }
  async function clearItems(uid) {
    const rows = await listItems(uid);
    return removeItems(uid, rows.map(x => x.id));
  }
  async function mergeFromGuest(uid) {
    if (!uid || uid === 'guest') return 0;
    const guest = await listItems('guest');
    if (!guest.length) return 0;
    const rows = guest.map((x, i) => ({ ...x, id: rid(), uid, created: Date.now() + i }));
    if (useMem) { mem.items.push(...rows); mem.items = mem.items.filter(x => x.uid !== 'guest'); return rows.length; }
    try {
      const t = db.transaction('items', 'readwrite');
      const st = t.objectStore('items');
      for (const r of rows) st.put(r);
      for (const g of guest) st.delete(g.id);
      await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
      const gb = await getBoard('guest');
      const ab = await getBoard(uid);
      if (gb && !ab) { await saveBoard(uid, gb); await clearBoard('guest'); }
      return rows.length;
    } catch (e) { return 0; }
  }

  async function getBoard(uid) {
    if (useMem) return mem.boards.get(uid) || null;
    try { return (await reqP(tx('boards', 'readonly').get(uid))) || null; } catch (e) { return null; }
  }
  async function saveBoard(uid, data) {
    if (!uid) return false;
    if (useMem) { mem.boards.set(uid, data); return true; }
    try {
      const t = db.transaction('boards', 'readwrite');
      t.objectStore('boards').put({ ...data, uid, updated: Date.now() });
      await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
      return true;
    } catch (e) { return false; }
  }
  async function clearBoard(uid) {
    if (useMem) { mem.boards.delete(uid); return true; }
    try {
      const t = db.transaction('boards', 'readwrite');
      t.objectStore('boards').delete(uid);
      await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
      return true;
    } catch (e) { return false; }
  }

  async function usage() {
    try {
      const u = await navigator.storage.estimate();
      return { used: u.usage || 0, quota: u.quota || 0 };
    } catch (e) { return { used: 0, quota: 0 }; }
  }

  window.PPStore = {
    init: open, uidFor, rid,
    session: getSession, login, logout,
    list: listItems, count: countItems, add: addItems, remove: removeItems, clear: clearItems, mergeGuest: mergeFromGuest,
    getBoard, saveBoard, clearBoard, usage,
    get memMode() { return useMem; }
  };
})();
