const MARKETS = ['Kripto', 'NASDAQ', 'BIST', 'Emtia'];
const TFS = ['5m', '15m', '1h', '4h', '1d', '1w', '1M'];
const $ = id => document.getElementById(id);
const results = [], store = new Map(), itemMap = new Map(), sigCache = new Map();
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
  $('go').disabled = true; scanning = true; results.length = 0; store.clear(); sigCache.clear(); itemMap.clear(); render();
  $('status').textContent = 'Liste alınıyor...';
  const uni = await fetch('/api/universe').then(r => r.json());
  const items = uni.items.filter(x => mk.includes(x.market));
  const jobs = [];
  for (const it of items) for (const t of tf) jobs.push(async () => {
    const d = await fetch(`/api/candles?src=${it.src}&symbol=${encodeURIComponent(it.symbol)}&tf=${t}`).then(r => r.json());
    if (!d.c) return;
    store.set(it.symbol + '|' + t, d); itemMap.set(it.symbol, it);
    for (const x of DivLib.findDivergences({ h: d.h, l: d.l, c: d.c })) results.push({ ...x, time: d.t[x.b], market: it.market, name: it.name, symbol: it.symbol, tf: t });
  });
  let done = 0; $('bar').hidden = false; $('bar').max = jobs.length;
  await pool(jobs, 8, () => { $('bar').value = ++done; $('status').textContent = `Taranıyor ${done}/${jobs.length} · bulunan: ${results.length}`; if (done % 10 === 0) render(); });
  fillTfs(tf);
  $('status').textContent = `Bitti. ${items.length} varlık × ${tf.length} dilim tarandı, ${results.length} diverjans bulundu.`;
  scanning = false; $('bar').hidden = true; $('go').disabled = false; if (!tf.includes(curTf)) curTf = tf[0]; render(); fillTfs(tf);
  if (!curSym) { const first = itemMap.has('BTCUSDT') ? 'BTCUSDT' : [...itemMap.keys()][0]; if (first) loadAndOpen(first, curTf); }
};
function render() {
  const d = $('fDir').value, k = $('fKind').value, ind = $('fInd').value, q = $('fQ').value.toLowerCase();
  const rows = results.filter(r => (!d || (d === 'bull' ? r.bull === true : r.bull === false)) && (!k || r.type.includes(k)) && (!ind || r.ind === ind) && (!q || r.name.toLowerCase().includes(q)))
    .sort((a, b) => a.barsAgo - b.barsAgo);
  $('empty').hidden = rows.length > 0;
  $('empty').textContent = results.length ? 'Filtrelere uyan sinyal yok.' : (scanning ? 'Taranıyor…' : 'Henüz sinyal yok.');
  $('sAll').textContent = results.length; $('sBull').textContent = results.filter(r => r.bull === true).length;
  $('sBear').textContent = results.filter(r => r.bull === false).length; $('sScan').textContent = itemMap.size;
  $('feed').innerHTML = rows.slice(0, 400).map(r => `<div class="sig ${r.bull === null ? 'neu' : r.bull ? 'bull' : 'bear'}" data-i="${results.indexOf(r)}"><div class="s1"><b>${r.name}</b><span class="tf">${r.tf}</span><span class="pill ${r.bull === null ? 'neu' : r.bull ? 'bull' : 'bear'}">${r.type}</span></div><div class="s2">${r.ind} · ${r.time ? fmtTime(r.time, r.tf) : '-'} · ${r.barsAgo} mum önce · ${fmt(r.p1)} → ${fmt(r.p2)}</div></div>`).join('');
  renderWatch(); renderTicker();
}
['fDir', 'fKind', 'fInd', 'fQ'].forEach(id => $(id).oninput = render);

