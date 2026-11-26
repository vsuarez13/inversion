/* Mi panel de inversión · lógica de la web (sin librerías) */
(function () {
  "use strict";
  const C = window.CONFIG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const oscuro = () => true; // la web usa siempre modo oscuro
  const nf = (n, d = 2) => (n == null || isNaN(n) ? null : new Intl.NumberFormat("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n));
  const fechaES = (s) => { if (!s) return ""; const d = new Date(s.length === 10 ? s + "T12:00:00" : s); return isNaN(d) ? s : d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }); };
  const ahoraES = () => new Date().toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

  let DB = null, RATIOS = null, SECT = null, UNI = null;
  const cargarDatos = Promise.all([
    fetch("data/empresas.json").then((r) => r.json()),
    fetch("data/ratios.json").then((r) => r.json()),
    fetch("data/sectores.json").then((r) => r.json()),
    fetch("data/empresas_auto.json", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ empresas: {} })),
    fetch("data/universo.json").then((r) => r.json())
  ]).then(([e, r, s, a, u]) => { DB = e; RATIOS = r; SECT = s; UNI = u; Object.keys(a.empresas || {}).forEach((k) => { if (!DB.empresas[k]) DB.empresas[k] = a.empresas[k]; }); });

  /* ---------- Conversión a euros ---------- */
  let FXR = { EUR: 1 };
  const cargarFX = fetch("data/precios/_fx.json", { cache: "no-store" }).then((r) => r.json()).then((f) => { FXR = Object.assign({ EUR: 1 }, f.eur_a || {}); }).catch(() => {});
  function aEUR(v, divisa) {
    if (v == null || isNaN(v)) return null;
    let m = divisa || "EUR", k = 1;
    if (m === "GBp" || m === "GBX") { m = "GBP"; k = 0.01; }
    const t = FXR[m];
    return t ? (v * k) / t : null;
  }

  /* ---------- Validación de ISIN (dígito de control) ---------- */
  function isinValido(isin) {
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;
    const s = isin.slice(0, 11).split("").map((c) => parseInt(c, 36)).join("");
    let t = 0;
    s.split("").reverse().forEach((d, i) => { let x = +d; if (i % 2 === 0) { x *= 2; if (x > 9) x -= 9; } t += x; });
    return (10 - (t % 10)) % 10 === +isin[11];
  }

  /* ---------- Widgets de TradingView ---------- */
  function widget(cont, archivo, cfg) {
    cont.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/" + archivo;
    s.async = true;
    s.text = JSON.stringify(Object.assign({ locale: "es", colorTheme: oscuro() ? "dark" : "light", isTransparent: true }, cfg));
    cont.appendChild(s);
  }

  /* ---------- Aviso de actualización ---------- */
  function aviso() {
    fetch("data/actualizacion.json", { cache: "no-store" }).then((r) => r.json()).then((a) => {
      const visto = store.get("visto", null);
      const nuevo = visto !== a.fecha;
      const el = $("#aviso");
      const det = [];
      if (a.nuevas && a.nuevas.length && !a.resumen) det.push("nuevas: " + a.nuevas.map(esc).join(", "));
      if (a.actualizadas && a.actualizadas.length) det.push(a.actualizadas.length + " empresas actualizadas");
      el.innerHTML = '<div class="wrap"><div>' + (nuevo ? "<b>Novedades desde tu última visita.</b> " : "") +
        "Última actualización: <b>" + esc(new Date(a.fecha).toLocaleString("es-ES", { dateStyle: "full", timeStyle: "short" })) + "</b>. " +
        esc(a.resumen || "") + (det.length ? " (" + det.join(" · ") + ")" : "") + '</div><button type="button" aria-label="Cerrar aviso">×</button></div>';
      el.hidden = false;
      if (!nuevo) el.style.background = "var(--panel)";
      $("button", el).onclick = () => { store.set("visto", a.fecha); el.hidden = true; };
    }).catch(() => {});
  }

  /* ---------- Portada ---------- */
  let portadaLista = false, tarjetas = [], rangoAct = store.get("rango", "sesion"), modoAct = "mercado";
  function portada() {
    recientes();
    cargarDatos.then(() => {
      const emp = DB.empresas;
      $("#base-lista").innerHTML = "<span>En tu base:</span>" + Object.keys(emp).map((k) => '<a class="chip" href="#/empresa/' + k + '">' + esc(emp[k].nombre) + "</a>").join("");
      if (portadaLista) return;
      portadaLista = true;
      $("#rangos").innerHTML = Grafico.RANGOS.map(([k, t]) => '<button type="button" data-r="' + k + '"' + (k === rangoAct ? ' class="on"' : "") + ">" + t + "</button>").join("");
      $("#rangos").onclick = (ev) => { const b = ev.target.closest("button"); if (!b) return; rangoAct = b.dataset.r; store.set("rango", rangoAct); marcar("#rangos", b); tarjetas.forEach((t) => t.then((g) => g.rango(rangoAct))); };
      $("#modo").onclick = (ev) => { const b = ev.target.closest("button"); if (!b) return; modoAct = b.dataset.m; marcar("#modo", b); $("#hint-futuros").hidden = modoAct !== "futuro"; pintarIndices(); };
      $("#modo").onmouseenter = () => { $("#hint-futuros").hidden = false; };
      $("#modo").onmouseleave = () => { $("#hint-futuros").hidden = modoAct !== "futuro"; };
      pintarIndices();
      fetch("data/precios/_estado.json", { cache: "no-store" }).then((r) => r.json()).then((e) => {
        $("#meta-indices").textContent = "Datos: Yahoo Finance · última actualización " + new Date(e.actualizado).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) + " (cada 30 min; retraso de unos 15 min según la bolsa)";
      }).catch(() => { $("#meta-indices").textContent = "Los datos se están generando: aparecerán en unos minutos."; });
    });
  }
  function marcar(sel, b) { document.querySelectorAll(sel + " button").forEach((x) => x.classList.toggle("on", x === b)); }
  function pintarIndices() {
    const cont = $("#indices");
    cont.innerHTML = UNI.indices.map((i, n) => '<article class="indice g-tarjeta" id="g-' + n + '"></article>').join("");
    tarjetas = UNI.indices.map((i, n) => {
      const fut = modoAct === "futuro" && i.futuro;
      const etiqueta = '<span class="pais">' + esc(i.pais) + "</span> " + esc(i.nombre) + (fut ? ' <span class="fut">futuro</span>' : "");
      return Grafico.tarjeta($("#g-" + n), { id: fut ? i.id + "_fut" : i.id, etiqueta, rango: rangoAct, bolsa: i.bolsa, futuro: !!fut });
    });
  }
  function recientes() {
    const r = store.get("recientes", []);
    const el = $("#recientes");
    if (!r.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = "<span>Búsquedas recientes:</span>" + r.map((x) => '<a class="chip" href="#/empresa/' + esc(x.isin) + '">' + esc(x.nombre || x.isin) + "</a>").join("");
  }
  function guardarReciente(isin, nombre) {
    const r = store.get("recientes", []).filter((x) => x.isin !== isin);
    r.unshift({ isin, nombre, t: Date.now() });
    store.set("recientes", r.slice(0, 10));
  }

  $("#buscador").addEventListener("submit", (e) => {
    e.preventDefault();
    const isin = $("#q").value.trim().toUpperCase().replace(/\s+/g, "");
    const err = $("#q-error");
    if (!isinValido(isin)) { err.textContent = "Ese ISIN no es válido. Revisa que tenga 12 caracteres y que esté bien copiado."; err.hidden = false; return; }
    err.hidden = true;
    location.hash = "#/empresa/" + isin;
  });

  /* ---------- Finnhub ---------- */
  const fh = (ruta) => fetch("https://finnhub.io/api/v1/" + ruta + (ruta.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(C.finnhubKey)).then((r) => r.json());
  const sufijoTV = { MC: "BME", PA: "EURONEXT", AS: "EURONEXT", BR: "EURONEXT", LS: "EURONEXT", L: "LSE", DE: "XETR", F: "FWB", MI: "MIL", SW: "SIX", HK: "HKEX", T: "TSE", TO: "TSX", ST: "OMXSTO", CO: "OMXCOP", HE: "OMXHEX", OL: "OSL", VI: "VIE", AX: "ASX" };
  const sufijoPais = { ES: "MC", FR: "PA", NL: "AS", BE: "BR", PT: "LS", GB: "L", DE: "DE", IT: "MI", CH: "SW", HK: "HK", JP: "T", CA: "TO", SE: "ST", DK: "CO", FI: "HE", NO: "OL", AT: "VI", AU: "AX", IE: "L" };
  function tvDesdeSimbolo(sym) { const p = sym.split("."); return p.length > 1 && sufijoTV[p[1]] ? sufijoTV[p[1]] + ":" + p[0] : sym; }
  function sectorDesdeIndustria(ind) {
    const t = (ind || "").toLowerCase();
    for (const [clave, sec] of SECT.mapa_finnhub) if (t.includes(clave)) return sec;
    return "general";
  }
  async function buscarFinnhub(isin) {
    const r = await fh("search?q=" + isin);
    if (r && r.error) throw new Error(r.error);
    const res = (r && r.result) || [];
    if (!res.length) return null;
    const pais = isin.slice(0, 2);
    const suf = sufijoPais[pais];
    return res.find((x) => pais === "US" ? !x.symbol.includes(".") : suf && x.symbol.endsWith("." + suf)) || res.find((x) => !x.symbol.includes(".")) || res[0];
  }
  async function empresaFinnhub(isin, sym) {
    const [perfil, cot, met, rec] = await Promise.all([
      fh("stock/profile2?symbol=" + encodeURIComponent(sym)).catch(() => ({})),
      fh("quote?symbol=" + encodeURIComponent(sym)).catch(() => ({})),
      fh("stock/metric?symbol=" + encodeURIComponent(sym) + "&metric=all"),
      fh("stock/recommendation?symbol=" + encodeURIComponent(sym)).catch(() => [])
    ]);
    if (met && met.error) throw new Error(met.error);
    const m = (met && met.metric) || {};
    const hoy = new Date().toISOString();
    const f = { fh: { nombre: "Finnhub · ratios y datos financieros", url: "https://finnhub.io/api/v1/stock/metric?symbol=" + sym + "&metric=all", fecha: hoy, vivo: true } };
    const ratios = {
      cap_bursatil: m.marketCapitalization, ev: m.enterpriseValue, per_ttm: m.peTTM, per_fwd: m.forwardPE, peg: m.pegTTM, ev_ebitda: m.evEbitdaTTM,
      ev_ventas: m.evRevenueTTM, p_ventas: m.psTTM, p_vc: m.pbQuarterly ?? m.pbAnnual, deuda_ebitda: null, deuda_patrimonio: m["totalDebt/totalEquityQuarterly"],
      liquidez: m.currentRatioQuarterly, margen_bruto: m.grossMarginTTM, margen_operativo: m.operatingMarginTTM, margen_ebitda: null, margen_neto: m.netProfitMarginTTM,
      margen_fcf: null, roe: m.roeTTM, roic: m.roiTTM, rent_dividendo: m.currentDividendYieldTTM, payout: m.payoutRatioTTM, beta: m.beta, var_52s: m["52WeekPriceReturnDaily"]
    };
    let analistas = null;
    if (Array.isArray(rec) && rec.length) {
      const u = rec[0];
      analistas = { recs: u, periodo: u.period, fuente: "fhr" };
      f.fhr = { nombre: "Finnhub · recomendaciones de analistas", url: "https://finnhub.io/api/v1/stock/recommendation?symbol=" + sym, fecha: hoy, vivo: true };
    }
    f.tv = { nombre: "TradingView · gráfico de la cotización", url: "https://www.tradingview.com/symbols/" + tvDesdeSimbolo(sym).replace(":", "-") + "/", fecha: null };
    return {
      origen: "finnhub", isin, nombre: perfil.name || sym, ticker: sym, bolsa: perfil.exchange || "", tv: tvDesdeSimbolo(sym), pais: perfil.country || isin.slice(0, 2),
      divisa: perfil.currency || "", sector: sectorDesdeIndustria(perfil.finnhubIndustry), industria: perfil.finnhubIndustry || "", web: perfil.weburl,
      descripcion: "", precio: cot && cot.c ? { v: cot.c, cambio: cot.d, cambio_pct: cot.dp, fecha: cot.t ? new Date(cot.t * 1000).toISOString() : hoy, fuente: "fhq" } : null,
      ratios, fuenteRatios: "fh", analistas, notas: [], fuentes: Object.assign(f, { fhq: { nombre: "Finnhub · cotización", url: "https://finnhub.io/api/v1/quote?symbol=" + sym, fecha: hoy, vivo: true } }),
      hist: (met && met.series && met.series.annual) || null
    };
  }

  /* ---------- Ficha de empresa ---------- */
  async function empresa(isin) {
    const cont = $("#empresa");
    cont.innerHTML = '<p class="cargando">Cargando ' + esc(isin) + "…</p>";
    await cargarDatos; await cargarFX;
    if (!isinValido(isin)) { cont.innerHTML = '<a class="volver" href="#/">← Volver</a><h1 class="tit">ISIN no válido</h1><p class="intro">Revisa el código: ' + esc(isin) + "</p>"; return; }
    const base = DB.empresas[isin];
    if (base) {
      const e = Object.assign({ origen: "base", isin, fuenteRatios: base.precio && base.precio.fuente }, base);
      guardarReciente(isin, e.nombre);
      return pintar(e);
    }
    try {
      const r = await buscarFinnhub(isin);
      if (!r) { cont.innerHTML = '<a class="volver" href="#/">← Volver</a><h1 class="tit">No encontrada</h1><p class="intro">No he encontrado ninguna empresa con el ISIN ' + esc(isin) + ".</p>" + botonesGitHub(isin, isin); return; }
      guardarReciente(isin, r.description);
      const esUS = isin.startsWith("US") || !r.symbol.includes(".");
      if (esUS) {
        try { return pintar(await empresaFinnhub(isin, r.symbol)); }
        catch (e) { /* si los ratios no están disponibles, se muestra la ficha básica */ }
      }
      pintarBasica(isin, r);
    } catch (e) {
      cont.innerHTML = '<a class="volver" href="#/">← Volver</a><h1 class="tit">No se pudo consultar</h1><p class="intro">Finnhub no respondió (' + esc(e.message || e) + "). Prueba de nuevo en un momento.</p>";
    }
  }

  function urlPeticion(isin, nombre) {
    return "https://github.com/" + (C.repo || "") + "/issues/new?title=" + encodeURIComponent("Añadir a mi base: " + nombre + " (" + isin + ")") +
      "&body=" + encodeURIComponent("Por favor, añade a la base la empresa " + nombre + " con ISIN " + isin + ".");
  }
  function botonGuardar(isin, nombre) {
    return '<a class="btn" href="' + urlPeticion(isin, nombre) + '" target="_blank" rel="noopener">Guardar en mi base</a>';
  }
  function botonesGitHub(isin, nombre, modo) {
    const repo = C.repo || "";
    const t = modo === "actualizar" ? "Actualizar: " + nombre + " (" + isin + ")" : "Añadir a mi base: " + nombre + " (" + isin + ")";
    const b = (modo === "actualizar" ? "Por favor, actualiza la ficha de " : "Por favor, añade a la base la empresa ") + nombre + " con ISIN " + isin + ".";
    const url = "https://github.com/" + repo + "/issues/new?title=" + encodeURIComponent(t) + "&body=" + encodeURIComponent(b) + "&labels=" + encodeURIComponent(modo === "actualizar" ? "actualizar" : "añadir");
    return '<div class="acciones"><a class="btn" href="' + url + '" target="_blank" rel="noopener">' + (modo === "actualizar" ? "Pedir actualización" : "Añadir a mi base") + '</a><a class="btn sec" href="#/">Volver a mercados</a></div>';
  }

  function pintarBasica(isin, r) {
    const tv = tvDesdeSimbolo(r.symbol);
    $("#empresa").innerHTML = '<a class="volver" href="#/">← Volver</a><h1 class="tit">' + esc(r.description) + "</h1>" +
      '<p class="e-meta"><span>ISIN <b>' + esc(isin) + "</b></span><span>Ticker <b>" + esc(r.symbol) + "</b></span></p>" +
      '<div class="notas"><p><b>Ficha pendiente.</b> Esta empresa todavía no está en tu base y el plan gratuito de Finnhub no da ratios de empresas fuera de EE. UU. Pulsa «Añadir a mi base»: en unos 2–3 minutos se crea automáticamente su ficha con gráfico y ratios de Yahoo Finance (luego la reviso y contrasto). Recarga la página pasado ese tiempo.</p></div>' +
      '<div class="grafico-empresa g-tarjeta" id="tv-emp"></div>' + enlaceTV(tv) + botonesGitHub(isin, r.description) +
      '<div class="fuentes"><h2>Fuentes</h2><ul><li><a href="https://finnhub.io/" rel="noopener" target="_blank">Finnhub</a>: identificación por ISIN, consultado el ' + esc(ahoraES()) + '.</li><li><a href="https://www.tradingview.com/symbols/' + esc(tv.replace(":", "-")) + '/" rel="noopener" target="_blank">TradingView</a>: gráfico en vivo.</li></ul></div>';
    $("#tv-emp").innerHTML = '<div class="g-sin"><p>Gráfico disponible en cuanto la añadas a tu base (unos 3 minutos).</p>' + botonGuardar(isin, r.description) + "</div>";
  }

  function enlaceTV(tv) {
    return '<p class="meta">Análisis técnico avanzado: <a href="https://www.tradingview.com/symbols/' + esc(String(tv).replace(":", "-")) + '/" target="_blank" rel="noopener">abrir en TradingView ↗</a></p>';
  }
  function simbolosCfg(nombre, tv) {
    return { symbols: [[nombre, tv + "|12M"]], chartOnly: false, width: "100%", height: "100%", autosize: true, showVolume: false, hideDateRanges: false, scalePosition: "right", scaleMode: "Normal", chartType: "area", dateRanges: ["1d|1", "1m|30", "3m|60", "12m|1D", "60m|1W", "all|1M"] };
  }

  function fmtRatio(k, v) {
    if (v == null || v === "" || isNaN(v)) return null;
    const u = (RATIOS.ratios[k] || {}).unidad;
    if (u === "%") return nf(v, 1) + " %";
    if (u === "x") return nf(v, 1) + "x";
    return nf(v, 2);
  }
  const masEsMejor = { margen_bruto: 1, margen_operativo: 1, margen_ebitda: 1, margen_neto: 1, margen_fcf: 1, roe: 1, roic: 1, liquidez: 1 };
  const menosEsMejor = { per_ttm: 1, per_fwd: 1, peg: 1, ev_ebitda: 1, ev_ventas: 1, p_ventas: 1, p_vc: 1, deuda_ebitda: 1, deuda_patrimonio: 1 };
  function veredicto(k, v, rg) {
    if (!rg || v == null) return "";
    const [a, b] = rg;
    const pos = v < a ? "bajo" : v > b ? "alto" : "dentro";
    if (pos === "dentro") return '<span class="veredicto neutro">Dentro del rango de su sector</span>';
    const valor = { per_ttm: 1, per_fwd: 1, ev_ebitda: 1, p_vc: 1 }[k];
    let txt, cls;
    if (menosEsMejor[k]) { cls = pos === "bajo" ? "bien" : "mal"; txt = valor ? (pos === "bajo" ? "Más barata que su sector" : "Más cara que su sector") : (pos === "bajo" ? "Mejor que su sector" : "Peor que su sector"); }
    else if (masEsMejor[k]) { cls = pos === "alto" ? "bien" : "mal"; txt = pos === "alto" ? "Mejor que su sector" : "Peor que su sector"; }
    else { cls = "neutro"; txt = pos === "alto" ? "Por encima de su sector" : "Por debajo de su sector"; }
    return '<span class="veredicto ' + cls + '">' + txt + "</span>";
  }
  function barra(v, rg) {
    if (!rg || v == null) return "";
    const [a, b] = rg, span = b - a || 1;
    const lo = Math.min(a - span * 0.6, v), hi = Math.max(b + span * 0.6, v);
    const p = (x) => ((x - lo) / (hi - lo)) * 100;
    return '<div class="barra" aria-hidden="true"><div class="zona" style="left:' + p(a) + "%;width:" + (p(b) - p(a)) + '%"></div><div class="punto" style="left:' + Math.max(2, Math.min(98, p(v))) + '%"></div></div>' +
      '<div class="rango"><span>Rango normal del sector: ' + nf(a, 1) + "–" + nf(b, 1) + "</span></div>";
  }

  function pintar(e) {
    const sec = SECT.sectores[e.sector] || SECT.sectores.general;
    const fR = e.fuentes[e.fuenteRatios] || Object.values(e.fuentes)[0] || {};
    const fechaFuente = (f) => f && f.fecha ? (f.vivo ? "consultado el " + new Date(f.fecha).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "dato del " + fechaES(f.fecha)) : "";
    let h = '<a class="volver" href="#/">← Volver a mercados</a>';
    h += '<div class="e-cab"><div><h1 class="tit">' + esc(e.nombre) + "</h1>";
    h += '<p class="e-meta"><span>ISIN <b>' + esc(e.isin) + "</b></span><span>Ticker <b>" + esc(e.ticker) + "</b></span>" + (e.bolsa ? "<span>" + esc(e.bolsa) + "</span>" : "") + (e.pais ? "<span>" + esc(e.pais) + "</span>" : "") + "<span>Sector: <b>" + esc(sec.nombre) + "</b>" + (e.industria ? " (" + esc(e.industria) + ")" : "") + "</span></p>";
    if (e.descripcion) h += '<p class="e-desc">' + esc(e.descripcion) + "</p>";
    h += e.origen === "finnhub" ? '<span class="etiqueta vivo">Datos en vivo · Finnhub</span>' : '<span class="etiqueta">Ficha de tu base · actualizada el ' + esc(fechaES(fR.fecha)) + "</span>";
    h += "</div>";
    if (e.precio) {
      const p = e.precio, fp = e.fuentes[p.fuente] || {};
      const pe = aEUR(p.v, e.divisa), esEUR = (e.divisa || "EUR") === "EUR";
      h += '<div class="e-precio"><div class="peq">Precio en euros</div><div class="grande">' + (pe != null ? nf(pe, 2) + " €" : nf(p.v, 2) + " " + esc(e.divisa)) + "</div>";
      if (!esEUR && pe != null) h += '<div class="peq">' + nf(p.v, 2) + " " + esc(e.divisa) + " en su bolsa · cambio EUR/" + esc(e.divisa === "GBp" ? "GBP" : e.divisa) + " " + nf(FXR[e.divisa === "GBp" ? "GBP" : e.divisa], 4) + " (Yahoo Finance)</div>";
      if (p.cambio_pct != null) h += '<div class="cambio ' + (p.cambio_pct >= 0 ? "pos" : "neg") + '">' + (p.cambio_pct >= 0 ? "+" : "") + nf(p.cambio_pct, 2) + " % hoy</div>";
      h += '<div class="peq">' + (fp.vivo ? "Consultado el " + esc(new Date(p.fecha).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })) : "Precio del " + esc(fechaES(p.fecha)) + (p.nota ? " (" + esc(p.nota) + ")" : "") + ". El gráfico de abajo se actualiza cada 30 min.") +
        ' · <a href="' + esc(fp.url) + '" target="_blank" rel="noopener">Fuente ↗</a></div>';
      const mc = e.ratios.cap_bursatil != null ? aEUR(e.ratios.cap_bursatil, e.divisa === "GBp" ? "GBP" : e.divisa) : null, ev = e.ratios.ev != null ? aEUR(e.ratios.ev, e.divisa === "GBp" ? "GBP" : e.divisa) : null;
      if (mc) h += '<div class="peq">Capitalización: ' + nf(mc / 1000, 2) + " mil millones €" + (ev ? " · Valor de empresa (EV): " + nf(ev / 1000, 2) + " mil millones €" : "") + "</div>";
      if (e.origen === "finnhub") h += '<div style="margin-top:12px">' + botonGuardar(e.isin, e.nombre) + "</div>";
      h += "</div>";
    }
    h += "</div>";
    h += '<div class="grafico-empresa g-tarjeta" id="tv-emp"></div>' + enlaceTV(e.tv);
    if (e.notas && e.notas.length) h += '<div class="notas">' + e.notas.map((n) => "<p>" + esc(n) + "</p>").join("") + "</div>";
    h += '<div class="sector-caja"><h3>Cómo se valora este sector: ' + esc(sec.nombre) + "</h3><p>" + esc(sec.claves) + "</p>" +
      (sec.ref ? "<p>Referencia (mediana en EE. UU., Damodaran, enero 2026): " + (sec.ref.ev_ebitda ? "EV/EBITDA " + nf(sec.ref.ev_ebitda, 1) + "x" : "") + (sec.ref.per_fwd ? " · PER forward " + nf(sec.ref.per_fwd, 1) + "x" : "") + ' (' + esc(sec.ref.damodaran) + ') · <a href="' + esc(SECT.fuente_referencia.url_ev_ebitda) + '" target="_blank" rel="noopener">Fuente ↗</a></p>' : "") +
      "<p>" + esc(SECT.nota) + "</p></div>";

    RATIOS.grupos.forEach((g) => {
      const items = g.ratios.filter((k) => k in e.ratios);
      if (!items.length) return;
      h += '<section class="grupo"><h2>' + esc(g.nombre) + '</h2><div class="ratios">';
      items.forEach((k) => {
        const def = RATIOS.ratios[k], v = e.ratios[k], txt = fmtRatio(k, v), rg = sec.rangos && sec.rangos[k];
        h += '<article class="ratio" id="r-' + k + '"><div class="ratio-cab"><span class="ratio-nom">' + esc(def.nombre) + '</span><span class="ratio-val' + (txt ? "" : " na") + '">' + (txt || "Sin dato") + "</span></div>";
        h += '<p class="ratio-exp">' + esc(def.que_es) + "</p>";
        if (txt) h += barra(v, rg) + veredicto(k, v, rg);
        h += '<details class="mas"><summary>Cómo leerlo</summary><p>' + esc(def.como_leer) + "</p>" + (def.ojo ? "<p><b>Ojo:</b> " + esc(def.ojo) + "</p>" : "") + "</details>";
        h += '<div class="ratio-pie"><span>' + esc(fechaFuente(fR)) + "</span>" + (fR.url ? '<a class="fuente-btn" href="' + esc(fR.url) + '" target="_blank" rel="noopener" title="' + esc(fR.nombre) + '">Fuente ↗</a>' : "") + "</div></article>";
      });
      h += "</div></section>";
    });

    // Analistas
    h += '<section class="grupo"><h2>Opinión de los analistas</h2>';
    const a = e.analistas;
    if (a && a.recs) {
      const r = a.recs, tot = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell || 1;
      const seg = [["Compra fuerte", r.strongBuy, "#0e8a4f"], ["Comprar", r.buy, "#5cbf8a"], ["Mantener", r.hold, "#9aa3ad"], ["Vender", r.sell, "#f08a7a"], ["Venta fuerte", r.strongSell, "#c62f2f"]];
      const fa = e.fuentes[a.fuente] || {};
      h += '<div class="analistas"><div class="kpi"><div class="k">Analistas</div><div class="v">' + tot + '</div></div><div class="kpi"><div class="k">A favor de comprar</div><div class="v">' + Math.round(((r.strongBuy + r.buy) / tot) * 100) + ' %</div></div></div>';
      h += '<div class="recs" role="img" aria-label="Reparto de recomendaciones">' + seg.map((s) => '<span style="width:' + (s[1] / tot) * 100 + "%;background:" + s[2] + '"></span>').join("") + "</div>";
      h += '<div class="recs-ley">' + seg.map((s) => '<span><i style="background:' + s[2] + '"></i>' + s[0] + ": " + s[1] + "</span>").join("") + "</div>";
      h += '<p class="meta">Recomendaciones del mes ' + esc(a.periodo) + ' · <a href="' + esc(fa.url) + '" target="_blank" rel="noopener">Fuente ↗</a>. El precio objetivo es de pago en Finnhub.</p>';
    } else if (a) {
      const fa = e.fuentes[a.fuente] || {};
      h += '<div class="analistas"><div class="kpi"><div class="k">Consenso</div><div class="v">' + esc(a.consenso) + '</div></div><div class="kpi"><div class="k">Analistas</div><div class="v">' + esc(a.n) + '</div></div><div class="kpi"><div class="k">Precio objetivo medio</div><div class="v">' + (aEUR(a.objetivo, e.divisa) != null ? nf(aEUR(a.objetivo, e.divisa), 2) + " €" : nf(a.objetivo, 2)) + '</div></div><div class="kpi"><div class="k">Potencial</div><div class="v cambio ' + (a.potencial >= 0 ? "pos" : "neg") + '">' + (a.potencial >= 0 ? "+" : "") + nf(a.potencial, 1) + " %</div></div></div>";
      h += '<p class="meta">Dato del ' + esc(fechaES(fa.fecha)) + ' · <a href="' + esc(fa.url) + '" target="_blank" rel="noopener">Fuente ↗</a>. Los analistas recomiendan comprar con mucha más frecuencia que vender: úsalo como una opinión más.</p>';
    } else h += '<p class="meta">Sin datos de analistas.</p>';
    h += "</section>";

    // Histórico (solo Finnhub)
    if (e.hist) {
      const cands = [["pe", "PER", false], ["evEbitda", "EV/EBITDA", false], ["netMargin", "Margen neto (%)", true], ["operatingMargin", "Margen operativo (%)", true], ["roe", "ROE (%)", true], ["eps", "Beneficio por acción", false]];
      const ok = cands.filter((c) => Array.isArray(e.hist[c[0]]) && e.hist[c[0]].length > 2);
      if (ok.length) {
        h += '<section class="grupo"><h2>Evolución histórica (anual)</h2><div class="hist">' + ok.map((c) => '<div class="hist-caja"><h3>' + c[1] + '</h3><svg class="hist-svg" data-serie="' + c[0] + '" data-pct="' + (c[2] ? 1 : 0) + '" role="img" aria-label="' + c[1] + ' por año"></svg></div>').join("") + "</div>";
        h += '<p class="meta">Fuente: <a href="' + esc(e.fuentes.fh.url) + '" target="_blank" rel="noopener">Finnhub ↗</a></p></section>';
      }
    }

    // Fuentes
    h += '<div class="fuentes"><h2>Fuentes de esta ficha</h2><ul>' + Object.values(e.fuentes).map((f) => '<li><a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.nombre) + "</a>" + (f.fecha ? " · " + esc(fechaFuente(f)) : "") + "</li>").join("") + "</ul></div>";
    h += botonesGitHub(e.isin, e.nombre, e.origen === "base" ? "actualizar" : null).replace("Añadir a mi base", e.origen === "finnhub" ? "Guardar en mi base" : "Añadir a mi base");
    if (e.origen === "finnhub") h = h.replace('<div class="acciones">', '<div class="acciones"><button type="button" class="btn sec" id="refrescar">Refrescar datos</button>');

    $("#empresa").innerHTML = h;
    Grafico.grande($("#tv-emp"), { id: e.isin, etiqueta: esc(e.nombre) }).then((ok) => {
      if (!ok) $("#tv-emp").innerHTML = e.origen === "finnhub"
        ? '<div class="g-sin"><p>Esta empresa aún no está en tu base, así que no tiene gráfico. Guárdala y en unos 3 minutos tendrás aquí su gráfico en euros (recarga la página).</p>' + botonGuardar(e.isin, e.nombre) + '<p class="meta">Se abrirá GitHub con la petición ya escrita: solo tienes que pulsar «Create» (o «Submit new issue»).</p></div>'
        : '<p class="g-sin">El gráfico se genera en la próxima actualización de datos (cada 30 min).</p>';
    });
    const rb = $("#refrescar"); if (rb) rb.onclick = () => empresa(e.isin);
    document.querySelectorAll(".hist-svg").forEach((s) => dibujarHist(s, e.hist[s.dataset.serie], s.dataset.pct === "1"));
  }

  function dibujarHist(svg, serie, pct) {
    const d = serie.slice().reverse().filter((x) => x.v != null).slice(-12);
    if (d.length < 2) return;
    let vals = d.map((x) => x.v);
    if (pct && Math.max(...vals.map(Math.abs)) <= 1.5) vals = vals.map((v) => v * 100);
    const W = svg.clientWidth || 320, H = 150, ml = 40, mr = 10, mt = 10, mb = 22;
    const lo = Math.min(0, ...vals), hi = Math.max(...vals) || 1;
    const x = (i) => ml + (i * (W - ml - mr)) / (vals.length - 1), y = (v) => mt + (1 - (v - lo) / (hi - lo || 1)) * (H - mt - mb);
    const pts = vals.map((v, i) => x(i) + "," + y(v)).join(" ");
    const col = getComputedStyle(document.documentElement).getPropertyValue("--acc").trim() || "#1d5fd1";
    const lineCol = getComputedStyle(document.documentElement).getPropertyValue("--line").trim() || "#ddd";
    let g = '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="' + lineCol + '"/>';
    g += '<polyline fill="none" stroke="' + col + '" stroke-width="2" points="' + pts + '"/>';
    g += '<circle cx="' + x(vals.length - 1) + '" cy="' + y(vals[vals.length - 1]) + '" r="4" fill="' + col + '"/>';
    g += '<text x="' + (ml - 6) + '" y="' + (y(hi) + 4) + '" text-anchor="end">' + nf(hi, 1) + '</text><text x="' + (ml - 6) + '" y="' + (y(lo) + 4) + '" text-anchor="end">' + nf(lo, 1) + "</text>";
    g += '<text x="' + ml + '" y="' + (H - 4) + '">' + esc(d[0].period.slice(0, 4)) + '</text><text x="' + (W - mr) + '" y="' + (H - 4) + '" text-anchor="end">' + esc(d[d.length - 1].period.slice(0, 4)) + "</text>";
    g += '<text x="' + (x(vals.length - 1) - 6) + '" y="' + (y(vals[vals.length - 1]) - 8) + '" text-anchor="end" style="font-weight:600;fill:currentColor">' + nf(vals[vals.length - 1], 1) + "</text>";
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.innerHTML = g;
  }

  /* ---------- Guía ---------- */
  function guia() {
    cargarDatos.then(() => {
      $("#guia").innerHTML = RATIOS.grupos.map((g) => '<div class="guia-grupo"><h2>' + esc(g.nombre) + "</h2>" + g.ratios.map((k) => {
        const r = RATIOS.ratios[k];
        return '<div class="guia-item"><h3>' + esc(r.nombre) + "</h3><p>" + esc(r.que_es) + "</p><p>" + esc(r.como_leer) + "</p>" + (r.ojo ? '<p class="o"><b>Ojo:</b> ' + esc(r.ojo) + "</p>" : "") + "</div>";
      }).join("") + "</div>").join("");
    });
  }

  /* ---------- Rutas ---------- */
  function ruta() {
    const h = location.hash || "#/";
    const m = h.match(/^#\/empresa\/([A-Za-z0-9]+)/);
    const vista = m ? "empresa" : h.startsWith("#/guia") ? "guia" : h.startsWith("#/cartera") ? "cartera" : "inicio";
    document.querySelectorAll(".vista").forEach((v) => (v.hidden = v.id !== "v-" + vista));
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === vista));
    window.scrollTo(0, 0);
    if (vista === "inicio") portada();
    else if (vista === "empresa") empresa(m[1].toUpperCase());
    else if (vista === "guia") guia();
  }
  window.addEventListener("hashchange", ruta);
  aviso();
  ruta();
})();
