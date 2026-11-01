// Tarama evreni: CoinGecko ilk 50 (Binance'te işlem görenler) + NASDAQ-100 + BIST + 20 emtia
const STABLES = new Set(['USDT','USDC','FDUSD','DAI','USDE','TUSD','USDS','PYUSD','USDD','BUSD','USD1','USDG','SUSDE','BSC-USD','STETH','WSTETH','WBTC','WETH','WEETH','WBETH','CBBTC','BUIDL','LEO','TON_']);
const FALLBACK = ['BTC','ETH','BNB','XRP','SOL','DOGE','TRX','ADA','LINK','AVAX','XLM','SUI','BCH','HBAR','LTC','SHIB','DOT','UNI','AAVE','NEAR','APT','ICP','ETC','ATOM','FIL','ARB','OP','INJ','TAO','ONDO'];

const NASDAQ = ['AAPL','MSFT','NVDA','AMZN','GOOGL','META','AVGO','TSLA','COST','NFLX','ASML','AMD','PEP','CSCO','ADBE','LIN','TMUS','QCOM','TXN','INTU','AMGN','ISRG','CMCSA','HON','AMAT','BKNG','VRTX','ADP','PANW','GILD','ADI','MU','SBUX','LRCX','MELI','KLAC','REGN','INTC','MDLZ','SNPS','CDNS','PYPL','CRWD','MAR','CTAS','ORLY','CSX','ABNB','MRVL','FTNT','ADSK','WDAY','ROP','NXPI','PCAR','CHTR','MNST','DASH','AEP','PAYX','CPRT','ROST','FAST','ODFL','KDP','KHC','EA','VRSK','CTSH','EXC','GEHC','XEL','LULU','IDXX','CCEP','DDOG','TEAM','ZS','ANSS','BKR','FANG','TTWO','ON','CDW','BIIB','GFS','MDB','DXCM','ILMN','WBD','MRNA','ARM','PDD','TTD','CSGP','CEG','PLTR','APP','AXON','SHOP'];
const BIST = ['AKBNK','ARCLK','ASELS','BIMAS','EKGYO','ENKAI','EREGL','FROTO','GARAN','GUBRF','HEKTS','ISCTR','KCHOL','KOZAL','KRDMD','MGROS','ODAS','OYAKC','PETKM','PGSUS','SAHOL','SASA','SISE','SOKM','TAVHL','TCELL','THYAO','TOASO','TSKB','TTKOM','TUPRS','ULKER','VAKBN','YKBNK','AEFES','AKSEN','ALARK','CCOLA','CIMSA','DOAS','EGEEN','ISGYO','KONTR','KORDS','MAVI','OTKAR','SMRTG','TKFEN','TURSG','VESTL'];
const COMMODITIES = [
  ['GC=F','Altın'],['SI=F','Gümüş'],['HG=F','Bakır'],['PL=F','Platin'],['PA=F','Paladyum'],
  ['CL=F','Ham Petrol (WTI)'],['BZ=F','Brent Petrol'],['NG=F','Doğalgaz'],['HO=F','Isıtma Yağı'],['RB=F','Benzin'],
  ['ZW=F','Buğday'],['ZC=F','Mısır'],['ZS=F','Soya'],['SB=F','Şeker'],['KC=F','Kahve'],
  ['CC=F','Kakao'],['CT=F','Pamuk'],['OJ=F','Portakal Suyu'],['LE=F','Canlı Sığır'],['HE=F','Domuz Eti']
];

module.exports = async (req, res) => {
  let coins = [], source = 'coingecko';
  try {
    const [cg, bn] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=60&page=1').then(r => r.json()),
      fetch('https://data-api.binance.vision/api/v3/ticker/price').then(r => r.json())
    ]);
    const listed = new Set(bn.map(x => x.symbol));
    coins = cg.filter(c => c.market_cap_rank <= 50).map(c => c.symbol.toUpperCase())
      .filter(s => !STABLES.has(s) && listed.has(s + 'USDT'));
  } catch (e) { source = 'fallback'; }
  if (!coins.length) coins = FALLBACK;
  for (const s of ['BTC', 'ETH', 'BNB']) if (!coins.includes(s)) coins.unshift(s);
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  res.json({
    source,
    items: [
      ...coins.map(s => ({ market: 'Kripto', src: 'binance', symbol: s + 'USDT', name: s })),
      ...NASDAQ.map(s => ({ market: 'NASDAQ', src: 'yahoo', symbol: s, name: s })),
      ...BIST.map(s => ({ market: 'BIST', src: 'yahoo', symbol: s + '.IS', name: s })),
      ...COMMODITIES.map(([s, n]) => ({ market: 'Emtia', src: 'yahoo', symbol: s, name: n }))
    ]
  });
};
