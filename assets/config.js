// Configuración de la web. Puedes editar este archivo directamente en GitHub.
window.CONFIG = {
  // Clave gratuita de Finnhub (https://finnhub.io/dashboard). Si la regeneras, cámbiala aquí.
  finnhubKey: "dc4afshr01qsbokh9gg0dc4afshr01qsbokh9ggg",

  // Repositorio de GitHub donde vive la web (para los botones "Añadir a mi base" y "Pedir actualización").
  repo: "vsuarez13/inversion",

  // Índices de la portada. "tv" es el símbolo de TradingView; si alguno no carga, se puede cambiar por otro equivalente.
  indices: [
    { nombre: "S&P 500", pais: "EE. UU.", tv: "FOREXCOM:SPXUSD" },
    { nombre: "Nasdaq-100", pais: "EE. UU.", tv: "FOREXCOM:NSXUSD" },
    { nombre: "Euro Stoxx 50", pais: "Zona euro", tv: "TVC:SX5E" },
    { nombre: "IBEX 35", pais: "España", tv: "BME:IBC" },
    { nombre: "DAX", pais: "Alemania", tv: "FOREXCOM:GRXEUR" },
    { nombre: "Nikkei 225", pais: "Japón", tv: "FOREXCOM:JPXJPY" },
    { nombre: "Hang Seng", pais: "Hong Kong", tv: "FOREXCOM:HKXHKD" }
  ]
};
