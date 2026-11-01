// İndikatörler + diverjans tespiti (tarayıcıda ve Node'da çalışır)
(function (root) {
  const sma = (a, n) => a.map((_, i) => i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((x, y) => x + y, 0) / n);
  function ema(a, n) {
    const k = 2 / (n + 1), out = new Array(a.length).fill(null);
    let prev = null;
    for (let i = 0; i < a.length; i++) {
      if (a[i] == null) continue;
      prev = prev == null ? a[i] : a[i] * k + prev * (1 - k);
      out[i] = i < n - 1 ? null : prev;
    }
    return out;
  }
  function rsi(c, n = 14) {
    const out = new Array(c.length).fill(null);
    let g = 0, l = 0;
    for (let i = 1; i < c.length; i++) {
      const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
      if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
      else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    }
    return out;
  }
  function macd(c, f = 12, s = 26) {
    const a = ema(c, f), b = ema(c, s);
    return c.map((_, i) => a[i] == null || b[i] == null ? null : a[i] - b[i]);
  }
  // KAIRI: kapanışın hareketli ortalamadan % sapması
  function kairi(c, n = 14) {
    const m = sma(c, n);
    return c.map((v, i) => m[i] == null ? null : (v - m[i]) / m[i] * 100);
  }
  // Bollinger %b
  function percentB(c, n = 20, k = 2) {
    return c.map((v, i) => {
      if (i < n - 1) return null;
      const w = c.slice(i - n + 1, i + 1), m = w.reduce((x, y) => x + y, 0) / n;
      const sd = Math.sqrt(w.reduce((x, y) => x + (y - m) ** 2, 0) / n);
      return sd === 0 ? 0.5 : (v - (m - k * sd)) / (2 * k * sd);
    });
  }
  // Stokastik yavaş %K (14,3,3)
  function stoch(h, l, c, n = 14, s1 = 3) {
    const raw = c.map((v, i) => {
      if (i < n - 1) return null;
      const hh = Math.max(...h.slice(i - n + 1, i + 1)), ll = Math.min(...l.slice(i - n + 1, i + 1));
      return hh === ll ? 50 : (v - ll) / (hh - ll) * 100;
    });
    const sm = (a, m) => a.map((_, i) => {
      if (i < m - 1 || a.slice(i - m + 1, i + 1).some(x => x == null)) return null;
      return a.slice(i - m + 1, i + 1).reduce((x, y) => x + y, 0) / m;
    });
    return sm(sm(raw, s1), 3);
  }
  function pivots(arr, L, R, type) {
    const out = [];
    for (let i = L; i < arr.length - R; i++) {
      let ok = true;
      for (let j = i - L; j <= i + R && ok; j++) {
        if (j === i) continue;
        if (type === 'high' ? arr[j] > arr[i] : arr[j] < arr[i]) ok = false;
        if (arr[j] === arr[i] && j < i) ok = false;
      }
      if (ok) out.push(i);
    }
    return out;
  }
  function indicators({ h, l, c }) {
    return { RSI: rsi(c), MACD: macd(c), KAIRI: kairi(c), '%b': percentB(c), STOCH: stoch(h, l, c) };
  }
  // Son iki tepe/dip üzerinden normal ve gizli diverjans
  function findDivergences(ohlc, opts = {}) {
    const { pivot = 4, minGap = 5, maxGap = 80, recent = 12 } = opts;
    const { h, l, c } = ohlc, n = c.length, res = [];
    if (n < 60) return res;
    const inds = indicators(ohlc);
    const ph = pivots(h, pivot, pivot, 'high'), pl = pivots(l, pivot, pivot, 'low');
    for (const [name, v] of Object.entries(inds)) {
      const test = (piv, price, isHigh) => {
        if (piv.length < 2) return;
        const b = piv[piv.length - 1], a = piv[piv.length - 2];
        if (b - a < minGap || b - a > maxGap || n - 1 - b > recent) return;
        if (v[a] == null || v[b] == null) return;
        const pUp = price[b] > price[a], pDn = price[b] < price[a];
        const iUp = v[b] > v[a], iDn = v[b] < v[a];
        let type = null;
        if (isHigh) { if (pUp && iDn) type = 'Düşüş (normal)'; else if (pDn && iUp) type = 'Düşüş (gizli)'; }
        else { if (pDn && iUp) type = 'Yükseliş (normal)'; else if (pUp && iDn) type = 'Yükseliş (gizli)'; }
        if (type) res.push({ ind: name, type, bull: type.startsWith('Yük'), barsAgo: n - 1 - b, gap: b - a, a, b, p1: price[a], p2: price[b], i1: v[a], i2: v[b] });
      };
      test(ph, h, true); test(pl, l, false);
    }
    return res;
  }
  // Klasik formasyonlar (tepe/dip noktalarından)
  function findPatterns(ohlc, opts = {}) {
    const { pivot = 4, recent = 20 } = opts, { h, l, c } = ohlc, n = c.length, out = [];
    if (n < 60) return out;
    const ph = pivots(h, pivot, pivot, 'high'), pl = pivots(l, pivot, pivot, 'low');
    const pct = (a, b) => (b - a) / a * 100;
    const add = (name, bull, pts) => {
      const last = Math.max(...pts.map(p => p.i));
      if (n - 1 - last > recent) return;
      out.push({ name, bull, pts, barsAgo: n - 1 - last, p1: pts[0].v, p2: pts[pts.length - 1].v, gap: last - pts[0].i });
    };
    const H = i => ({ i, v: h[i] }), Lw = i => ({ i, v: l[i] });
    const lowBetween = (a, b) => Math.min(...l.slice(a, b + 1)), highBetween = (a, b) => Math.max(...h.slice(a, b + 1));
    if (ph.length >= 2) {                       // çift tepe
      const a = ph[ph.length - 2], b = ph[ph.length - 1];
      if (b - a >= 8 && Math.abs(pct(h[a], h[b])) < 1.5 && pct(lowBetween(a, b), h[a]) > 2) add('Çift Tepe', false, [H(a), Lw(l.indexOf(lowBetween(a, b), a)), H(b)]);
    }
    if (pl.length >= 2) {                       // çift dip
      const a = pl[pl.length - 2], b = pl[pl.length - 1];
      if (b - a >= 8 && Math.abs(pct(l[a], l[b])) < 1.5 && pct(l[a], highBetween(a, b)) > 2) add('Çift Dip', true, [Lw(a), H(h.indexOf(highBetween(a, b), a)), Lw(b)]);
    }
    if (ph.length >= 3) {                       // omuz-baş-omuz
      const [a, b, d] = ph.slice(-3);
      if (h[b] > h[a] && h[b] > h[d] && pct(h[a], h[b]) > 2 && pct(h[d], h[b]) > 2 && Math.abs(pct(h[a], h[d])) < 3) add('Omuz-Baş-Omuz', false, [H(a), H(b), H(d)]);
    }
    if (pl.length >= 3) {                       // ters omuz-baş-omuz
      const [a, b, d] = pl.slice(-3);
      if (l[b] < l[a] && l[b] < l[d] && pct(l[b], l[a]) > 2 && pct(l[b], l[d]) > 2 && Math.abs(pct(l[a], l[d])) < 3) add('Ters Omuz-Baş-Omuz', true, [Lw(a), Lw(b), Lw(d)]);
    }
    if (ph.length >= 3 && pl.length >= 3) {     // üçgenler
      const hs = ph.slice(-3), ls = pl.slice(-3);
      const hc = pct(h[hs[0]], h[hs[2]]), lc = pct(l[ls[0]], l[ls[2]]);
      const start = Math.max(hs[0], ls[0]), end = Math.min(hs[2], ls[2]);
      const converging = (h[hs[2]] - l[ls[2]]) < (h[hs[0]] - l[ls[0]]) * 0.85;
      const pts = [...hs.map(H), ...ls.map(Lw)].sort((x, y) => x.i - y.i);
      if (converging && end > start - 1) {
        if (Math.abs(hc) < 1 && lc > 1.5) add('Yükselen Üçgen', true, pts);
        else if (Math.abs(lc) < 1 && hc < -1.5) add('Alçalan Üçgen', false, pts);
        else if (hc < -1.5 && lc > 1.5) add('Simetrik Üçgen', null, pts);
      }
    }
    return out;
  }
  const api = { findPatterns, indicators, sma, ema, rsi, macd, kairi, percentB, stoch, pivots, findDivergences };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DivLib = api;
})(typeof self !== 'undefined' ? self : this);
