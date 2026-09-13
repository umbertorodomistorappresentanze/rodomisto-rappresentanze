import openpyxl, json, unicodedata, re
from collections import Counter, defaultdict
wb = openpyxl.load_workbook('/app/data/clienti.xlsx', data_only=True)
ws = wb['Clienti']
rows = list(ws.iter_rows(values_only=True))
hdr = rows[0]
data = rows[1:]
idx = {h:i for i,h in enumerate(hdr)}

def norm(s):
    if s is None: return ""
    s = str(s).strip()
    s = s.replace("’","'").replace("`","'")
    s = re.sub(r'\s+',' ', s)
    return s

agents = Counter(norm(r[idx['Nominativo Agente']]) for r in data)
print("AGENTS:", dict(agents))
prov = Counter(norm(r[idx['Provincia']]) for r in data)
print("PROV:", dict(prov))

zones = Counter(norm(r[idx['Descrizione Zona']]) for r in data)
print("N unique zones:", len(zones))

# Define giri localities from prompt
giri = {
 "CATANZARO E LIMITROFI": ["Catanzaro","Catanzaro Lido","Gimigliano"],
 "CATANZARO -> SILA PICCOLA": ["Cicala","Sorbo San Basile","Taverna","Cultura","Villaggio Racisi"],
 "CATANZARO -> GUARDAVALLE": ["Roccelletta di Borgia","Borgia","Squillace Lido","Copanello","Caminia","Stalettì","Squillace","Amaroni","Girifalco","Cortale","Iacurso","Soriano Calabro","Serra San Bruno","Spadola","Gasperina","Montauro","Montepaone","Soverato","Satriano","Davoli","Sant'Andrea dello Ionio","Badolato","Santa Caterina dello Ionio","Guardavalle"],
 "CATANZARO -> CROTONE": ["Simeri Crichi","Sellia","San Pietro Magisano","Sellia Marina","Cropani","Sersale","Petronà","Cotronei","Petilia Policastro","Mesoraca","Roccabernarda","Botricello","Steccato di Cutro","Praialonga","Le Castella","Isola di Capo Rizzuto","Cutro","Pescara","Crotone","Belvedere di Spinello","Rocca di Neto","Strongoli","Marina di Strongoli","Cirò Marina"],
 "CATANZARO -> ALTILIA": ["Settingiano","Martelletto","Sarrottino","Marcellinara","Pratora","San Pietro a Maida","Maida","Curinga","Feroleto Antico","Rizziconi","Lamezia Terme","Gizzeria","Falerna","Nocera Terinese","Amantea","Roma","Tiriolo","San Pietro Apostolo","Serrastretta","Decollatura","Soveria Mannelli","Altilia"],
 "LAMEZIA TERME -> VIBO VALENTIA": ["Pizzo","Vibo Valentia Marina","Maierato","Vibo Valentia","Piscopio","Cessaniti","Filandari","Joppolo","Limbadi","Mileto","Ionadi","Francica","Filogaso","Simbario","Mongiana"],
 "VIBO VALENTIA -> RICADI": ["Vibo Valentia","San Gregorio d'Ippona","Briatico","Zambrone","Parghelia","Tropea","Santa Domenica","San Nicolò","Ricadi","Brattirò"],
}

def key(s):
    s = norm(s).lower()
    s = ''.join(c for c in unicodedata.normalize('NFD',s) if unicodedata.category(c)!='Mn')
    return s

# build locality -> list of giri
loc2giri = defaultdict(list)
for g, locs in giri.items():
    for l in locs:
        loc2giri[key(l)].append(g)

matched=0; unmatched=Counter(); ambiguous=Counter()
for z,c in zones.items():
    k=key(z)
    if k in loc2giri:
        if len(loc2giri[k])>1:
            ambiguous[z]+=c
        matched+=c
    else:
        unmatched[z]+=c
print("clients whose zone matches a giro locality:", matched)
print("clients with UNMATCHED zone (top 40):")
for z,c in unmatched.most_common(40):
    print(f"   {c:4d}  {z!r}")
print("total unmatched clients:", sum(unmatched.values()), "unique unmatched zones:", len(unmatched))
print("AMBIGUOUS zones (appear in >1 giro):", dict(ambiguous))
