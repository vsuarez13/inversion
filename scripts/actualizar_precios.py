"""Descarga precios de índices, futuros y empresas de la base (Yahoo Finance vía yfinance)
y los guarda en data/precios/<id>.json para los gráficos de la web.
Lo ejecuta GitHub Actions de forma programada (.github/workflows/datos.yml)."""
import json, math, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta

import yfinance as yf

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "data")
SALIDA = os.path.join(DATOS, "precios")
os.makedirs(SALIDA, exist_ok=True)


def leer(nombre, defecto):
    try:
        with open(os.path.join(DATOS, nombre), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return defecto


def serie(df):
    out = []
    if df is None or df.empty:
        return out
    for ts, fila in df.iterrows():
        v = fila.get("Close")
        if v is None or (isinstance(v, float) and math.isnan(v)):
            continue
        out.append([int(ts.timestamp()), round(float(v), 4)])
    return out


def descargar(simbolo):
    t = yf.Ticker(simbolo)
    df_d = t.history(period="10y", interval="1d", auto_adjust=False)
    diario = serie(df_d)
    if not diario:
        raise RuntimeError("sin datos diarios")
    df_i = t.history(period="1d", interval="5m", prepost=False)
    intradia = serie(df_i)
    semana = serie(t.history(period="5d", interval="30m", prepost=False))
    ultimo = intradia[-1][1] if intradia else diario[-1][1]
    ultima_hora = intradia[-1][0] if intradia else diario[-1][0]
    # cierre anterior: último cierre diario de un día anterior al de la sesión, en la hora local de la bolsa
    tz = df_d.index.tz
    dia_sesion = (df_i.index[-1] if not df_i.empty else df_d.index[-1]).tz_convert(tz).date()
    cierres = [(ts.date(), float(c)) for ts, c in df_d["Close"].dropna().items()]
    previos = [c for d, c in cierres if d < dia_sesion]
    cierre_anterior = round(previos[-1], 4) if previos else None
    divisa = None
    try:
        divisa = t.fast_info.get("currency")
    except Exception:
        pass
    return {
        "simbolo": simbolo, "divisa": divisa, "ultimo": ultimo, "cierre_anterior": cierre_anterior,
        "ultima_hora": ultima_hora, "intradia": intradia, "semana": semana, "diario": diario,
        "fuente": "Yahoo Finance", "url": "https://finance.yahoo.com/quote/" + simbolo,
    }


FX = {}  # caché de tipos de cambio: moneda -> (diario, intradia, semana) como listas [t, unidades por 1 EUR]


def fx(moneda):
    if moneda not in FX:
        t = yf.Ticker("EUR" + moneda + "=X")
        FX[moneda] = (serie(t.history(period="10y", interval="1d")), serie(t.history(period="5d", interval="5m")),
                      serie(t.history(period="1mo", interval="30m")))
    return FX[moneda]


def a_euros(puntos, tasas, respaldo):
    """Divide cada precio por el tipo EUR/moneda vigente en ese momento (el último conocido antes)."""
    out, j, tasa = [], 0, None
    for t, v in puntos:
        while j < len(tasas) and tasas[j][0] <= t:
            tasa = tasas[j][1]
            j += 1
        r = tasa or respaldo
        out.append([t, round(v / r, 4)])
    return out


def convertir(d):
    moneda, factor = d.get("divisa") or "EUR", 1.0
    if moneda in ("GBp", "GBX"):
        moneda, factor = "GBP", 0.01
    if moneda == "ILA":
        moneda, factor = "ILS", 0.01
    d["moneda_original"] = d.get("divisa")
    d["ultimo_original"], d["cierre_anterior_original"] = d["ultimo"], d["cierre_anterior"]
    if moneda == "EUR":
        d["divisa"] = "EUR"
        return d
    dia, intra, sem = fx(moneda)
    ultima_tasa = (intra or dia)[-1][1]
    for k in ("diario", "intradia", "semana"):
        d[k] = [[t, v * factor] for t, v in d[k]]
    d["diario"] = a_euros(d["diario"], dia, ultima_tasa)
    d["semana"] = a_euros(d["semana"], sem or dia, ultima_tasa)
    d["intradia"] = a_euros(d["intradia"], intra or dia, ultima_tasa)
    d["ultimo"] = d["intradia"][-1][1] if d["intradia"] else d["diario"][-1][1]
    if d["cierre_anterior"] is not None:
        previa = [x for x in d["diario"] if x[0] < (d["intradia"][0][0] if d["intradia"] else d["diario"][-1][0])]
        d["cierre_anterior"] = previa[-1][1] if previa else round(d["cierre_anterior"] * factor / ultima_tasa, 4)
    d["tipo_cambio"] = {"par": "EUR/" + moneda, "valor": ultima_tasa}
    d["divisa"] = "EUR"
    return d


def guardar(id_, datos):
    datos["id"] = id_
    datos["actualizado"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with open(os.path.join(SALIDA, id_ + ".json"), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))


# ---------- LS Exchange (la bolsa de Trade Republic; web pública ls-tc.de, sin API oficial) ----------
LS = "https://www.ls-tc.de"
LS_H = {"User-Agent": "Mozilla/5.0 (uso personal)", "Accept": "application/json", "X-Requested-With": "XMLHttpRequest"}


def ls_json(ruta):
    r = urllib.request.urlopen(urllib.request.Request(LS + ruta, headers=LS_H), timeout=25)
    return json.loads(r.read().decode("utf-8"))


def ls_descargar(isin, ids):
    if isin not in ids:
        res = ls_json("/_rpc/json/.lstc/instrument/search/main?localeId=2&q=" + urllib.parse.quote(isin)) or []
        r = next((x for x in res if x.get("isin") == isin), None)
        ids[isin] = {"id": r["instrumentId"], "link": r.get("link")} if r else None
    info = ids[isin]
    if not info:
        return None
    j = ls_json("/_rpc/json/instrument/chart/dataForInstrument?instrumentId=%s&marketId=1&quotetype=mid&series=intraday,history&localeId=2" % info["id"])
    ser = j.get("series") or {}
    intradia = [[int(t // 1000), round(float(v), 4)] for t, v in (ser.get("intraday") or {}).get("data", []) if v is not None]
    diario = [[int(t // 1000), round(float(v), 4)] for t, v in (ser.get("history") or {}).get("data", []) if v is not None]
    if not diario and not intradia:
        return None
    previo = next((p.get("value") for p in (j.get("info") or {}).get("plotlines", []) if p.get("id") == "previousDay"), None)
    hace7 = (intradia[-1][0] if intradia else diario[-1][0]) - 7 * 86400
    corte = intradia[0][0] if intradia else 10 ** 12
    semana = [p for p in diario if hace7 <= p[0] < corte] + intradia
    ultimo = intradia[-1] if intradia else diario[-1]
    return {"simbolo": "LS:" + str(info["id"]), "divisa": "EUR", "moneda_original": "EUR", "ultimo": ultimo[1], "ultimo_original": ultimo[1],
            "cierre_anterior": previo, "cierre_anterior_original": previo, "ultima_hora": ultimo[0],
            "intradia": intradia, "semana": semana, "diario": diario[-2600:], "fuente": "LS Exchange",
            "url": LS + (info.get("link") or "/de/"), "bolsa": "ls"}


# ---------- Composición de ETF y fondos (Yahoo Finance) ----------
SECTORES_ES = {"technology": "Tecnología", "financial_services": "Financiero", "healthcare": "Salud", "consumer_cyclical": "Consumo cíclico",
               "consumer_defensive": "Consumo básico", "industrials": "Industria", "communication_services": "Comunicaciones", "energy": "Energía",
               "utilities": "Utilities", "realestate": "Inmobiliario", "basic_materials": "Materiales"}


def composicion(sym):
    fd = yf.Ticker(sym).funds_data
    top = []
    try:
        th = fd.top_holdings
        if th is not None and not th.empty:
            for s, fila in th.iterrows():
                top.append({"simbolo": s, "nombre": fila.get("Name"), "peso": round(float(fila.get("Holding Percent")) * 100, 2)})
    except Exception:
        pass
    sect = {}
    try:
        sect = {SECTORES_ES.get(k, k): round(v * 100, 2) for k, v in (fd.sector_weightings or {}).items() if v}
    except Exception:
        pass
    if not top and not sect:
        return None
    return {"top": top, "sectores": dict(sorted(sect.items(), key=lambda x: -x[1])), "fecha": datetime.now(timezone.utc).date().isoformat(),
            "fuente": {"nombre": "Yahoo Finance · composición (top 10)", "url": "https://finance.yahoo.com/quote/" + sym + "/holdings"}}


def refrescar_composiciones():
    ruta = os.path.join(DATOS, "empresas_auto.json")
    auto = leer("empresas_auto.json", {"empresas": {}})
    cambio, hoy = False, datetime.now(timezone.utc).date()
    for isin, e in auto["empresas"].items():
        if e.get("tipo") not in ("etf", "fondo"):
            continue
        c = e.get("composicion")
        if c and (hoy - datetime.fromisoformat(c["fecha"]).date()) < timedelta(days=7):
            continue
        try:
            n = composicion(e["yahoo"])
            if n:
                e["composicion"], cambio = n, True
                print("composición", isin)
        except Exception as ex:
            print("composición ERROR", isin, ex, file=sys.stderr)
    if cambio:
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(auto, f, ensure_ascii=False, indent=1)


def main():
    trabajos = []
    for i in leer("universo.json", {"indices": []})["indices"]:
        trabajos.append((i["id"], i["mercado"]))
        if i.get("futuro"):
            trabajos.append((i["id"] + "_fut", i["futuro"]))
    for archivo in ("empresas.json", "empresas_auto.json"):
        for isin, e in leer(archivo, {"empresas": {}})["empresas"].items():
            if e.get("yahoo"):
                trabajos.append((isin, e["yahoo"]))
    errores = []
    for id_, sim in trabajos:
        try:
            guardar(id_, convertir(descargar(sim)))
            print("ok", id_, sim)
        except Exception as ex:  # un fallo no detiene el resto
            errores.append(f"{id_} ({sim}): {ex}")
            print("ERROR", id_, sim, ex, file=sys.stderr)
        time.sleep(0.5)
    ids = leer("precios/_ls_ids.json", {})
    for archivo in ("empresas.json", "empresas_auto.json"):
        for isin, e in leer(archivo, {"empresas": {}})["empresas"].items():
            if e.get("tipo") == "fondo":
                continue
            try:
                d = ls_descargar(isin, ids)
                if d:
                    guardar(isin + "_ls", d)
                    print("ok LS", isin)
            except Exception as ex:
                print("LS ERROR", isin, ex, file=sys.stderr)
            time.sleep(1)
    with open(os.path.join(SALIDA, "_ls_ids.json"), "w", encoding="utf-8") as f:
        json.dump(ids, f, ensure_ascii=False, indent=1)
    refrescar_composiciones()
    tasas = {}
    for m in ("USD", "GBP", "JPY", "HKD", "CHF", "SEK", "DKK", "NOK", "CAD", "AUD"):
        try:
            tasas[m] = fx(m)[1][-1][1] if fx(m)[1] else fx(m)[0][-1][1]
        except Exception as ex:
            print("FX error", m, ex, file=sys.stderr)
    with open(os.path.join(SALIDA, "_fx.json"), "w", encoding="utf-8") as f:
        json.dump({"actualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "eur_a": tasas,
                   "nota": "Unidades de cada moneda por 1 euro (Yahoo Finance)"}, f, ensure_ascii=False, indent=1)
    estado = {"actualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "series": len(trabajos) - len(errores), "errores": errores}
    with open(os.path.join(SALIDA, "_estado.json"), "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=1)
    if len(errores) == len(trabajos):
        sys.exit("No se pudo descargar ningún precio")


if __name__ == "__main__":
    main()
