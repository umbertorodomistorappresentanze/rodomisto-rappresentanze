"""Seed data and Excel import logic for AgendaVisite (definitive configuration)."""
import re
import unicodedata
from pathlib import Path

import openpyxl

DATA_DIR = Path(__file__).parent / "data"
EXCEL_PATH = DATA_DIR / "clienti.xlsx"

COMPANIES = [
    "Librandi", "Pellegrini", "Serracavallo", "Cala", "Mazzetti d'Altavilla",
    "Tramin", "Pio Cesare", "Biondi Santi", "Isole e Olena", "Mosnel",
    "Foss Marai", "Piper-Heidsieck", "Toso", "Menù", "Villani", "Bonfissuto",
]

GIRO_ALTILIA = "Catanzaro → Altilia"
GIRO_LAMEZIA_VIBO = "Lamezia Terme → Vibo Valentia"
GIRO_VIBO_RICADI = "Vibo Valentia → Ricadi"

GIRI = [
    {
        "name": "Catanzaro e Limitrofi",
        "localities": ["Catanzaro", "Catanzaro Lido", "Gimigliano"],
    },
    {
        "name": "Catanzaro → Sila Piccola",
        "localities": ["Cicala", "Sorbo San Basile", "Taverna", "Cultura", "Villaggio Racisi"],
    },
    {
        "name": "Catanzaro → Guardavalle",
        "localities": [
            "Roccelletta di Borgia", "Borgia", "Squillace Lido", "Copanello", "Caminia",
            "Stalettì", "Squillace", "Amaroni", "Girifalco", "Cortale", "Iacurso",
            "Soriano Calabro", "Serra San Bruno", "Spadola", "Gasperina", "Montauro",
            "Montepaone", "Soverato", "Satriano", "Davoli", "Sant'Andrea dello Ionio",
            "Badolato", "Santa Caterina dello Ionio", "Guardavalle",
        ],
    },
    {
        "name": "Catanzaro → Crotone",
        "localities": [
            "Simeri Crichi", "Sellia", "San Pietro Magisano", "Sellia Marina", "Cropani",
            "Sersale", "Petronà", "Cotronei", "Petilia Policastro", "Mesoraca",
            "Roccabernarda", "Botricello", "Steccato di Cutro", "Praialonga", "Le Castella",
            "Isola di Capo Rizzuto", "Cutro", "Pescara", "Crotone", "Belvedere di Spinello",
            "Rocca di Neto", "Strongoli", "Marina di Strongoli", "Cirò Marina",
        ],
    },
    {
        "name": GIRO_ALTILIA,
        "localities": [
            "Settingiano", "Martelletto", "Sarrottino", "Marcellinara", "Pratora",
            "San Pietro a Maida", "Maida", "Curinga", "Francavilla Angitola",
            "Feroleto Antico", "Rizziconi", "Lamezia Terme", "Gizzeria", "Falerna",
            "Nocera Terinese", "Amantea", "Roma", "Tiriolo", "San Pietro Apostolo",
            "Serrastretta", "Decollatura", "Soveria Mannelli", "Altilia",
        ],
    },
    {
        "name": GIRO_LAMEZIA_VIBO,
        "localities": [
            "Pizzo", "Vibo Valentia Marina", "Maierato", "Vibo Valentia", "Piscopio",
            "Cessaniti", "Filandari", "Rombiolo", "Joppolo", "Nicotera", "Limbadi",
            "Mileto", "Ionadi", "Francica", "Filogaso", "Simbario", "Mongiana",
        ],
    },
    {
        "name": GIRO_VIBO_RICADI,
        "localities": [
            "San Gregorio d'Ippona", "Briatico", "Zambrone", "Parghelia", "Tropea",
            "Santa Domenica", "San Nicolò", "Ricadi", "Brattirò",
        ],
    },
]

# No ambiguous localities anymore: Vibo Valentia now lives only in the
# Lamezia Terme → Vibo Valentia giro.
AMBIGUOUS_LOCALITIES: set = set()

AGENT_MAP = {
    "umberto rodomisto": "umberto",
    "andrea azzarito": "andrea",
}


def _norm(s):
    if s is None:
        return ""
    s = str(s).strip().replace("\u2019", "'").replace("`", "'")
    s = re.sub(r"\s+", " ", s)
    return s


def _key(s):
    s = _norm(s).lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return s


# ---------------------------------------------------------------------------
# Manual, verified assignments: normalized ragione sociale -> (giro, locality)
# ---------------------------------------------------------------------------
def _m(pairs, giro, locality):
    return {_key(name): (giro, locality) for name in pairs}


