const MARKETS = ['Kripto', 'NASDAQ', 'BIST', 'Emtia'];
const TFS = ['5m', '15m', '1h', '4h', '1d', '1w', '1M'];
const $ = id => document.getElementById(id);
const results = [], store = new Map(), items = new Map(), sigCache = new Map();
function chips(el, list, on) {
  el.innerHTML = list.map(x => `<label class="chip"><input type="checkbox" value="${x}" ${on.includes(x) ? 'checked' : ''}>${x}</label>`).join('');
}
chips($('markets'), MARKETS, ['Kripto', 'Emtia']);
chips($('tfs'), TFS, ['1h', '4h', '1d']);
const picked = el => [...el.querySelectorAll('input:checked')].map(i => i.value);
const fmt = v => v == null ? '-' : Math.abs(v) >= 100 ? v.toFixed(2) : Math.abs(v) >= 1 ? v.toFixed(3) : v.toPrecision(4);

async function pool(tasks, n, step) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < tasks.length) { const t = tasks[i++]; try { await t(); } catch (e) {} step(); }
  }));
}
$('go').onclick = async () => {
  const mk = picked($('markets')), tf = picked($('tfs'));
  if (!mk.length || !tf.length) return alert('En az bir piyasa ve zaman dilimi seç');
  $('go').disabled = true; results.length = 0; store.clear(); sigCache.clear(); items.clear(); render();
  $('status').textContent = 'Liste alınıyor...';
  const uni = await fetch('/api/universe').then(r => r.json());
  const items = uni.items.filter(x => mk.includes(x.market));
  const jobs = [];
  for (const it of items) for (const t of tf) jobs.push(async () => {
    const d = await fetch(`/api/candles?src=${it.src}&symbol=${encodeURIComponent(it.symbol)}&tf=${t}`).then(r => r.json());
    if (!d.c) return;
    store.set(it.symbol + '|' + t, d); items.set(it.symbol, it);
    for (const x of DivLib.findPatterns(d)) results.push({ ind: 'Formasyon', type: x.name, bull: x.bull, barsAgo: x.barsAgo, gap: x.gap, p1: x.p1, p2: x.p2, i1: null, i2: null, pts: x.pts, market: it.market, name: it.name, symbol: it.symbol, tf: t });
    for (const x of DivLib.findDivergences({ h: d.h, l: d.l, c: d.c })) results.push({ ...x, market: it.market, name: it.name, symbol: it.symbol, tf: t });
  });
  let done = 0; $('bar').hidden = false; $('bar').max = jobs.length;
  await pool(jobs, 8, () => { $('bar').value = ++done; $('status').textContent = `Taranıyor ${done}/${jobs.length} · bulunan: ${results.length}`; if (done % 10 === 0) render(); });
  fillTfs(tf);
  $('status').textContent = `Bitti. ${items.length} varlık × ${tf.length} dilim tarandı, ${results.length} diverjans bulundu.`;
  $('bar').hidden = true; $('go').disabled = false; render(); fillTfs(tf);
};
function render() {
  const d = $('fDir').value, k = $('fKind').value, ind = $('fInd').value, q = $('fQ').value.toLowerCase();
  const rows = results.filter(r => (!d || (d === 'bull' ? r.bull === true : r.bull === false)) && (!k || (r.ind !== 'Formasyon' && r.type.includes(k))) && (!ind || r.ind === ind) && (!q || r.name.toLowerCase().includes(q)))
    .sort((a, b) => a.barsAgo - b.barsAgo);
  $('tbl').tBodies[0].innerHTML = rows.map((r, i) => `<tr data-i="${results.indexOf(r)}" class="${r.bull === null ? 'neu' : r.bull ? 'bull' : 'bear'}"><td>${r.market}</td><td>${r.name}</td><td>${r.tf}</td><td>${r.ind}</td><td>${r.type}</td><td>${r.barsAgo}</td><td>${fmt(r.p1)} → ${fmt(r.p2)}</td><td>${r.i1 == null ? '-' : fmt(r.i1) + ' → ' + fmt(r.i2)}</td></tr>`).join('');
}
['fDir', 'fKind', 'fInd', 'fQ'].forEach(id => $(id).oninput = render);

$('tbl').tBodies[0].onclick = e => { const tr = e.target.closest('tr'); if (tr) openDetail(results[+tr.dataset.i]); };
$('close').onclick = () => $('modal').hidden = true;
$('modal').onclick = e => { if (e.target === $('modal')) $('modal').hidden = true; };