$('feed').onclick = e => { const el = e.target.closest('.sig'); if (el) { const r = results[+el.dataset.i]; curTf = r.tf; openDetail(r); } };
$('wQ').oninput = renderWatch;
$('tickTrack').onclick = e => { const el = e.target.closest('.tk'); if (el) loadAndOpen(el.dataset.sym, curTf); };
let scanning = false, curTf = '1h', curSym = null;
async function loadAndOpen(sym, tf) {
  const it = IT(sym); if (!it) return;
  curTf = tf;
  if (!store.has(sym + '|' + tf)) {
    try { const d = await fetch(`/api/candles?src=${it.src}&symbol=${encodeURIComponent(sym)}&tf=${tf}`).then(x => x.json()); if (d.c) store.set(sym + '|' + tf, d); } catch (e) {}
  }
  if (store.has(sym + '|' + tf)) openDetail(pick(sym, tf));
}
function lastChg(d) { const n = d.c.length; return n > 1 ? (d.c[n - 1] - d.c[n - 2]) / d.c[n - 2] * 100 : 0; }
const chgHtml = c => `<span class="${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '+' : ''}${c.toFixed(2)}%</span>`;
let watch = []; try { watch = JSON.parse(localStorage.getItem('watch') || '[]'); } catch (e) {}
const saveWatch = () => { try { localStorage.setItem('watch', JSON.stringify(watch)); } catch (e) {} };
const IT = sym => itemMap.get(sym) || watch.find(w => w.symbol === sym);
const tried = new Set();
function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200); }
function addWatch(sym, tf) {
  const it = IT(sym); if (!it) return;
  if (watch.some(w => w.symbol === sym && w.tf === tf)) return toast(`${it.name} · ${tf} zaten listede`);
  watch.push({ symbol: sym, tf, name: it.name, market: it.market, src: it.src }); saveWatch(); renderWatch(); toast(`★ ${it.name} · ${tf} izleme listesine eklendi`);
}
function renderWatch() {
  const q = $('wQ').value.toLowerCase();
  const rows = watch.map((w, i) => ({ w, i })).filter(x => !q || x.w.name.toLowerCase().includes(q));
  rows.forEach(({ w }) => {
    const k = w.symbol + '|' + w.tf;
    if (!store.has(k) && !tried.has(k)) { tried.add(k); fetch(`/api/candles?src=${w.src}&symbol=${encodeURIComponent(w.symbol)}&tf=${w.tf}`).then(r => r.json()).then(d => { if (d.c) { store.set(k, d); renderWatch(); } }).catch(() => {}); }
  });
  $('wl').innerHTML = rows.length ? rows.map(({ w, i }) => {
    const d = store.get(w.symbol + '|' + w.tf), sg = d ? sigs(w.symbol, w.tf) : null, v = sg ? Object.values(sg) : [];
    const b = v.some(x => x.bull === true), r = v.some(x => x.bull === false), kind = b && r ? 'both' : b ? 'bull' : r ? 'bear' : '';
    return `<div class="w ${w.symbol === curSym && w.tf === curTf ? 'sel' : ''}" data-i="${i}"><span class="n"><i class="dot ${kind}"></i>${w.name}<small>${w.tf}</small></span><span>${d ? fmt(d.c[d.c.length - 1]) : '…'}</span><span>${d ? chgHtml(lastChg(d)) : ''}</span><button class="x" data-del="${i}" title="Listeden kaldır">×</button></div>`;
  }).join('') : '<div class="wempty">İzleme listen boş.<br><small>Grafiğe veya bir sinyale <b>sağ tıkla</b> (telefonda uzun bas) ya da <b>★ İzleme</b> düğmesine bas.</small></div>';
}
function renderTicker() {
  const tf = curTf;
  const tk = [...itemMap.values()].map(it => ({ it, d: store.get(it.symbol + '|' + tf) })).filter(x => x.d).slice(0, 40).map(r => `<span class="tk" data-sym="${r.it.symbol}"><b>${r.it.name}</b>${fmt(r.d.c[r.d.c.length - 1])}<span>${chgHtml(lastChg(r.d))}</span></span>`).join('');
  $('tickTrack').innerHTML = tk + tk;
}
$('wl').onclick = e => {
  const del = e.target.closest('[data-del]');
  if (del) { watch.splice(+del.dataset.del, 1); saveWatch(); return renderWatch(); }
  const el = e.target.closest('.w'); if (el) { const w = watch[+el.dataset.i]; if (w) loadAndOpen(w.symbol, w.tf); }
};
$('addW').onclick = () => curSym && addWatch(curSym, curTf);
// sağ tık / uzun basış menüsü
document.addEventListener('contextmenu', e => {
  let sym = null, tf = null, del = null;
  const sg = e.target.closest('.sig'), tk = e.target.closest('.tk'), w = e.target.closest('.w');
  if (w) del = +w.dataset.i;
  else if (sg) { const r = results[+sg.dataset.i]; sym = r.symbol; tf = r.tf; }
  else if (tk) { sym = tk.dataset.sym; tf = curTf; }
  else if (e.target.closest('#lw') && curSym) { sym = curSym; tf = curTf; }
  else return;
  e.preventDefault();
  const m = $('ctx'), it = sym && IT(sym);
  m.innerHTML = del != null ? `<button data-a="del">🗑 Listeden kaldır</button>` : `<button data-a="add">★ İzleme listesine ekle <b>${it ? it.name : ''} · ${tf}</b></button>`;
  m.dataset.sym = sym || ''; m.dataset.tf = tf || ''; m.dataset.del = del == null ? '' : del;
  m.hidden = false; m.style.left = Math.min(e.clientX, innerWidth - 270) + 'px'; m.style.top = Math.min(e.clientY, innerHeight - 60) + 'px';
});
$('ctx').onclick = e => {
  const b = e.target.closest('button'), m = $('ctx'); if (!b) return;
  if (b.dataset.a === 'add') addWatch(m.dataset.sym, m.dataset.tf);
  else { watch.splice(+m.dataset.del, 1); saveWatch(); renderWatch(); }
  m.hidden = true;
};
document.addEventListener('click', e => { if (!e.target.closest('#ctx')) $('ctx').hidden = true; });
document.addEventListener('scroll', () => $('ctx').hidden = true, true);