MANUAL_ASSIGNMENTS = {}
MANUAL_ASSIGNMENTS.update(_m([
    "Gramaca S.r.l.", "F.lli Baldo latticini e salumi sas", "Cala del porto Srl",
    "Il Saraceno Srls", "New invest Srl", "Sapori di mare",
], GIRO_LAMEZIA_VIBO, "Vibo Valentia Marina"))
MANUAL_ASSIGNMENTS.update(_m([
    "Alimentari del sole Srl", "Boulangerie di Vincenzo d'Amico", "Coop. Vibonia Turistica",
    "Fabbrica", "G&G distribution Srl", "Macelleria Chiarello Francesco",
    "Mastroianni group (cod. Pac 300231)", "Mediolat srl", "Mediterranea eventi Srl",
    "Rubyrosa Guinness", "Taverna dei vecchi tempi", "Vinus Srl",
    "Voglia di pizza di Umbro Giuseppina",
], GIRO_LAMEZIA_VIBO, "Vibo Valentia"))
MANUAL_ASSIGNMENTS.update(_m(["Gusto e fantasia di La bella Anna Maria"], GIRO_LAMEZIA_VIBO, "Piscopio"))
MANUAL_ASSIGNMENTS.update(_m([
    "Agriturismo il Casolare F.lli Ranieli sas", "La Degusteria sas di Antonio Carioti & C",
], GIRO_LAMEZIA_VIBO, "Rombiolo"))
MANUAL_ASSIGNMENTS.update(_m(["San Nicola s.r.l.s"], GIRO_LAMEZIA_VIBO, "Nicotera"))
MANUAL_ASSIGNMENTS.update(_m(["F.lli Corigliano sas"], GIRO_LAMEZIA_VIBO, "Mileto"))
MANUAL_ASSIGNMENTS.update(_m(["Le Stagioni di Paolo Tamburro"], GIRO_LAMEZIA_VIBO, "Filogaso"))
MANUAL_ASSIGNMENTS.update(_m([
    "La valle verde di Amendola Salvatore", "Dei.Lo srl",
], GIRO_VIBO_RICADI, "Zambrone"))
# Tenuta Klopè already exists in the Excel (città Francavilla Angitola); route it
# to the Altilia giro at the new Francavilla Angitola locality.
MANUAL_ASSIGNMENTS.update(_m(["Tenuta Klopè"], GIRO_ALTILIA, "Francavilla Angitola"))

# ---------------------------------------------------------------------------
# Clients to delete definitively: (ragione substring key, city key)
# City guards against homonyms (e.g. keep "Bar Amalfi" in Catanzaro).
# ---------------------------------------------------------------------------
DELETE_CLIENTS = [
    ("hotel san domenico", "sorbo san basile"),
    ("eremo", "curinga"),
    ("amalfi", "vibo valentia"),
    ("bar da andrea", "vibo valentia"),
    ("nusdeo", "vibo valentia"),
    ("eredi catania", "vibo valentia"),
    ("vinale", "vibo valentia"),
    ("ital frutta", "vibo valentia"),
    ("la cambusa", "vibo valentia"),
    ("lo schiavo catering", "vibo valentia"),
]

# ---------------------------------------------------------------------------
# New clients not present in the Excel. (Tenuta Klopè already exists in the
# Excel, so it is handled via MANUAL_ASSIGNMENTS instead.)
# ---------------------------------------------------------------------------
EXTRA_CLIENTS: list = []


def build_locality_index(giri_docs):
    index = {}
    for g in giri_docs:
        for pos, loc in enumerate(g["localities"]):
            index.setdefault(_key(loc), []).append((g["id"], pos))
    result = {}
    for k, entries in index.items():
        if k in AMBIGUOUS_LOCALITIES or len(entries) > 1:
            continue
        result[k] = entries[0]
    return result


def giro_position(giri_docs, giro_name, locality):
    for g in giri_docs:
        if g["name"] == giro_name:
            k = _key(locality)
            for pos, loc in enumerate(g["localities"]):
                if _key(loc) == k:
                    return g["id"], pos
            return g["id"], 999
    return None, None


def should_delete(ragione, citta):
    rk = _key(ragione)
    ck = _key(citta)
    for name_sub, city in DELETE_CLIENTS:
        if name_sub in rk and (not city or city == ck):
            return True
    return False


def parse_clients():
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    ws = wb["Clienti"]
    rows = list(ws.iter_rows(values_only=True))
    header = [(_norm(h) if h is not None else "") for h in rows[0]]
    idx = {h: i for i, h in enumerate(header)}

    def cell(row, col):
        i = idx.get(col)
        if i is None or i >= len(row) or row[i] is None:
            return None
        v = row[i]
        return _norm(v) if isinstance(v, str) else v

    clients = []
    for row in rows[1:]:
        ragione = cell(row, "Ragione Sociale")
        if not ragione:
            continue
        agent_raw = _key(cell(row, "Nominativo Agente") or "")
        agent = AGENT_MAP.get(agent_raw, "umberto")
        zona = cell(row, "Descrizione Zona")

        def strv(col):
            v = cell(row, col)
            return "" if v is None else str(v)

        clients.append({
            "codice_azienda": strv("Codice Azienda"),
            "ragione_sociale": ragione,
            "indirizzo": strv("Indirizzo"),
            "cap": strv("CAP"),
            "citta": strv("Città"),
            "provincia": strv("Provincia"),
            "zona": "" if zona is None else str(zona),
            "telefono": strv("Telefono") or strv("Telefono Cellulare") or strv("Telefono Ufficio"),
            "email": strv("Email"),
            "agent": agent,
            "extra": {
                "partita_iva": strv("Partita IVA"),
                "codice_fiscale": strv("Codice Fiscale"),
                "telefono_ufficio": strv("Telefono Ufficio"),
                "telefono_cellulare": strv("Telefono Cellulare"),
                "email_pec": strv("Email PEC"),
                "sito_web": strv("Sito Web"),
                "classificazione": strv("Classificazione"),
                "categoria": strv("Descrizione Cat. Commerciali"),
                "pagamento": strv("Descrizione Mod. di Pagamento"),
                "note_interne": strv("Note Interne"),
            },
        })
    return clients


def resolve_assignment(ragione, zona, giri_docs, loc_index):
    """Return (giro_id, position). Manual assignments win over zona matching."""
    manual = MANUAL_ASSIGNMENTS.get(_key(ragione))
    if manual:
        giro_id, pos = giro_position(giri_docs, manual[0], manual[1])
        if giro_id:
            return giro_id, pos
    k = _key(zona)
    if k in loc_index:
        return loc_index[k]
    return (None, None)
