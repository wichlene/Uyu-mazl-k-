// Tek sembol + zaman dilimi için OHLC döndürür. Kaynak: Binance (kripto), Yahoo Finance (diğerleri)
const BIN = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w', '1M': '1M' };
const YF = { '5m': ['5m', '5d'], '15m': ['15m', '10d'], '1h': ['60m', '60d'], '4h': ['60m', '90d'], '1d': ['1d', '2y'], '1w': ['1wk', '10y'], '1M': ['1mo', '20y'] };

function aggregate(r, k) { // 1s -> 4s
  const out = { t: [], o: [], h: [], l: [], c: [] };
  for (let i = 0; i < r.t.length; i += k) {
    const j = Math.min(i + k, r.t.length);
    out.t.push(r.t[i]); out.o.push(r.o[i]);
    out.h.push(Math.max(...r.h.slice(i, j))); out.l.push(Math.min(...r.l.slice(i, j)));
    out.c.push(r.c[j - 1]);
  }
  return out;
}

module.exports = async (req, res) => {
  const { src, symbol, tf } = req.query;
  try {
    if (!symbol || !YF[tf]) return res.status(400).json({ error: 'symbol/tf gerekli' });
    let r = { t: [], o: [], h: [], l: [], c: [] };
    if (src === 'binance') {
      const j = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${BIN[tf]}&limit=300`).then(x => x.json());
      if (!Array.isArray(j)) throw new Error(j.msg || 'binance hata');
      for (const k of j) { r.t.push(k[0]); r.o.push(+k[1]); r.h.push(+k[2]); r.l.push(+k[3]); r.c.push(+k[4]); }
    } else {
      const [iv, range] = YF[tf];
      const resp = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${iv}&range=${range}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const j = await resp.json();
      const x = j.chart && j.chart.result && j.chart.result[0];
      if (!x) throw new Error('veri yok');
      const q = x.indicators.quote[0];
      x.timestamp.forEach((t, i) => {
        if ([q.open[i], q.high[i], q.low[i], q.close[i]].some(v => v == null)) return;
        r.t.push(t * 1000); r.o.push(q.open[i]); r.h.push(q.high[i]); r.l.push(q.low[i]); r.c.push(q.close[i]);
      });
      if (tf === '4h') r = aggregate(r, 4);
      for (const key of Object.keys(r)) r[key] = r[key].slice(-300);
    }
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');
    res.json(r);
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
};
