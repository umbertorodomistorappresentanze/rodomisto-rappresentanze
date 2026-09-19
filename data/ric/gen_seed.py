import re, unicodedata, openpyxl, json

def clean(s):
    if s is None: return ""
    return str(s).strip()

def norm(s):
    if s is None: return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode()
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+"," ", s)
    return re.sub(r"\s+"," ", s).strip()

def group_label(company, title):
    t = title.strip()
    t = t.replace("da Ctanzaro", "Catanzaro").replace("da Catanzaro", "Catanzaro")
    return t

def agent_of(name):
    n = norm(name)
    if "andrea" in n and "azzarito" in n:
        return "andrea"
    return "umberto"

FILES = {
    "mazzetti": ("/app/data/ric/mazzetti.xlsx", "Mazzetti d'Altavilla",
                 [{"key":"natale","label":"Natale","start":"06-01","end":"12-31"}]),
    "bonfissuto": ("/app/data/ric/bonfissuto.xlsx", "Bonfissuto",
                 [{"key":"pasqua","label":"Pasqua","start":"01-01","end":"04-30"},
                  {"key":"natale","label":"Natale","start":"06-01","end":"12-31"}]),
}

# Explicit new clients from the prompt (recurrence-only, not flagged for review)
EXPLICIT_NEW = {
    (norm("CM Servizi Srl"), norm("Catanzaro")),
    (norm("F&D Srls di Dalia Muscò"), norm("Crotone")),
    (norm("Bar Palermo di Palermo Giuseppe"), norm("Lamezia Terme")),
}

defs = []
all_members = {}
for company,(path,label,periods) in FILES.items():
    wb = openpyxl.load_workbook(path, data_only=True)
    # Display order of groups = original sheet order (Catanzaro e limitrofi first).
    groups = [group_label(company, ws.title) for ws in wb.worksheets]
    members = []
    seen = set()
    # Assignment order: geographic sheets first, "Catanzaro e limitrofi" LAST so
    # clients in a specific geographic sheet land in that group; the master
    # "Catanzaro e limitrofi" sheet keeps only the remaining local clients.
    sheets = sorted(wb.worksheets, key=lambda w: 1 if norm(w.title) == "catanzaro e limitrofi" else 0)
    for ws in sheets:
        g = group_label(company, ws.title)
        for r in range(2, ws.max_row+1):
            rag = clean(ws.cell(row=r,column=2).value)
            if not rag:
                continue
            citta = clean(ws.cell(row=r,column=5).value)
            key = (norm(rag), norm(citta))
            if key in seen:
                continue
            seen.add(key)
            tel = clean(ws.cell(row=r,column=12).value) or clean(ws.cell(row=r,column=10).value)
            m = {
                "ragione_sociale": rag,
                "citta": citta,
                "provincia": clean(ws.cell(row=r,column=6).value),
                "indirizzo": clean(ws.cell(row=r,column=3).value),
                "cap": clean(ws.cell(row=r,column=4).value),
                "telefono": tel,
                "email": clean(ws.cell(row=r,column=15).value),
                "codice_azienda": clean(ws.cell(row=r,column=1).value),
                "partita_iva": clean(ws.cell(row=r,column=8).value),
                "codice_fiscale": clean(ws.cell(row=r,column=9).value),
                "agent": agent_of(ws.cell(row=r,column=21).value),
                "group": g,
                "explicit_new": key in EXPLICIT_NEW,
            }
            members.append(m)
    defs.append({"company":company,"label":label,"periods":periods,"groups":groups,"order":len(defs)})
    all_members[company] = members
    print(company, "groups:", groups, "members:", len(members))

out = "# AUTO-GENERATED from recurrence Excel files. Do not edit by hand.\n"
out += "RECURRENCE_DEFS = " + repr(defs) + "\n\n"
out += "RECURRENCE_MEMBERS = " + repr(all_members) + "\n"
with open("/app/backend/recurrence_seed.py","w") as f:
    f.write(out)
print("WROTE /app/backend/recurrence_seed.py")
