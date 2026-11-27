/* Gráficos propios con TradingView Lightweight Charts (código abierto) y datos de data/precios/ */
(function () {
  "use strict";
  const LW = window.LightweightCharts;
  const RANGOS = [
    ["sesion", "Sesión"], ["1s", "1 sem"], ["1m", "1 mes"], ["3m", "3 meses"], ["6m", "6 meses"], ["ytd", "YTD"],
    ["1a", "1 año"], ["3a", "3 años"], ["5a", "5 años"], ["10a", "10 años"]
  ];
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const nf = (n, d = 2) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  const sg = (n) => (n >= 0 ? "+" : "−");
  const TZ = -new Date().getTimezoneOffset() * 60; // el gráfico pinta en UTC: desplazamos a la hora local
  const cache = {};

  function cargar(id) {
    if (!cache[id]) cache[id] = fetch("data/precios/" + encodeURIComponent(id) + ".json", { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error("sin datos"); return r.json(); });
    return cache[id];
  }

  // Yahoo a veces tarda en publicar la vela diaria de hoy: se añade con el último precio
  function diarioCompleto(d) {
    if (d._dc) return d._dc;
    const dia = d.diario.slice(), ult = dia[dia.length - 1], ti = (d.intradia && d.intradia.length ? d.intradia[d.intradia.length - 1][0] : 0);
    const dias = ult ? Math.floor((ti - ult[0]) / 86400) : 0;
    if (dias >= 1 && d.ultimo != null) dia.push([ult[0] + dias * 86400, d.ultimo]);
    return (d._dc = dia);
  }
  function recortar(d0, rango) {
    const d = Object.assign({}, d0, { diario: diarioCompleto(d0) });
    if (rango === "sesion") return { puntos: d.intradia && d.intradia.length ? d.intradia : d.diario.slice(-2), base: d.cierre_anterior, intradia: true };
    if (rango === "1s") return { puntos: d.semana && d.semana.length ? d.semana : d.diario.slice(-6), base: null, intradia: true };
    const fin = d.diario[d.diario.length - 1][0] * 1000;
    const f = new Date(fin);
    let desde;
    if (rango === "ytd") desde = new Date(f.getFullYear(), 0, 1);
    else {
      const meses = { "1m": 1, "3m": 3, "6m": 6, "1a": 12, "3a": 36, "5a": 60, "10a": 120 }[rango];
      desde = new Date(f); desde.setMonth(desde.getMonth() - meses);
    }
    const t0 = desde.getTime() / 1000;
    let puntos = d.diario.filter((p) => p[0] >= t0);
    if (rango === "ytd") { const prev = d.diario.filter((p) => p[0] < t0).pop(); return { puntos, base: prev ? prev[1] : puntos[0][1], intradia: false }; }
    return { puntos, base: null, intradia: false };
  }

  function fechaTxt(t, conHora) {
    const d = new Date(t * 1000);
    const f = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
    return conHora ? f + ", " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }

  /* Estado del mercado (aprox., hora de Madrid) */
  const HORARIO = { ls: [[7, 30], [23, 0]], us: [[15, 30], [22, 0]], eu: [[9, 0], [17, 30]], jp: [[1, 0], [7, 30]], hk: [[2, 30], [9, 0]] };
  const FESTIVOS = {
    us: { "2026-11-26": "Acción de Gracias", "2026-12-25": "Navidad", "2027-01-01": "Año Nuevo", "2027-01-18": "Martin Luther King", "2027-02-15": "Día de los Presidentes",
      "2027-03-26": "Viernes Santo", "2027-05-31": "Memorial Day", "2027-06-18": "Juneteenth", "2027-07-05": "Independencia", "2027-09-06": "Día del Trabajo", "2027-11-25": "Acción de Gracias", "2027-12-24": "Navidad" },
    eu: { "2026-12-24": "Nochebuena", "2026-12-25": "Navidad", "2026-12-31": "Nochevieja", "2027-01-01": "Año Nuevo", "2027-03-26": "Viernes Santo", "2027-03-29": "Lunes de Pascua", "2027-12-24": "Nochebuena", "2027-12-31": "Nochevieja" }
  };
  FESTIVOS.ls = { "2026-12-24": "Nochebuena", "2026-12-25": "Navidad", "2026-12-31": "Nochevieja", "2027-01-01": "Año Nuevo", "2027-03-26": "Viernes Santo", "2027-12-24": "Nochebuena", "2027-12-31": "Nochevieja" };
  const MEDIA_SESION = { us: { "2026-11-27": "19:00", "2026-12-24": "19:00", "2027-11-26": "19:00" } };
  function hoyMadrid() { const a = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" })); return a; }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  // Aviso visible: festivo de hoy, media sesión o datos de una sesión anterior
  function avisoMercado(bolsa, futuro, ultimoT) {
    const a = hoyMadrid(), hoy = iso(a), dia = a.getDay();
    if (!futuro && FESTIVOS[bolsa] && FESTIVOS[bolsa][hoy]) return "Bolsa cerrada hoy (" + FESTIVOS[bolsa][hoy] + "): se muestra la última sesión";
    if (!futuro && MEDIA_SESION[bolsa] && MEDIA_SESION[bolsa][hoy]) return "Hoy media sesión: cierra a las " + MEDIA_SESION[bolsa][hoy] + " (hora de Madrid)";
    const h = HORARIO[bolsa];
    if (!futuro && h && dia >= 1 && dia <= 5 && ultimoT) {
      const min = a.getHours() * 60 + a.getMinutes(), ab = h[0][0] * 60 + h[0][1] + 60;
      const dUlt = iso(new Date(new Date(ultimoT * 1000).toLocaleString("en-US", { timeZone: "Europe/Madrid" })));
      if (min > ab && dUlt < hoy && !(bolsa === "jp" || bolsa === "hk")) return "Sin datos de hoy: puede ser festivo en esa bolsa";
    }
    if (dia === 0 || dia === 6) return futuro ? "" : "Fin de semana: se muestra la última sesión";
    return "";
  }
  function estadoMercado(bolsa, futuro) {
    if (futuro) return "Futuro · cotiza casi 24 h de domingo a viernes";
    const h = HORARIO[bolsa]; if (!h) return "";
    const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
    const dia = ahora.getDay(), min = ahora.getHours() * 60 + ahora.getMinutes();
    const ab = h[0][0] * 60 + h[0][1], ci = h[1][0] * 60 + h[1][1];
    const abierto = dia >= 1 && dia <= 5 && min >= ab && min < ci;
    const hh = String(h[0][0]).padStart(2, "0") + ":" + String(h[0][1]).padStart(2, "0");
    return abierto ? "Abierto ahora" : "Cerrado · abre a las " + hh + " (hora de Madrid)";
  }

  function nuevoGrafico(el, conEjes) {
    return LW.createChart(el, {
      autoSize: true,
      layout: { background: { type: "solid", color: "transparent" }, textColor: css("--ink2"), fontFamily: "Inter, system-ui, sans-serif", fontSize: 12 },
      grid: { vertLines: { visible: false }, horzLines: { visible: conEjes, color: css("--line") } },
      rightPriceScale: { visible: conEjes, borderVisible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: conEjes, borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1, vertLine: { color: css("--ink2"), width: 1, style: 2, labelVisible: false }, horzLine: { visible: conEjes, labelVisible: conEjes } },
      handleScroll: conEjes, handleScale: conEjes,
    });
  }

  function pintarSerie(ctx) {
    const { chart, datos, rango, tarjeta } = ctx;
    const r = recortar(datos, rango);
    if (!r.puntos.length) return;
    const base = r.base != null ? r.base : r.puntos[0][1];
    const ultimo = r.puntos[r.puntos.length - 1][1];
    const sube = ultimo >= base;
    const col = sube ? css("--pos") : css("--neg");
    if (ctx.serie) chart.removeSeries(ctx.serie);
    ctx.serie = chart.addAreaSeries({ lineColor: col, topColor: col + "55", bottomColor: col + "05", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 4 });
    ctx.serie.setData(r.puntos.map((p) => ({ time: p[0] + TZ, value: p[1] })));
    if (r.base != null && rango === "sesion") ctx.serie.createPriceLine({ price: base, color: css("--ink2"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    if (ctx.comp) {
      const rc = recortar(ctx.comp.datos, rango);
      if (ctx.serieComp) chart.removeSeries(ctx.serieComp);
      const ini = r.puntos[0][0], fin = r.puntos[r.puntos.length - 1][0];
      const pc = rc.puntos.filter((p) => p[0] >= ini - 86400 && p[0] <= fin + 3600);
      if (pc.length > 1) {
        const bc = rc.base != null && rango === "sesion" ? rc.base : pc[0][1], k = base / bc;
        ctx.serieComp = chart.addLineSeries({ color: css("--ink2"), lineWidth: 1.5, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        ctx.serieComp.setData(pc.map((p) => ({ time: p[0] + TZ, value: p[1] * k })));
        const retE = (ultimo / base - 1) * 100, retI = (pc[pc.length - 1][1] / bc - 1) * 100;
        const g = tarjeta.querySelector(".g-comp");
        g.innerHTML = '<span class="ley e"></span>Este ETF: <b class="' + (retE >= 0 ? "pos" : "neg") + '">' + sg(retE) + nf(Math.abs(retE)) + ' %</b> &nbsp; <span class="ley i"></span>' + ctx.comp.nombre + ' (en euros, misma escala): <b class="' + (retI >= 0 ? "pos" : "neg") + '">' + sg(retI) + nf(Math.abs(retI)) + " %</b> · diferencia " + sg(retE - retI) + nf(Math.abs(retE - retI)) + " puntos";
        g.hidden = false;
      }
    }
    chart.timeScale().fitContent();
    ctx.base = base; ctx.r = r;
    // cabecera
    const v = tarjeta.querySelector(".g-valor"), c = tarjeta.querySelector(".g-cambio"), f = tarjeta.querySelector(".g-fecha");
    const dif = ultimo - base, pct = (dif / base) * 100;
    v.textContent = nf(ultimo) + " €";
    const o = tarjeta.querySelector(".g-orig");
    if (o) o.textContent = datos.moneda_original && datos.moneda_original !== "EUR" && datos.ultimo_original != null
      ? (ctx.esIndice ? "En puntos: " : "En su moneda: ") + nf(datos.ultimo_original) + " " + datos.moneda_original + " · convertido a euros" : "";
    c.textContent = sg(dif) + nf(Math.abs(dif)) + " · " + sg(pct) + nf(Math.abs(pct)) + " %";
    c.className = "g-cambio " + (sube ? "pos" : "neg");
    const tUlt = r.puntos[r.puntos.length - 1][0];
    f.textContent = fechaTxt(tUlt, r.intradia);
    const av = tarjeta.querySelector(".g-aviso");
    if (av) { const t = avisoMercado(ctx.bolsa, ctx.futuro, datos.ultima_hora || tUlt); av.textContent = t; av.hidden = !t; }
    const viejo = (Date.now() / 1000 - tUlt) > 20 * 3600;
    f.classList.toggle("viejo", viejo);
    f.title = viejo ? "Último dato de una sesión anterior" : "";
  }

  function tooltip(ctx) {
    const tip = ctx.tarjeta.querySelector(".g-tip");
    ctx.chart.subscribeCrosshairMove((p) => {
      if (!p || !p.time || !p.point || !ctx.serie) { tip.hidden = true; return; }
      const d = p.seriesData.get(ctx.serie); if (!d) { tip.hidden = true; return; }
      const pct = ((d.value - ctx.base) / ctx.base) * 100;
      const ref = ctx.rango === "sesion" ? "vs. cierre anterior" : "vs. inicio del periodo";
      tip.innerHTML = "<b>" + nf(d.value) + ' €</b> <span class="' + (pct >= 0 ? "pos" : "neg") + '">' + sg(pct) + nf(Math.abs(pct)) + " %</span> " + ref +
        "<br><span>" + fechaTxt(p.time - TZ, ctx.r.intradia) + "</span>" + (ctx.estado ? "<br><span>" + ctx.estado + "</span>" : "");
      tip.hidden = false;
      const w = ctx.tarjeta.clientWidth, x = Math.min(Math.max(p.point.x + 12, 8), w - tip.offsetWidth - 8);
      tip.style.left = x + "px";
    });
  }

  /* API pública */
  window.Grafico = {
    RANGOS,
    // Tarjeta pequeña (portada)
    tarjeta(el, cfg) {
      el.innerHTML = '<div class="g-cab"><span class="g-nom">' + cfg.etiqueta + '</span><span class="g-fecha"></span></div>' +
        '<div class="g-fila"><span class="g-valor">—</span><span class="g-cambio"></span></div><div class="g-orig"></div><div class="g-aviso" hidden></div><div class="g-area"></div><div class="g-tip" hidden></div>' +
        (cfg.oficial ? '<a class="g-oficial" href="' + cfg.oficial.url + '" target="_blank" rel="noopener">Fuente oficial: ' + cfg.oficial.nombre + " ↗</a>" : "");
      const ctx = { tarjeta: el, rango: cfg.rango || "sesion", estado: estadoMercado(cfg.bolsa, cfg.futuro), esIndice: true, bolsa: cfg.bolsa, futuro: cfg.futuro };
      return cargar(cfg.id).then((d) => {
        ctx.datos = d;
        ctx.chart = nuevoGrafico(el.querySelector(".g-area"), false);
        pintarSerie(ctx); tooltip(ctx);
        return { rango(r) { ctx.rango = r; pintarSerie(ctx); }, datos: d };
      }).catch(() => { el.querySelector(".g-area").innerHTML = '<p class="g-sin">Sin datos todavía</p>'; return { rango() {} }; });
    },
    // Gráfico grande con ejes y botones (ficha de empresa)
    grande(el, cfg) {
      el.innerHTML = '<div class="g-cab"><span class="g-nom">' + cfg.etiqueta + '</span><span class="g-fecha"></span></div>' +
        '<div class="g-fila"><span class="g-valor">—</span><span class="g-cambio"></span></div><div class="g-orig"></div><div class="g-aviso" hidden></div><div class="g-comp" hidden></div>' +
        '<div class="g-rangos" role="tablist">' + RANGOS.map(([k, t]) => '<button type="button" data-r="' + k + '"' + (k === "1a" ? ' class="on"' : "") + ">" + t + "</button>").join("") + "</div>" +
        '<div class="g-area grande"></div><div class="g-tip" hidden></div><p class="g-fuente"></p>';
      const ctx = { tarjeta: el, rango: "1a", estado: "", bolsa: cfg.bolsa };
      const pComp = cfg.comparar ? cargar(cfg.comparar.id).catch(() => null) : Promise.resolve(null);
      return Promise.all([cargar(cfg.id), pComp]).then(([d, dc]) => {
        ctx.datos = d;
        if (dc) ctx.comp = { datos: dc, nombre: cfg.comparar.nombre };
        ctx.chart = nuevoGrafico(el.querySelector(".g-area"), true);
        pintarSerie(ctx); tooltip(ctx);
        el.querySelectorAll(".g-rangos button").forEach((b) => b.onclick = () => {
          el.querySelectorAll(".g-rangos button").forEach((x) => x.classList.toggle("on", x === b));
          ctx.rango = b.dataset.r; pintarSerie(ctx);
        });
        const esLS = d.fuente === "LS Exchange";
        el.querySelector(".g-fuente").innerHTML = 'Precios: <a href="' + d.url + '" target="_blank" rel="noopener">' + (esLS ? "LS Exchange (ls-tc.de)" : "Yahoo Finance") + ' ↗</a> · datos actualizados el ' +
          new Date(d.actualizado).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) + (esLS ? " (cada 30 min; horario de LS: 7:30–23:00, como Trade Republic)" : " (cada 30 min, retraso de unos 15 min según la bolsa)") +
          (d.tipo_cambio ? " · convertido a euros con el tipo " + d.tipo_cambio.par + " de Yahoo Finance en cada fecha" : "");
        return true;
      }).catch(() => false);
    },
    cargar,
  };
})();
