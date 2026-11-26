import json, traceback, urllib.request
import yfinance as yf
out = []
def log(*a): out.append(" ".join(str(x) for x in a))
for isin in ["FR0010655746", "IE00B5BMR087", "IE000N4ZYX28", "IE00BYX5N771", "IE00B4L5Y983"]:
    try:
        q = yf.Search(isin, max_results=8).quotes or []
        log("SEARCH", isin, [(x.get("symbol"), x.get("quoteType"), x.get("exchange")) for x in q])
        for x in q[:3]:
            s = x["symbol"]
            try:
                fd = yf.Ticker(s).funds_data
                th = fd.top_holdings
                log("  ", s, "holdings:", th.head(12).to_dict() if th is not None else None)
                log("  ", s, "sectores:", fd.sector_weightings)
                log("  ", s, "clases:", fd.asset_classes)
            except Exception as e:
                log("  ", s, "ERR", repr(e)[:200])
    except Exception as e:
        log("ERR", isin, repr(e)[:200])
H = {"User-Agent": "Mozilla/5.0", "Accept": "application/json, text/plain, */*", "Referer": "https://www.ls-tc.de/"}
for url in ["https://www.ls-tc.de/_rpc/json/.lstc/instrument/search/main?q=FR0010655746&localeId=2",
            "https://www.ls-tc.de/_rpc/json/.lstc/instrument/search/main?q=US67066G1040&localeId=2",
            "https://www.ls-tc.de/de/etf/FR0010655746", "https://www.ls-tc.de/de/aktie/US67066G1040"]:
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=20)
        b = r.read().decode("utf-8", "replace")
        log("LS", url, r.status, b[:1500].replace("\n", " "))
        import re
        log("   ids", sorted(set(re.findall(r'instrumentId[\"=:\s]+(\d+)', b)))[:10], sorted(set(re.findall(r'push\.ls-tc\.de[^"\']*|_rpc/json/[^"\'\s]+', b)))[:15])
    except Exception as e:
        log("LS ERR", url, repr(e)[:300])
open("data/_prueba.txt", "w").write("\n".join(out))
