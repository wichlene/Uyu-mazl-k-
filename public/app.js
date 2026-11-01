const MARKETS = ['Kripto', 'NASDAQ', 'BIST', 'Emtia'];
const TFS = ['5m', '15m', '1h', '4h', '1d', '1w', '1M'];
const $ = id => document.getElementById(id);
const results = [];
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
    for (const x of DivLib.findDivergences({ h: d.h, l: d.l, c: d.c })) results.push({ ...x, market: it.market, name: it.name, tf: t });
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
  $('tbl').tBodies[0].innerHTML = rows.map(r => `<tr class="${r.bull ? 'bull' : 'bear'}"><td>${r.market}</td><td>${r.name}</td><td>${r.tf}</td><td>${r.ind}</td><td>${r.type}</td><td>${r.barsAgo}</td><td>${fmt(r.p1)} → ${fmt(r.p2)}</td><td>${fmt(r.i1)} → ${fmt(r.i2)}</td></tr>`).join('');
}
['fDir', 'fKind', 'fInd', 'fQ'].forEach(id => $(id).oninput = render);
