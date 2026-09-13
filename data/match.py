import re, unicodedata
import openpyxl
wb = openpyxl.load_workbook('/app/backend/data/clienti.xlsx', data_only=True)
ws = wb['Clienti']
rows = list(ws.iter_rows(values_only=True))
hdr=[str(h).strip() if h else "" for h in rows[0]]
idx={h:i for i,h in enumerate(hdr)}
def g(r,c):
    i=idx.get(c); 
    if i is None or i>=len(r) or r[i] is None: return ""
    return str(r[i]).strip()
def norm(s):
    s=(s or "").strip().replace("\u2019","'").replace("`","'")
    s=re.sub(r'\s+',' ',s)
    return s
def key(s):
    s=norm(s).lower()
    s=''.join(c for c in unicodedata.normalize('NFD',s) if unicodedata.category(c)!='Mn')
    return s

data=rows[1:]
def find(name):
    k=key(name)
    hits=[]
    for r in data:
        rs=g(r,'Ragione Sociale')
        if key(rs)==k or k in key(rs) or key(rs) in k and len(key(rs))>4:
            hits.append((rs, g(r,'Città'), g(r,'Indirizzo'), g(r,'Descrizione Zona'), g(r,'Nominativo Agente')))
    return hits

assign=["Gramaca S.r.l.","F.lli Baldo latticini e salumi sas","Cala del porto Srl","Il Saraceno Srls","New invest Srl","Sapori di mare",
"Alimentari del sole Srl","Boulangerie di Vincenzo d'Amico","Coop. Vibonia Turistica","Fabbrica","G&G distribution Srl","Macelleria Chiarello Francesco","Mastroianni group","Mediolat srl","Mediterranea eventi Srl","Rubyrosa Guinness","Taverna dei vecchi tempi","Vinus Srl","Voglia di pizza di Umbro Giuseppina",
"Gusto e fantasia di La bella Anna Maria","Agriturismo il Casolare","La Degusteria","San Nicola s.r.l.s","F.lli Corigliano sas","Le Stagioni di Paolo Tamburro","La valle verde di Amendola Salvatore","Dei.Lo srl"]
dele=["Hotel San Domenico","Rist. l'Eremo","Amalfi Srl","Bar da Andrea","Ditta F.lli Nusdeo","Eredi Catania Francesco","Il Vinale di Alessandro Mazzotta","Ital Frutta","La Cambusa","Lo Schiavo Catering"]

print("=========== ASSIGN (36) ===========")
for n in assign:
    h=find(n)
    print(f"[{n}] -> {len(h)} hit(s)")
    for x in h[:3]: print("      ", x)
print("=========== DELETE (10) ===========")
for n in dele:
    h=find(n)
    print(f"[{n}] -> {len(h)} hit(s)")
    for x in h[:3]: print("      ", x)
