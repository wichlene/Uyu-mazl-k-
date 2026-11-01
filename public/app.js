const MARKETS = ['Kripto', 'NASDAQ', 'BIST', 'Emtia'];
const TFS = ['5m', '15m', '1h', '4h', '1d', '1w', '1M'];
const $ = id => document.getElementById(id);
const results = [], store = new Map();
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
  $('go').disabled = true; results.length = 0; render();
  $('status').textContent = 'Liste alınıyor...';
  const uni = await fetch('/api/universe').then(r => r.json());
  const items = uni.items.filter(x => mk.includes(x.market));
  const jobs = [];
  for (const it of items) for (const t of tf) jobs.push(async () => {
    const d = await fetch(`/api/candles?src=${it.src}&symbol=${encodeURIComponent(it.symbol)}&tf=${t}`).then(r => r.json());
    if (!d.c) return;
    store.set(it.symbol + '|' + t, d);
    for (const x of DivLib.findDivergences({ h: d.h, l: d.l, c: d.c })) results.push({ ...x, market: it.market, name: it.name, symbol: it.symbol, tf: t });
  });
  let done = 0; $('bar').hidden = false; $('bar').max = jobs.length;
  await pool(jobs, 8, () => { $('bar').value = ++done; $('status').textContent = `Taranıyor ${done}/${jobs.length} · bulunan: ${results.length}`; if (done % 10 === 0) render(); });
  $('status').textContent = `Bitti. ${items.length} varlık × ${tf.length} dilim tarandı, ${results.length} diverjans bulundu.`;
  $('bar').hidden = true; $('go').disabled = false; render();
};
function render() {
  const d = $('fDir').value, k = $('fKind').value, ind = $('fInd').value, q = $('fQ').value.toLowerCase();
  const rows = results.filter(r => (!d || (d === 'bull') === r.bull) && (!k || r.type.includes(k)) && (!ind || r.ind === ind) && (!q || r.name.toLowerCase().includes(q)))
    .sort((a, b) => a.barsAgo - b.barsAgo);
  $('tbl').tBodies[0].innerHTML = rows.map((r, i) => `<tr data-i="${results.indexOf(r)}" class="${r.bull ? 'bull' : 'bear'}"><td>${r.market}</td><td>${r.name}</td><td>${r.tf}</td><td>${r.ind}</td><td>${r.type}</td><td>${r.barsAgo}</td><td>${fmt(r.p1)} → ${fmt(r.p2)}</td><td>${fmt(r.i1)} → ${fmt(r.i2)}</td></tr>`).join('');
}
['fDir', 'fKind', 'fInd', 'fQ'].forEach(id => $(id).oninput = render);

$('tbl').tBodies[0].onclick = e => { const tr = e.target.closest('tr'); if (tr) openDetail(results[+tr.dataset.i]); };
$('close').onclick = () => $('modal').hidden = true;
$('modal').onclick = e => { if (e.target === $('modal')) $('modal').hidden = true; };

function openDetail(r) {
  const d = store.get(r.symbol + '|' + r.tf); if (!d) return;
  $('modal').hidden = false;
  const all = DivLib.findDivergences(d).filter(x => true);
  $('mTitle').textContent = `${r.name} · ${r.tf} · ${r.ind} ${r.type} diverjansı`;
  const sel = $('mInd'); sel.innerHTML = ['RSI', 'MACD', 'KAIRI', '%b', 'STOCH'].map(x => `<option ${x === r.ind ? 'selected' : ''}>${x}</option>`).join('');
  const draw = () => drawChart(d, sel.value, all);
  sel.onchange = draw; draw();
  $('mList').innerHTML = all.map(x => `<li class="${x.bull ? 'bull' : 'bear'}"><b>${x.ind}</b> – ${x.type}: fiyat ${fmt(x.p1)} → ${fmt(x.p2)}, indikatör ${fmt(x.i1)} → ${fmt(x.i2)}, ${x.gap} mum arayla, ${x.barsAgo} mum önce</li>`).join('') || '<li>Bu varlıkta başka diverjans yok.</li>';
  $('mHow').textContent = r.bull
    ? 'Yükseliş diverjansı: fiyat dip noktaları birbirine göre yön ayrışması gösteriyor; satış baskısı zayıflıyor olabilir, yukarı dönüş ihtimali artar.'
    : 'Düşüş diverjansı: fiyat tepe noktaları birbirine göre yön ayrışması gösteriyor; alış gücü zayıflıyor olabilir, aşağı dönüş ihtimali artar.';
}
function drawChart(d, indName, all) {
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
