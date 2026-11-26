"""Descarga precios de índices, futuros y empresas de la base (Yahoo Finance vía yfinance)
y los guarda en data/precios/<id>.json para los gráficos de la web.
Lo ejecuta GitHub Actions de forma programada (.github/workflows/datos.yml)."""
import json, math, os, sys, time
from datetime import datetime, timezone

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
    diario = serie(t.history(period="10y", interval="1d", auto_adjust=False))
    if not diario:
        raise RuntimeError("sin datos diarios")
    intradia = serie(t.history(period="1d", interval="5m", prepost=False))
    semana = serie(t.history(period="5d", interval="30m", prepost=False))
    ultimo = intradia[-1][1] if intradia else diario[-1][1]
    ultima_hora = intradia[-1][0] if intradia else diario[-1][0]
    # cierre anterior: último cierre diario de un día anterior al de la sesión mostrada
    dia_sesion = datetime.fromtimestamp(ultima_hora, timezone.utc).date()
    previos = [p for p in diario if datetime.fromtimestamp(p[0], timezone.utc).date() < dia_sesion]
    cierre_anterior = previos[-1][1] if previos else (diario[-2][1] if len(diario) > 1 else None)
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


def guardar(id_, datos):
    datos["id"] = id_
    datos["actualizado"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with open(os.path.join(SALIDA, id_ + ".json"), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))


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
            guardar(id_, descargar(sim))
            print("ok", id_, sim)
        except Exception as ex:  # un fallo no detiene el resto
            errores.append(f"{id_} ({sim}): {ex}")
            print("ERROR", id_, sim, ex, file=sys.stderr)
        time.sleep(0.5)
    estado = {"actualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "series": len(trabajos) - len(errores), "errores": errores}
    with open(os.path.join(SALIDA, "_estado.json"), "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=1)
    if len(errores) == len(trabajos):
        sys.exit("No se pudo descargar ningún precio")


if __name__ == "__main__":
    main()
