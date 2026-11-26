"""Crea automáticamente la ficha de una empresa pedida con el botón «Añadir a mi base»
(una issue de GitHub con el ISIN en el título). Datos de Yahoo Finance vía yfinance.
Guarda la ficha en data/empresas_auto.json y escribe el resultado en resultado.txt."""
import json, os, re, sys
from datetime import date

import yfinance as yf

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "data")
SUFIJO = {"ES": "MC", "FR": "PA", "NL": "AS", "BE": "BR", "PT": "LS", "GB": "L", "DE": "DE", "IT": "MI", "CH": "SW",
          "HK": "HK", "JP": "T", "CA": "TO", "SE": "ST", "DK": "CO", "FI": "HE", "NO": "OL", "AT": "VI", "AU": "AX", "IE": "IR"}


def isin_valido(isin):
    if not re.fullmatch(r"[A-Z]{2}[A-Z0-9]{9}[0-9]", isin):
        return False
    s = "".join(str(int(c, 36)) for c in isin[:11])
    t = 0
    for i, d in enumerate(reversed(s)):
        x = int(d)
        if i % 2 == 0:
            x *= 2
            x -= 9 if x > 9 else 0
        t += x
    return (10 - t % 10) % 10 == int(isin[11])


def sector(info):
    s, ind = (info.get("sector") or "").lower(), (info.get("industry") or "").lower()
    if "semiconductor" in ind: return "semiconductores"
    if "aerospace" in ind or "defense" in ind: return "defensa_tecnologia"
    if "waste" in ind or "water" in ind or "pollution" in ind: return "agua_residuos"
    if "personal services" in ind: return "funerarias"
    if "insurance" in ind: return "reaseguros"
    if "veterinary" in ind or "animal" in ind: return "salud_animal"
    if "farm" in ind or "agricultur" in ind: return "genetica_agro"
    return {"technology": "tecnologia", "healthcare": "salud", "financial services": "banca", "utilities": "utilities_reguladas",
            "industrials": "industria", "energy": "energia", "communication services": "telecom", "consumer cyclical": "consumo",
            "consumer defensive": "consumo", "real estate": "inmobiliario", "basic materials": "materiales"}.get(s, "general")


def num(v, factor=1.0):
    try:
        v = float(v)
        return None if v != v else round(v * factor, 4)
    except (TypeError, ValueError):
        return None


def buscar_simbolo(isin):
    res = yf.Search(isin, max_results=10).quotes or []
    acciones = [q for q in res if q.get("quoteType") in ("EQUITY", "ETF", "MUTUALFUND", None)] or res
    if not acciones:
        return None, None
    pais = isin[:2]
    suf = SUFIJO.get(pais)
    elegido = None
    if pais == "US":
        elegido = next((q for q in acciones if "." not in q["symbol"]), None)
    elif suf:
        elegido = next((q for q in acciones if q["symbol"].endswith("." + suf)), None)
    elegido = elegido or acciones[0]
    return elegido["symbol"], elegido


INDICES = [("ibex", "ibex35"), ("s&p 500", "sp500"), ("s&p500", "sp500"), ("nasdaq", "nasdaq100"), ("stoxx 50", "eurostoxx50"),
           ("stoxx50", "eurostoxx50"), ("dax", "dax"), ("nikkei", "nikkei225"), ("hang seng", "hangseng")]


def ficha_etf(isin, sym, info):
    hoy = date.today().isoformat()
    nombre = info.get("longName") or info.get("shortName") or sym
    n = nombre.lower()
    indice = next((v for k, v in INDICES if k in n), None)
    ter = info.get("netExpenseRatio") or info.get("annualReportExpenseRatio")
    return {
        "tipo": "etf", "nombre": nombre, "ticker": sym.split(".")[0], "yahoo": sym, "bolsa": info.get("fullExchangeName") or info.get("exchange") or "",
        "tv": sym.split(".")[0], "pais": isin[:2], "divisa": info.get("currency") or "", "sector": "general", "descripcion": "",
        "indice": indice, "precio": {"v": num(info.get("regularMarketPrice") or info.get("navPrice")), "fecha": hoy, "fuente": "yf"},
        "etf": {"ter": num(ter), "patrimonio": num(info.get("totalAssets"), 1e-6), "categoria": info.get("category") or "",
                "gestora": info.get("fundFamily") or "", "rent_ytd": num(info.get("ytdReturn"), 100 if (info.get("ytdReturn") or 0) < 1 else 1)},
        "ratios": {}, "analistas": None,
        "notas": ["Ficha automática de ETF con datos de Yahoo Finance."],
        "fuentes": {"yf": {"nombre": "Yahoo Finance · ficha del ETF (automática)", "url": "https://finance.yahoo.com/quote/" + sym, "fecha": hoy}},
        "automatica": True,
    }


