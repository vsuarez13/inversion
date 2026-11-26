import json, re, urllib.request
out = []
def log(*a): out.append(" ".join(str(x) for x in a))
H = {"User-Agent": "Mozilla/5.0", "Accept": "application/json, text/plain, */*", "Referer": "https://www.ls-tc.de/de/etf/76298", "X-Requested-With": "XMLHttpRequest"}
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=20); return r.read().decode("utf-8", "replace")
try:
    b = get("https://www.ls-tc.de/de/etf/76298")
    for m in re.finditer(r"dataForInstrument|statistik|pushtable|push\.ls-tc", b):
        log("CTX", b[max(0, m.start()-600): m.end()+600].replace("\n", " "))
    for m in re.finditer(r'<script[^>]+src="([^"]+)"', b): log("JS", m.group(1))
    log("NUMS", re.findall(r'(?:item|field|data-push)[^>]{0,120}', b)[:40])
except Exception as e: log("ERR page", repr(e))
base = "https://www.ls-tc.de/_rpc/json/instrument/chart/dataForInstrument?instrumentId=76298"
for q in ["", "&marketId=1&quotetype=mid&series=intraday&localeId=2", "&series=history", "&series=intraday", "&period=1y", "&marketId=1&quotetype=mid&series=history&localeId=2"]:
    try: log("CHART", q, get(base + q)[:600])
    except Exception as e: log("CHART ERR", q, repr(e)[:200])
for u in ["https://www.ls-tc.de/_rpc/json/instrument/base/statistik?instrumentId=76298", "https://www.ls-tc.de/_rpc/json/instrument/pushtable/result?instrumentId=76298"]:
    try: log("OTRO", u, get(u)[:800])
    except Exception as e: log("OTRO ERR", u, repr(e)[:200])
open("data/_prueba.txt", "w").write("\n".join(out))