function openDetail(r) {
  const d = store.get(r.symbol + '|' + r.tf); if (!d) return;
  $('modal').hidden = false; $('ph').hidden = true; curSym = r.symbol; curTf = r.tf;
  $('hSym').textContent = r.name; $('hPrice').textContent = fmt(d.c[d.c.length - 1]);
  const ch = lastChg(d); $('hChg').innerHTML = chgHtml(ch);
  $('tfBar').innerHTML = TFS.map(t => `<button data-tf="${t}" class="${t === r.tf ? 'on' : ''}">${t}</button>`).join('');
  $('tfBar').onclick = e => { const b = e.target.closest('button'); if (b) loadAndOpen(r.symbol, b.dataset.tf); };
  renderWatch(); renderTicker();
  const all = DivLib.findDivergences(d), pats = [];
  $('mTitle').textContent = r.none ? `${r.name} · ${r.tf}` : `${r.name} · ${r.tf} · ${r.ind === 'Formasyon' ? r.type + ' formasyonu' : r.ind + ' ' + r.type + ' diverjansı'}`;
  const sel = $('mInd'); sel.innerHTML = ['RSI', 'MACD', 'KAIRI', '%b', 'STOCH'].map(x => `<option ${x === r.ind ? 'selected' : ''}>${x}</option>`).join('');
  const draw = () => drawChart(d, sel.value, all, pats);
  curR = r; $('tfBadge').textContent = '⏱ ' + TF_TR[r.tf] + ' grafik'; showTab(false); sel.onchange = draw; draw(); coinMatrix(r); setTv(r);
  $('mList').innerHTML = pats.map(x => `<li class="${x.bull === null ? '' : x.bull ? 'bull' : 'bear'}"><b>${x.name}</b> – ${fmtFull(d.t[x.pts[0].i])} → ${fmtFull(d.t[Math.max(...x.pts.map(q => q.i))])} (${x.barsAgo} mum önce), fiyat ${fmt(x.p1)} → ${fmt(x.p2)}</li>`).join('') + all.map(x => `<li class="${x.bull ? 'bull' : 'bear'}"><b>${x.ind}</b> – ${x.type}: ${fmtFull(d.t[x.a])} → ${fmtFull(d.t[x.b])} (${x.barsAgo} mum önce), fiyat ${fmt(x.p1)} → ${fmt(x.p2)}, indikatör ${fmt(x.i1)} → ${fmt(x.i2)}</li>`).join('') || '<li>Bu varlıkta başka diverjans yok.</li>';
  $('mHow').textContent = r.none ? '' : r.ind === 'Formasyon' ? ({ 'Çift Tepe': 'İki benzer tepe ve aradaki vadi: yükseliş tükeniyor olabilir; vadinin altı kırılırsa düşüş teyit olur.', 'Çift Dip': 'İki benzer dip: düşüş tükeniyor olabilir; arasındaki tepe kırılırsa yükseliş teyit olur.', 'Omuz-Baş-Omuz': 'Ortadaki tepe en yüksek: trend dönüş formasyonu; boyun çizgisi kırılırsa düşüş beklenir.', 'Ters Omuz-Baş-Omuz': 'Ortadaki dip en düşük: dönüş formasyonu; boyun çizgisi kırılırsa yükseliş beklenir.', 'Yükselen Üçgen': 'Düz direnç, yükselen dipler: genelde yukarı kırılım beklenir.', 'Alçalan Üçgen': 'Düz destek, alçalan tepeler: genelde aşağı kırılım beklenir.', 'Simetrik Üçgen': 'Daralan fiyat: yön belirsiz, kırılım yönü takip edilmeli.' }[r.type] || '')
    : r.bull
    ? 'Yükseliş diverjansı: fiyat dip noktaları birbirine göre yön ayrışması gösteriyor; satış baskısı zayıflıyor olabilir, yukarı dönüş ihtimali artar.'
    : 'Düşüş diverjansı: fiyat tepe noktaları birbirine göre yön ayrışması gösteriyor; alış gücü zayıflıyor olabilir, aşağı dönüş ihtimali artar.';
}
const TF_TR = { '5m': '5 dakikalık', '15m': '15 dakikalık', '1h': '1 saatlik', '4h': '4 saatlik', '1d': 'Günlük', '1w': 'Haftalık', '1M': 'Aylık' };
let lw = null, curR = null;
function drawChart(d, indName, all, pats) {
  const LC = LightweightCharts, el = $('lw');
  if (lw) { lw.remove(); lw = null; }
  lw = LC.createChart(el, {
    autoSize: true, layout: { background: { color: '#161a1e' }, textColor: '#848e9c', panes: { separatorColor: '#2b3139' } },
    grid: { vertLines: { color: '#20262d' }, horzLines: { color: '#20262d' } },
    localization: { locale: 'tr-TR', timeFormatter: t => fmtFull(t * 1000) },
    timeScale: { timeVisible: true, borderColor: '#2b3139', tickMarkFormatter: (t, type) => { const dt = new Date(t * 1000); return type >= 3 ? dt.toLocaleTimeString('tr-TR', { ...TZ, hour: '2-digit', minute: '2-digit' }) : dt.toLocaleDateString('tr-TR', { ...TZ, day: '2-digit', month: '2-digit' }); } },
    rightPriceScale: { borderColor: '#2b3139' }
  });
  const T = d.t.map(t => Math.floor(t / 1000)), n = d.c.length;
  const ok = i => i > 0 ? T[i] > T[i - 1] : true;
  const idx = [...Array(n).keys()].filter(ok);
  const candles = lw.addSeries(LC.CandlestickSeries, { upColor: '#0ecb81', downColor: '#f6465d', borderVisible: false, wickUpColor: '#0ecb81', wickDownColor: '#f6465d' }, 0);
  candles.setData(idx.map(i => ({ time: T[i], open: d.o[i], high: d.h[i], low: d.l[i], close: d.c[i] })));
  const byTime = new Map(idx.map(i => [T[i], i]));
  const legend = i => { $('lwLeg').innerHTML = `<b>${TF_TR[curR.tf]}</b> · <b>${fmtFull(d.t[i])}</b> · A ${fmt(d.o[i])} · Y ${fmt(d.h[i])} · D ${fmt(d.l[i])} · K ${fmt(d.c[i])}`; };
  legend(n - 1);
  lw.subscribeCrosshairMove(pr => { const i = pr.time != null ? byTime.get(pr.time) : null; legend(i != null ? i : n - 1); });
  const ind = DivLib.indicators(d)[indName];
  const il = lw.addSeries(LC.LineSeries, { color: '#f0b429', lineWidth: 2, priceLineVisible: false, title: indName }, 1);
  il.setData(idx.filter(i => ind[i] != null).map(i => ({ time: T[i], value: ind[i] })));
  const LV = { RSI: [[30, '#f6465d'], [50, '#4a5160'], [70, '#0ecb81']], STOCH: [[20, '#f6465d'], [50, '#4a5160'], [80, '#0ecb81']], '%b': [[0, '#f6465d'], [0.5, '#4a5160'], [1, '#0ecb81']], MACD: [[0, '#848e9c']], KAIRI: [[0, '#848e9c']] }[indName] || [];
  const lo = Math.min(...LV.map(x => x[0])), hi = Math.max(...LV.map(x => x[0]));
  il.applyOptions({ autoscaleInfoProvider: orig => { const r = orig(); if (!r) return { priceRange: { minValue: lo, maxValue: hi } }; r.priceRange.minValue = Math.min(r.priceRange.minValue, lo); r.priceRange.maxValue = Math.max(r.priceRange.maxValue, hi); return r; } });
  LV.forEach(([v, c]) => il.createPriceLine({ price: v, color: c, lineWidth: 1, lineStyle: LC.LineStyle.Dashed, axisLabelVisible: true, title: '' }));
  const seg = (pane, p1, p2, col, style, w) => {
    const sr = lw.addSeries(LC.LineSeries, { color: col, lineWidth: w || 2, lineStyle: style, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }, pane);
    sr.setData([p1, p2].sort((x, y) => x.time - y.time)); return sr;
  };
  all.filter(r => r.ind === indName).forEach(r => {
    const col = r.bull ? '#3ddc97' : '#ffd166', st = r.type.includes('gizli') ? LC.LineStyle.Dotted : LC.LineStyle.Dashed, hi = r.type.startsWith('Düş');
    const A = { time: T[r.a], value: r.p1 }, B = { time: T[r.b], value: r.p2 };
    const ps = seg(0, A, B, col, st, 2);
    LC.createSeriesMarkers(ps, [
      { time: A.time, position: hi ? 'aboveBar' : 'belowBar', color: col, shape: 'circle', text: fmtFull(d.t[r.a]) },
      { time: B.time, position: hi ? 'aboveBar' : 'belowBar', color: col, shape: 'circle', text: r.type + ' · ' + fmtFull(d.t[r.b]) }
    ].sort((x, y) => x.time - y.time));
    seg(1, { time: T[r.a], value: r.i1 }, { time: T[r.b], value: r.i2 }, col, st, 2);
  });
  (pats || []).forEach(p => {
    const col = p.bull === null ? '#9aa4ff' : p.bull ? '#3ddc97' : '#ffd166';
    const pts = p.pts.map(q => ({ time: T[q.i], value: q.v })).filter((q, k, a) => k === 0 || q.time > a[k - 1].time);
    if (pts.length < 2) return;
    const sr = lw.addSeries(LC.LineSeries, { color: col, lineWidth: 3, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }, 0);
    sr.setData(pts);
    LC.createSeriesMarkers(sr, [{ time: pts[pts.length - 1].time, position: 'aboveBar', color: col, shape: 'arrowDown', text: p.name + ' · ' + fmtFull(pts[pts.length - 1].time * 1000) }]);
  });
  try { lw.panes()[1].setHeight(150); } catch (e) {}
  lw.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n + 8 });
}
function showTab(tv) {
  $('lw').hidden = tv; $('tvw').hidden = !tv; $('mInd').parentElement.hidden = tv;
  $('tabLw').className = tv ? '' : 'on'; $('tabTv').className = tv ? 'on' : '';
  if (!tv) return;
  const r = curR; if (!r) return;
  const make = () => { $('tvw').innerHTML = '<div id="tvw_in"></div>'; new TradingView.widget({ container_id: 'tvw_in', symbol: tvSymbol(r), interval: TV_IV[r.tf], theme: 'dark', locale: 'tr', autosize: true, style: '1', hide_side_toolbar: false, allow_symbol_change: true, studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies', 'Stochastic@tv-basicstudies'] }); };
  if (window.TradingView) return make();
  const sc = document.createElement('script'); sc.src = 'https://s3.tradingview.com/tv.js'; sc.onload = make;
  sc.onerror = () => { $('tvw').textContent = 'TradingView yüklenemedi (internet / reklam engelleyici?). "TradingView\'de aç" butonunu kullan.'; };
  document.head.appendChild(sc);
}
$('tabLw').onclick = () => showTab(false); $('tabTv').onclick = () => showTab(true);

// ---- Matris görünümü (TradingView screener tarzı) ----
const COLS = [['RSI', 'R'], ['MACD', 'M'], ['KAIRI', 'K'], ['%b', '%b'], ['STOCH', 'S']];
function sigs(sym, tf) {
  const k = sym + '|' + tf; if (sigCache.has(k)) return sigCache.get(k);
  const d = store.get(k); if (!d) return null;
  const o = {}, put = (key, bull, barsAgo, t) => { if (!o[key] || barsAgo < o[key].barsAgo) o[key] = { bull, barsAgo, t }; };
  DivLib.findDivergences(d).forEach(x => put(x.ind, x.bull, x.barsAgo, d.t[x.b]));
  sigCache.set(k, o); return o;
}
const TZ = { timeZone: 'Europe/Istanbul' };
const fmtTime = (t, tf) => { const d = new Date(t), s = d.toLocaleDateString('tr-TR', TZ); return ['5m', '15m', '1h', '4h'].includes(tf) ? s + ' ' + d.toLocaleTimeString('tr-TR', { ...TZ, hour: '2-digit', minute: '2-digit' }) : s; };
const fmtFull = t => new Date(t).toLocaleString('tr-TR', { ...TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const cellHtml = s => s ? `<td class="c ${s.bull === null ? 'neu' : s.bull ? 'bull' : 'bear'}" title="${s.barsAgo} mum önce"></td>` : '<td class="c"></td>';
function rowCls(o) {
  const v = Object.values(o), b = v.some(x => x.bull === true), r = v.some(x => x.bull === false);
  return b && r ? 'ro' : b ? 'rg' : r ? 'rr' : 'rn';
}
const head = first => `<thead><tr>${first}${COLS.map(c => `<th title="${c[0]}">${c[1]}</th>`).join('')}<th>Sinyal zamanı</th></tr></thead>`;
function pick(sym, tf) {
  const it = IT(sym);
  const r = results.filter(x => x.symbol === sym && x.tf === tf).sort((a, b) => a.barsAgo - b.barsAgo)[0];
  if (r) return r;
  const o = sigs(sym, tf) || {}, best = Object.entries(o).sort((a, b) => a[1].barsAgo - b[1].barsAgo)[0];
  return { market: it.market, name: it.name, symbol: sym, tf, ind: best ? best[0] : 'RSI', type: '', bull: best ? best[1].bull : true, none: true };
}
function fillTfs(tf) {
  const sel = $('mxTf'), cur = sel.value;
  sel.innerHTML = tf.map(t => `<option ${t === cur ? 'selected' : ''}>${t}</option>`).join('');
  renderMatrix();
}
function renderMatrix() {
  const tf = $('mxTf').value, q = $('fQ').value.toLowerCase();
  const rows = [...itemMap.values()].filter(it => !q || it.name.toLowerCase().includes(q)).map(it => {
    const d = store.get(it.symbol + '|' + tf); if (!d) return null;
    const s = sigs(it.symbol, tf), v = Object.values(s);
    return { it, d, s, latest: v.length ? Math.max(...v.map(x => x.t)) : 0 };
  }).filter(Boolean).sort((a, b) => b.latest - a.latest);
  $('mx').innerHTML = head('<th>Sembol</th><th>Fiyat</th>') + '<tbody>' + rows.map(r =>
    `<tr class="${rowCls(r.s)}" data-sym="${r.it.symbol}"><td class="sym">${r.it.name}</td><td class="px">${fmt(r.d.c[r.d.c.length - 1])}</td>${COLS.map(c => cellHtml(r.s[c[0]])).join('')}<td class="tm">${r.latest ? fmtTime(r.latest, tf) : '-'}</td></tr>`).join('') + '</tbody>';
}
$('mxTf').onchange = renderMatrix;
$('mx').onclick = e => { const tr = e.target.closest('tr[data-sym]'); if (tr) openDetail(pick(tr.dataset.sym, $('mxTf').value)); };
function bt(k) {
  $('pTf').hidden = k !== 'tf'; $('mList').hidden = k !== 'list'; $('pMx').hidden = k !== 'mx';
  $('bTfs').className = k === 'tf' ? 'on' : ''; $('bList').className = k === 'list' ? 'on' : ''; $('bMx').className = k === 'mx' ? 'on' : '';
  if (k === 'mx') renderMatrix();
}
$('bTfs').onclick = () => bt('tf'); $('bList').onclick = () => bt('list'); $('bMx').onclick = () => bt('mx');

let mToken = 0;
async function coinMatrix(r) {
  const my = ++mToken, it = IT(r.symbol), el = $('mMat');
  el.innerHTML = '<tbody><tr><td>Zaman dilimleri yükleniyor...</td></tr></tbody>';
  await Promise.all(TFS.filter(t => !store.has(r.symbol + '|' + t)).map(async t => {
    try { const d = await fetch(`/api/candles?src=${it.src}&symbol=${encodeURIComponent(r.symbol)}&tf=${t}`).then(x => x.json()); if (d.c) store.set(r.symbol + '|' + t, d); } catch (e) {}
  }));
  if (my !== mToken) return;
  el.innerHTML = head('<th>Dilim</th><th>Fiyat</th>') + '<tbody>' + TFS.map(t => {
    const s = sigs(r.symbol, t), d = store.get(r.symbol + '|' + t);
    if (!s) return `<tr class="rn"><td class="sym">${t}</td><td class="px">-</td>${COLS.map(() => '<td class="c"></td>').join('')}<td class="tm">veri yok</td></tr>`;
    const v = Object.values(s), latest = v.length ? Math.max(...v.map(x => x.t)) : 0;
    return `<tr class="${rowCls(s)}${t === r.tf ? ' cur' : ''}" data-tf="${t}"><td class="sym">${t === r.tf ? '▶ ' : ''}${t}</td><td class="px">${fmt(d.c[d.c.length - 1])}</td>${COLS.map(c => cellHtml(s[c[0]])).join('')}<td class="tm">${latest ? fmtTime(latest, t) : '-'}</td></tr>`;
  }).join('') + '</tbody>';
  el.onclick = e => { const tr = e.target.closest('tr[data-tf]'); if (tr) openDetail(pick(r.symbol, tr.dataset.tf)); };
}

// ---- TradingView bağlantısı ----
const TV_FUT = { 'GC=F': 'COMEX:GC1!', 'SI=F': 'COMEX:SI1!', 'HG=F': 'COMEX:HG1!', 'PL=F': 'NYMEX:PL1!', 'PA=F': 'NYMEX:PA1!', 'CL=F': 'NYMEX:CL1!', 'BZ=F': 'NYMEX:BZ1!', 'NG=F': 'NYMEX:NG1!', 'HO=F': 'NYMEX:HO1!', 'RB=F': 'NYMEX:RB1!', 'ZW=F': 'CBOT:ZW1!', 'ZC=F': 'CBOT:ZC1!', 'ZS=F': 'CBOT:ZS1!', 'SB=F': 'ICEUS:SB1!', 'KC=F': 'ICEUS:KC1!', 'CC=F': 'ICEUS:CC1!', 'CT=F': 'ICEUS:CT1!', 'OJ=F': 'ICEUS:OJ1!', 'LE=F': 'CME:LE1!', 'HE=F': 'CME:HE1!' };
const TV_IV = { '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W', '1M': 'M' };
function tvSymbol(r) {
  if (r.market === 'Kripto') return 'BINANCE:' + r.symbol;
  if (r.market === 'Emtia') return TV_FUT[r.symbol] || r.symbol;
  if (r.market === 'BIST') return 'BIST:' + r.name;
  return 'NASDAQ:' + r.name;
}
function setTv(r) {
  const inp = $('tvLayout'); inp.value = localStorage.getItem('tvLayout') || '';
  const upd = () => {
    const m = inp.value.match(/chart\/([A-Za-z0-9]+)/), id = m && m[1];
    localStorage.setItem('tvLayout', inp.value.trim());
    $('tvBtn').href = `https://www.tradingview.com/chart/${id ? id + '/' : ''}?symbol=${encodeURIComponent(tvSymbol(r))}&interval=${TV_IV[r.tf]}`;
  };
  inp.oninput = upd; upd();
}

$('pineBtn').onclick = async () => {
  const code = await fetch('/divergence.pine').then(r => r.text());
  try { await navigator.clipboard.writeText(code); $('pineBtn').textContent = 'Kopyalandı ✓ TradingView > Pine Editor > yapıştır > Grafiğe ekle'; }
  catch (e) { prompt('Kodu kopyala:', code); }
};

$('go').click();

// ---- Mobil sekme çubuğu ----
const setM = m => { $('term').dataset.m = m; document.querySelectorAll('#mnav button').forEach(b => b.className = b.dataset.m === m ? 'on' : ''); };
$('mnav').onclick = e => { const b = e.target.closest('button'); if (b) setM(b.dataset.m); };
const mobile = () => matchMedia('(max-width:1000px)').matches;
const _open = openDetail;
openDetail = function (r) { _open(r); if (mobile()) { setM('chart'); window.scrollTo(0, 0); } };

$('cfg').onclick = () => $('tb').classList.toggle('open');