def ficha(isin, sym):
    info = yf.Ticker(sym).info or {}
    if (info.get("quoteType") or "").upper() in ("ETF", "MUTUALFUND"):
        return ficha_etf(isin, sym, info)
    hoy = date.today().isoformat()
    deuda, ebitda = num(info.get("totalDebt")), num(info.get("ebitda"))
    rec = {"strong_buy": "Compra fuerte", "buy": "Comprar", "hold": "Mantener", "sell": "Vender", "strong_sell": "Venta fuerte",
           "underperform": "Vender", "outperform": "Comprar"}.get(info.get("recommendationKey"), None)
    precio = num(info.get("currentPrice") or info.get("regularMarketPrice"))
    objetivo = num(info.get("targetMeanPrice"))
    tv_ex = {"MC": "BME", "PA": "EURONEXT", "AS": "EURONEXT", "BR": "EURONEXT", "L": "LSE", "DE": "XETR", "MI": "MIL", "SW": "SIX"}
    p = sym.split(".")
    url = "https://finance.yahoo.com/quote/" + sym + "/key-statistics"
    return {
        "nombre": info.get("longName") or info.get("shortName") or sym, "ticker": p[0], "yahoo": sym,
        "bolsa": info.get("fullExchangeName") or info.get("exchange") or "", "tv": (tv_ex.get(p[1]) + ":" + p[0]) if len(p) > 1 and p[1] in tv_ex else p[0],
        "pais": info.get("country") or isin[:2], "divisa": info.get("currency") or "", "sector": sector(info),
        "industria": info.get("industry") or "", "descripcion": "",
        "precio": {"v": precio, "fecha": hoy, "fuente": "yf"},
        "ratios": {
            "cap_bursatil": num(info.get("marketCap"), 1e-6), "ev": num(info.get("enterpriseValue"), 1e-6),
            "per_ttm": num(info.get("trailingPE")), "per_fwd": num(info.get("forwardPE")), "peg": num(info.get("trailingPegRatio")),
            "ev_ebitda": num(info.get("enterpriseToEbitda")), "ev_ventas": num(info.get("enterpriseToRevenue")),
            "p_ventas": num(info.get("priceToSalesTrailing12Months")), "p_vc": num(info.get("priceToBook")),
            "deuda_ebitda": round(deuda / ebitda, 2) if deuda and ebitda and ebitda > 0 else None,
            "deuda_patrimonio": num(info.get("debtToEquity"), 0.01), "liquidez": num(info.get("currentRatio")),
            "margen_bruto": num(info.get("grossMargins"), 100), "margen_operativo": num(info.get("operatingMargins"), 100),
            "margen_ebitda": num(info.get("ebitdaMargins"), 100), "margen_neto": num(info.get("profitMargins"), 100),
            "margen_fcf": None, "roe": num(info.get("returnOnEquity"), 100), "roic": None,
            "rent_dividendo": num(info.get("trailingAnnualDividendYield"), 100), "payout": num(info.get("payoutRatio"), 100),
            "beta": num(info.get("beta")), "var_52s": num(info.get("52WeekChange"), 100),
        },
        "analistas": {"consenso": rec or "Sin dato", "n": info.get("numberOfAnalystOpinions") or 0, "objetivo": objetivo,
                      "potencial": round((objetivo / precio - 1) * 100, 2) if objetivo and precio else None, "fuente": "yf"},
        "notas": ["Ficha automática con datos de Yahoo Finance, sin revisar todavía. En la próxima revisión la contrasto con otras fuentes y añado comentarios."],
        "fuentes": {"yf": {"nombre": "Yahoo Finance · estadísticas (ficha automática)", "url": url, "fecha": hoy}},
        "automatica": True,
    }


def main():
    titulo = os.environ.get("TITULO", "") or ("Añadir: " + os.environ.get("ISIN_MANUAL", ""))
    m = re.search(r"\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b", titulo.upper())
    res = os.path.join(RAIZ, "resultado.txt")
    if not m or not isin_valido(m.group(1)):
        open(res, "w").write("No he encontrado un ISIN válido en el título de la petición.")
        return
    isin = m.group(1)
    base = json.load(open(os.path.join(DATOS, "empresas.json"), encoding="utf-8"))["empresas"]
    ruta_auto = os.path.join(DATOS, "empresas_auto.json")
    auto = json.load(open(ruta_auto, encoding="utf-8"))
    if isin in base and not titulo.lower().startswith("actualizar"):
        open(res, "w").write(f"{isin} ya está en la base revisada: {base[isin]['nombre']}.")
        return
    sym, _ = buscar_simbolo(isin)
    if not sym:
        open(res, "w").write(f"Yahoo Finance no encuentra el ISIN {isin}. Lo reviso a mano en la próxima actualización.")
        sys.exit(0)
    f = ficha(isin, sym)
    if isin in base:  # petición de actualizar una ficha revisada: solo se refrescan precio y ratios no revisados
        open(res, "w").write(f"{isin} es una ficha revisada; la actualizo en la próxima revisión manual.")
        return
    auto["empresas"][isin] = f
    json.dump(auto, open(ruta_auto, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(res, "w").write(f"Ficha automática creada para {f['nombre']} ({sym}). En unos minutos estará en la web con su gráfico.")


if __name__ == "__main__":
    main()