function openDetail(r) {
  const d = store.get(r.symbol + '|' + r.tf); if (!d) return;
  $('modal').hidden = false;
  const all = DivLib.findDivergences(d), pats = DivLib.findPatterns(d);
  $('mTitle').textContent = r.none ? `${r.name} · ${r.tf}` : `${r.name} · ${r.tf} · ${r.ind === 'Formasyon' ? r.type + ' formasyonu' : r.ind + ' ' + r.type + ' diverjansı'}`;
  const sel = $('mInd'); sel.innerHTML = ['RSI', 'MACD', 'KAIRI', '%b', 'STOCH'].map(x => `<option ${x === r.ind ? 'selected' : ''}>${x}</option>`).join('');
  const draw = () => drawChart(d, sel.value, all, pats);
  sel.onchange = draw; draw(); coinMatrix(r);
  $('mList').innerHTML = pats.map(x => `<li class="${x.bull === null ? '' : x.bull ? 'bull' : 'bear'}"><b>${x.name}</b> – ${x.barsAgo} mum önce, ${x.gap} mum sürdü, fiyat ${fmt(x.p1)} → ${fmt(x.p2)}</li>`).join('') + all.map(x => `<li class="${x.bull ? 'bull' : 'bear'}"><b>${x.ind}</b> – ${x.type}: fiyat ${fmt(x.p1)} → ${fmt(x.p2)}, indikatör ${fmt(x.i1)} → ${fmt(x.i2)}, ${x.gap} mum arayla, ${x.barsAgo} mum önce</li>`).join('') || '<li>Bu varlıkta başka diverjans yok.</li>';
  $('mHow').textContent = r.none ? '' : r.ind === 'Formasyon' ? ({ 'Çift Tepe': 'İki benzer tepe ve aradaki vadi: yükseliş tükeniyor olabilir; vadinin altı kırılırsa düşüş teyit olur.', 'Çift Dip': 'İki benzer dip: düşüş tükeniyor olabilir; arasındaki tepe kırılırsa yükseliş teyit olur.', 'Omuz-Baş-Omuz': 'Ortadaki tepe en yüksek: trend dönüş formasyonu; boyun çizgisi kırılırsa düşüş beklenir.', 'Ters Omuz-Baş-Omuz': 'Ortadaki dip en düşük: dönüş formasyonu; boyun çizgisi kırılırsa yükseliş beklenir.', 'Yükselen Üçgen': 'Düz direnç, yükselen dipler: genelde yukarı kırılım beklenir.', 'Alçalan Üçgen': 'Düz destek, alçalan tepeler: genelde aşağı kırılım beklenir.', 'Simetrik Üçgen': 'Daralan fiyat: yön belirsiz, kırılım yönü takip edilmeli.' }[r.type] || '')
    : r.bull
    ? 'Yükseliş diverjansı: fiyat dip noktaları birbirine göre yön ayrışması gösteriyor; satış baskısı zayıflıyor olabilir, yukarı dönüş ihtimali artar.'
    : 'Düşüş diverjansı: fiyat tepe noktaları birbirine göre yön ayrışması gösteriyor; alış gücü zayıflıyor olabilir, aşağı dönüş ihtimali artar.';
}
function drawChart(d, indName, all, pats) {
  const cv = $('cv'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
  const N = Math.min(d.c.length, 150), s0 = d.c.length - N;
  const ind = DivLib.indicators(d)[indName];
  const padL = 8, padR = 56, w = W - padL - padR, x = i => padL + (i - s0 + .5) / N * w, cw = Math.max(1, w / N * .7);
  const pH = H * .62, iTop = pH + 18, iH = H - iTop - 6;
  const hs = d.h.slice(s0), ls = d.l.slice(s0), pmax = Math.max(...hs), pmin = Math.min(...ls);
  const py = v => 6 + (pmax - v) / (pmax - pmin || 1) * (pH - 12);
  d.c.forEach((c, i) => {
    if (i < s0) return; const up = c >= d.o[i];
    g.strokeStyle = g.fillStyle = up ? '#3ddc97' : '#ff6b6b';
    g.beginPath(); g.moveTo(x(i), py(d.h[i])); g.lineTo(x(i), py(d.l[i])); g.stroke();
    g.fillRect(x(i) - cw / 2, Math.min(py(c), py(d.o[i])), cw, Math.max(1, Math.abs(py(c) - py(d.o[i]))));
  });
  g.fillStyle = '#9a9ab8'; g.font = '11px sans-serif';
  [pmax, (pmax + pmin) / 2, pmin].forEach(v => g.fillText(fmt(v), W - padR + 4, py(v) + 4));
  const iv = ind.slice(s0).filter(v => v != null), imax = Math.max(...iv), imin = Math.min(...iv);
  const iy = v => iTop + (imax - v) / (imax - imin || 1) * iH;
  g.strokeStyle = '#7c5cff'; g.lineWidth = 1.5; g.beginPath(); let st = false;
  for (let i = s0; i < d.c.length; i++) { if (ind[i] == null) continue; st ? g.lineTo(x(i), iy(ind[i])) : g.moveTo(x(i), iy(ind[i])); st = true; }
  g.stroke(); g.lineWidth = 1;
  g.fillStyle = '#9a9ab8'; g.fillText(indName, padL + 2, iTop - 5);
  [imax, imin].forEach(v => g.fillText(fmt(v), W - padR + 4, iy(v) + 4));
  (pats || []).forEach(p => {
    const col = p.bull === null ? '#9aa4ff' : p.bull ? '#3ddc97' : '#ffd166';
    const pts = p.pts.filter(q => q.i >= s0); if (pts.length < 2) return;
    g.strokeStyle = g.fillStyle = col; g.lineWidth = 2; g.setLineDash([]);
    g.beginPath(); pts.forEach((q, k) => k ? g.lineTo(x(q.i), py(q.v)) : g.moveTo(x(q.i), py(q.v))); g.stroke();
    pts.forEach(q => { g.beginPath(); g.arc(x(q.i), py(q.v), 4, 0, 7); g.fill(); });
    g.lineWidth = 1; g.fillText(p.name, x(pts[0].i), Math.max(12, py(Math.max(...pts.map(q => q.v))) - 8));
  });
  // diverjans çizgileri
  all.filter(r => r.ind === indName).forEach(r => {
    if (r.a < s0) return;
    const col = r.bull ? '#3ddc97' : '#ffd166', hi = r.type.startsWith('Düş');
    g.strokeStyle = g.fillStyle = col; g.lineWidth = 2; g.setLineDash([6, 4]);
    g.beginPath(); g.moveTo(x(r.a), py(r.p1)); g.lineTo(x(r.b), py(r.p2)); g.stroke();
    g.beginPath(); g.moveTo(x(r.a), iy(r.i1)); g.lineTo(x(r.b), iy(r.i2)); g.stroke();
    g.setLineDash([]); g.lineWidth = 1;
    [[r.a, py(r.p1)], [r.b, py(r.p2)], [r.a, iy(r.i1)], [r.b, iy(r.i2)]].forEach(([i, y]) => { g.beginPath(); g.arc(x(i), y, 4, 0, 7); g.fill(); });
    g.fillText(r.type, x(r.a), py(r.p1) + (hi ? -10 : 16));
  });
}

// ---- Matris görünümü (TradingView screener tarzı) ----
const COLS = [['RSI', 'R'], ['MACD', 'M'], ['KAIRI', 'K'], ['%b', '%b'], ['STOCH', 'S'], ['Formasyon', 'F']];
function sigs(sym, tf) {
  const k = sym + '|' + tf; if (sigCache.has(k)) return sigCache.get(k);
  const d = store.get(k); if (!d) return null;
  const o = {}, put = (key, bull, barsAgo, t) => { if (!o[key] || barsAgo < o[key].barsAgo) o[key] = { bull, barsAgo, t }; };
  DivLib.findDivergences(d).forEach(x => put(x.ind, x.bull, x.barsAgo, d.t[x.b]));
  DivLib.findPatterns(d).forEach(x => put('Formasyon', x.bull, x.barsAgo, d.t[Math.max(...x.pts.map(p => p.i))]));
  sigCache.set(k, o); return o;
}
const fmtTime = (t, tf) => { const d = new Date(t), s = d.toLocaleDateString('tr-TR'); return ['5m', '15m', '1h', '4h'].includes(tf) ? s + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : s; };
const cellHtml = s => s ? `<td class="c ${s.bull === null ? 'neu' : s.bull ? 'bull' : 'bear'}" title="${s.barsAgo} mum önce"></td>` : '<td class="c"></td>';
function rowCls(o) {
  const v = Object.values(o), b = v.some(x => x.bull === true), r = v.some(x => x.bull === false);
  return b && r ? 'ro' : b ? 'rg' : r ? 'rr' : 'rn';
}
const head = first => `<thead><tr>${first}${COLS.map(c => `<th title="${c[0]}">${c[1]}</th>`).join('')}<th>Sinyal zamanı</th></tr></thead>`;
function pick(sym, tf) {
  const it = items.get(sym);
  const r = results.filter(x => x.symbol === sym && x.tf === tf).sort((a, b) => a.barsAgo - b.barsAgo)[0];
  if (r) return r;
  const o = sigs(sym, tf) || {}, best = Object.entries(o).sort((a, b) => a[1].barsAgo - b[1].barsAgo)[0];
  return { name: it.name, symbol: sym, tf, ind: best ? best[0] : 'RSI', type: '', bull: best ? best[1].bull : true, none: true };
}
function fillTfs(tf) {
  const sel = $('mxTf'), cur = sel.value;
  sel.innerHTML = tf.map(t => `<option ${t === cur ? 'selected' : ''}>${t}</option>`).join('');
  renderMatrix();
}
function renderMatrix() {
  const tf = $('mxTf').value, q = $('fQ').value.toLowerCase();
  const rows = [...items.values()].filter(it => !q || it.name.toLowerCase().includes(q)).map(it => {
    const d = store.get(it.symbol + '|' + tf); if (!d) return null;
    const s = sigs(it.symbol, tf), v = Object.values(s);
    return { it, d, s, latest: v.length ? Math.max(...v.map(x => x.t)) : 0 };
  }).filter(Boolean).sort((a, b) => b.latest - a.latest);
  $('mx').innerHTML = head('<th>Sembol</th><th>Fiyat</th>') + '<tbody>' + rows.map(r =>
    `<tr class="${rowCls(r.s)}" data-sym="${r.it.symbol}"><td class="sym">${r.it.name}</td><td class="px">${fmt(r.d.c[r.d.c.length - 1])}</td>${COLS.map(c => cellHtml(r.s[c[0]])).join('')}<td class="tm">${r.latest ? fmtTime(r.latest, tf) : '-'}</td></tr>`).join('') + '</tbody>';
}
$('mxTf').onchange = renderMatrix;
$('mx').onclick = e => { const tr = e.target.closest('tr[data-sym]'); if (tr) openDetail(pick(tr.dataset.sym, $('mxTf').value)); };
$('vList').onclick = () => { $('listView').hidden = false; $('matView').hidden = true; $('vList').className = 'on'; $('vMat').className = ''; };
$('vMat').onclick = () => { $('listView').hidden = true; $('matView').hidden = false; $('vMat').className = 'on'; $('vList').className = ''; renderMatrix(); };

let mToken = 0;
async function coinMatrix(r) {
  const my = ++mToken, it = items.get(r.symbol), el = $('mMat');
  el.innerHTML = '<tbody><tr><td>Zaman dilimleri yükleniyor...</td></tr></tbody>';
  await Promise.all(TFS.filter(t => !store.has(r.symbol + '|' + t)).map(async t => {
    try { const d = await fetch(`/api/candles?src=${it.src}&symbol=${encodeURIComponent(r.symbol)}&tf=${t}`).then(x => x.json()); if (d.c) store.set(r.symbol + '|' + t, d); } catch (e) {}
  }));
  if (my !== mToken) return;
  el.innerHTML = head('<th>Dilim</th><th>Fiyat</th>') + '<tbody>' + TFS.map(t => {
    const s = sigs(r.symbol, t), d = store.get(r.symbol + '|' + t);
    if (!s) return `<tr class="rn"><td class="sym">${t}</td><td class="px">-</td>${COLS.map(() => '<td class="c"></td>').join('')}<td class="tm">veri yok</td></tr>`;
    const v = Object.values(s), latest = v.length ? Math.max(...v.map(x => x.t)) : 0;
    return `<tr class="${rowCls(s)}" data-tf="${t}"><td class="sym">${t}</td><td class="px">${fmt(d.c[d.c.length - 1])}</td>${COLS.map(c => cellHtml(s[c[0]])).join('')}<td class="tm">${latest ? fmtTime(latest, t) : '-'}</td></tr>`;
  }).join('') + '</tbody>';
  el.onclick = e => { const tr = e.target.closest('tr[data-tf]'); if (tr) openDetail(pick(r.symbol, tr.dataset.tf)); };
}
