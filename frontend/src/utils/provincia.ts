// Normalizzazione provincia -> sigla di 2 lettere maiuscole.
// Allineato al backend (normalize_provincia in frontend/api/index.py).

const PROVINCE_MAP: Record<string, string> = {
  agrigento: "AG", alessandria: "AL", ancona: "AN", aosta: "AO",
  arezzo: "AR", "ascoli piceno": "AP", asti: "AT", avellino: "AV",
  bari: "BA", "barletta-andria-trani": "BT", "barletta andria trani": "BT",
  belluno: "BL", benevento: "BN", bergamo: "BG", biella: "BI",
  bologna: "BO", bolzano: "BZ", brescia: "BS", brindisi: "BR",
  cagliari: "CA", caltanissetta: "CL", campobasso: "CB",
  "carbonia-iglesias": "CI", caserta: "CE", catania: "CT",
  catanzaro: "CZ", chieti: "CH", como: "CO", cosenza: "CS",
  cremona: "CR", crotone: "KR", cuneo: "CN", enna: "EN",
  fermo: "FM", ferrara: "FE", firenze: "FI", foggia: "FG",
  "forli-cesena": "FC", "forli cesena": "FC", frosinone: "FR",
  genova: "GE", gorizia: "GO", grosseto: "GR", imperia: "IM",
  isernia: "IS", "la spezia": "SP", "l'aquila": "AQ", laquila: "AQ",
  latina: "LT", lecce: "LE", lecco: "LC", livorno: "LI",
  lodi: "LO", lucca: "LU", macerata: "MC", mantova: "MN",
  "massa-carrara": "MS", "massa carrara": "MS", matera: "MT",
  messina: "ME", milano: "MI", modena: "MO", "monza e brianza": "MB",
  "monza e della brianza": "MB", napoli: "NA", novara: "NO",
  nuoro: "NU", oristano: "OR", padova: "PD", palermo: "PA",
  parma: "PR", pavia: "PV", perugia: "PG", "pesaro e urbino": "PU",
  pescara: "PE", piacenza: "PC", pisa: "PI", pistoia: "PT",
  pordenone: "PN", potenza: "PZ", prato: "PO", ragusa: "RG",
  ravenna: "RA", "reggio calabria": "RC", "reggio di calabria": "RC",
  "reggio emilia": "RE", "reggio nell'emilia": "RE", rieti: "RI",
  rimini: "RN", roma: "RM", rovigo: "RO", salerno: "SA",
  sassari: "SS", savona: "SV", siena: "SI", siracusa: "SR",
  sondrio: "SO", taranto: "TA", teramo: "TE", terni: "TR",
  torino: "TO", trapani: "TP", trento: "TN", treviso: "TV",
  trieste: "TS", udine: "UD", varese: "VA", venezia: "VE",
  "verbano-cusio-ossola": "VB", verbania: "VB", vercelli: "VC",
  verona: "VR", "vibo valentia": "VV", vicenza: "VI", viterbo: "VT",
};

const VALID_SIGLE = new Set(Object.values(PROVINCE_MAP));

export function normalizeProvincia(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  const low = s
    .toLowerCase()
    .replace(/[.\s]+$/g, "")
    .replace(/à/g, "a").replace(/è/g, "e").replace(/é/g, "e")
    .replace(/ì/g, "i").replace(/ò/g, "o").replace(/ù/g, "u");
  if (s.length === 2 && /^[a-zA-Z]+$/.test(s) && VALID_SIGLE.has(s.toUpperCase())) {
    return s.toUpperCase();
  }
  if (PROVINCE_MAP[low]) return PROVINCE_MAP[low];
  if (s.length === 2 && /^[a-zA-Z]+$/.test(s)) return s.toUpperCase();
  const letters = s.replace(/[^a-zA-Z]/g, "");
  return letters.slice(0, 2).toUpperCase();
}
