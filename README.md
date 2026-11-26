# Mi panel de inversión

Web personal: índices en vivo (TradingView), buscador de empresas por ISIN con ratios explicados, rango de su sector, opinión de analistas y la fuente de cada dato.

- **Dirección:** https://vsuarez13.github.io/inversion/
- **Empresas de EE. UU.:** datos en vivo desde Finnhub (clave en `assets/config.js`).
- **Empresas europeas:** base propia en `data/empresas.json`, actualizada periódicamente, con la fuente y la fecha de cada dato.
- **Pedir una empresa nueva o una actualización:** botones de la ficha (crean una petición en *Issues*).

## Archivos
- `index.html`, `assets/` – la web.
- `data/empresas.json` – fichas de la base.
- `data/sectores.json` – rangos orientativos por sector y referencia de Damodaran (NYU Stern).
- `data/ratios.json` – explicación de cada ratio.
- `data/actualizacion.json` – fecha y resumen de la última actualización (aviso de la portada).

Uso personal. No es asesoramiento financiero.
