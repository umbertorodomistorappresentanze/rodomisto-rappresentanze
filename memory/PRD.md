# AgendaVisite — PRD

## Iter 11 (2026-09-28) — Login username OR email + log credenziali (debug Render 401)
- Login (`POST /api/auth/login`) ora cerca l'utente con `$or` su `username` ED `email` (case-insensitive, strip). Sia 'umberto' sia l'email accedono. Token subject resta user["username"].
- Aggiunti log a livello INFO all'avvio (seed) che stampano le combinazioni identificativo/password/ruolo attive → visibili nei log del server (utile per debug su Render). Aggiunti anche log su login fallito (utente non trovato / password errata).
- La verifica password resta bcrypt (NON indebolita). Il fix del 401 si basa su: seed idempotente che ripara la password + accettazione email/username + log diagnostici.
- Combinazioni attive: `umberto`/`Umberto2774!` (admin), `umbertorodomistorappresentanze@gmail.com`/`2774_aprI` (admin), `andrea`/`Andrea1606!` (agent).
- Verificato via curl (username 200, email 200, password errata 401, log stampati).

## Iter 10 (2026-09-27) — Fix 401 login / seed admin via email (Render)
- Root cause 401 su Render: l'admin veniva creato solo come username "umberto"/"andrea"; il login via email falliva. Inoltre il seed leggeva `os.environ["SEED_*"]` (KeyError se assenti su Render).
- Fix (server.py seed()): aggiunto utente admin con login via EMAIL `umbertorodomistorappresentanze@gmail.com` / password `2774_aprI` (override env `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`). Email normalizzata lowercase (login già fa strip+lower). Seed reso robusto con default per SEED_UMBERTO/ANDREA (no crash). Repair idempotente: all'avvio ripristina la password se non combacia e forza role=admin, is_active. Salvato hash bcrypt $2b$12$.
- Verificato via curl: login email OK (anche con maiuscole/spazi), umberto invariato, password errata → 401, record DB corretto. Consultato integration_expert (auth) prima della modifica.
- Nota deploy: su Render serve redeploy col codice aggiornato; il seed ripara/crea l'admin all'avvio.

## Iter 9 (2026-09-27) — Ultima azione (dettaglio + incassi), storico per giorno, recupero 3 Erre
- Task1 "Ultima azione" nel dettaglio cliente (/client/[id]): card "ULTIMA AZIONE" (testID last-action-card) derivata dallo storico eventi, mostra una sola dicitura. Helper condiviso `frontend/src/utils/last-action.ts` (usato anche da ClientRow).
- Task2 Incassi nell'ultima azione: backend `/api/clients` ora espone `last_order_at` E `last_collection_at` (helper generalizzato `_last_events_for`). ClientRow e dettaglio scelgono la più recente tra ordine/incasso/visita → "Ordine effettuato il" / "Incassato il" / "Ultima visita il" / "Mai visitato".
- Task3 Storico (/storico) raggruppato per giorno con SectionList: header "Oggi"/"Ieri"/data estesa. Helper format.ts: `dayGroupLabel`, `dayKey`. Filtri tipo/utente invariati.
- Task4 Recupero dati: inseriti nel DB Preview i 7 eventi del cliente "3 erre Srl" (client_id 8231a742-...) dal backup di produzione (/app/prod_import/events.json): 1 visit, 3 order Librandi (14/09 e 20/09), 1 collection (14/09), 1 note "TEST_NOTE". Skip-se-esistente per id. NB: la nota "TEST_NOTE" è dato di test presente nel backup prod.
- Verificato: 4/4 test backend (tests/test_iter9_...) + flussi web (testing_agent iter9). Nessuna modifica a permessi/altri dati/logiche esistenti.

## Iter 8 (2026-09-27) — Ultima azione clienti, fix rimozione ricorrenze, dashboard aggiornamenti
- Task1 "Ultima azione" lista clienti del giro: backend `/api/clients` ora espone `last_order_at` (helper `_last_orders_for`) oltre a `last_visit_at`. ClientRow mostra UNA dicitura tra: "Ordine effettuato il GG/MM/AAAA" / "Ultima visita il GG/MM/AAAA" / "Mai visitato" (persistente, indipendente dal ciclo 21 giorni). File: server.py, frontend/src/components/client-row.tsx, format.ts (dmyDate).
- Task2 Fix rimozione cliente dalle ricorrenze: la conferma usava Alert.alert (non funzionante su web/PWA) → creato helper cross-platform `frontend/src/utils/confirm.ts` (web → window.confirm, native → Alert). Endpoint DELETE /api/recurrences/{company}/members/{member_id} già corretto. File: ricorrenza/[company].tsx.
- Task3 Dashboard "Ultimi aggiornamenti": anteprima limitata a 3 (era 6); aggiunta scritta "Ultimo accesso: <data e ora>" (salvata client-side in AsyncStorage per-utente, mostra accesso precedente; primo accesso → "Primo accesso"); riquadro espandibile ("Apri storico completo" + titolo cliccabili → /storico). File: updates-panel.tsx, format.ts (dateTimeShort).
- Verificato: 4/4 test backend (tests/test_iter8_...) + flussi web (testing_agent iter8). Nessuna modifica a DB/dati/permessi/logiche esistenti.

## Web full-stack (2026-09-27)
- App confermata come web full-stack (Expo React Native Web). Dipendenze già presenti: react-dom 19.2.3, react-native-web 0.21.2, @expo/metro-runtime 57.0.15.
- app.json già con `web.bundler = metro`, `output: single`, manifest PWA (nome "Rodomisto Rappresentanze", it, standalone, themeColor #047857).
- Aggiunto script build web in frontend/package.json: `"build": "npx expo export -p web"`. Build verificata → genera `/app/frontend/dist` (index.html + _expo bundle + assets).
- Serving: in ambiente Emergent il frontend è servito da Metro (preview) e dal deploy della piattaforma (Publish); il backend FastAPI serve solo /api/*. NON è stato aggiunto static-serving del dist nel backend perché l'ingress instrada `/` al frontend e `/api/*` a FastAPI (lo static in FastAPI non verrebbe raggiunto). Tutti i dati (clients/events/giri/ricorrenze/sospesi) restano invariati e accessibili da browser.


## Implemented (2026-09-26) — Ultimi aggiornamenti, Storico, Gestiti, dicitura ricorrenze
- HOME "ULTIMI AGGIORNAMENTI": nuovo riquadro (src/components/updates-panel.tsx) con le ultime attività (solo order/collection/suspension/reschedule), data leggibile senza orario ("Sab 26/09"). Filtro Tutti/Umberto/Andrea mostrato solo all'admin; agent vede sempre e solo le proprie (enforced backend). Link "Vedi tutti" → /storico.
- HOME "ULTIMO AGGIORNAMENTO": card con data estesa ("Giovedì 24 settembre 2026") + ultima attività; per admin sempre scope=all (proprie + Andrea), per agent solo le proprie.
- STORICO (/app/frontend/app/storico.tsx): elenco cronologico con filtro tipo (Tutte/Ordini/Incassi/Sospesi/Visite rimandate) e filtro utente (solo admin).
- GIRI "Gestiti": il numero "Gestiti" del riepilogo giro in home è cliccabile → /gestiti/[id] che mostra SOLO le ragioni sociali dei clienti già gestiti in quel giro. Nessuna modifica a ordine/assegnazioni/logica visite.
- RICORRENZE: rinominata solo la dicitura chip "Effettuati" → "Gestiti" (funzione invariata).
- Backend: unico endpoint read-only GET /api/activities?scope=&type=&limit= (join clienti+giri; context = azienda per order/collection/suspension, giro per reschedule). Permessi: admin per scope, agent forzato ai propri. Nessuna modifica a logiche esistenti.
- Verificato: 13/13 test backend dedicati (tests/test_activities_feed.py) + flussi frontend (testing_agent). 2 fallimenti pytest pre-esistenti su dati storici NON causati da queste modifiche.

## Problem statement
Agenda digitale semplice e veloce per le visite commerciali quotidiane di 2 agenti (Umberto Rodomisto, Andrea Azzarito). NON è un CRM e NON gestisce dettagli/importi degli ordini. Registra: visite, ordini per azienda (solo azienda), incassi, rinvii, note. Ottimizzata per smartphone, pulsanti grandi, minimo numero di tocchi.

## Users / roles
- **umberto** (admin): gestisce clienti, anagrafica, giri, ordine clienti nei giri, aziende, configurazione. Vede i propri clienti (~549).
- **andrea** (agent): vede/gestisce solo i propri clienti (~84). Nessuna tab "Giri" né "Gestisci aziende".

## Architecture
- Backend: FastAPI + MongoDB (motor), JWT bearer auth (bcrypt), routes under `/api`. Seeding idempotente all'avvio: 2 utenti con ruolo, 16 aziende, 7 giri, import clienti da Excel.
- Frontend: Expo Router + React Query + @gorhom/bottom-sheet + react-native-draggable-flatlist + phosphor icons. Tema chiaro, accento verde (src/theme.ts). Font Plus Jakarta Sans.

## Data model
- users {id, username, display_name, role, hashed_password, is_active}
- giri {id, name, localities[], order, active}
- companies {id, name, active, order}
- clients {id, ragione_sociale, provincia, giro_id, position, citta, zona, indirizzo, cap, telefono, email, agent, permanent_note, last_visit_at, snoozed_until, extra{}, deleted_at}
- events {id, client_id, type(visit|order|reschedule|collection|note), company_id/name, note_text, reschedule_until, agent, created_at}

## Core logic
- DA VISITARE = mai visitato o >=21 giorni dall'ultima visita completata, e non gestito oggi, e non rinviato a data futura. Altrimenti GIÀ VISITATI/GESTITI.
- VISITATO aggiorna last_visit_at (anche senza ordine). VISITA RIMANDATA non tocca last_visit_at (setta snoozed_until 3/7/15/30 gg o data). Ordine registra solo azienda. Più ordini/giorno consentiti.

## Implemented (2026-09-24) — Ricorrenze, Da Verificare, ordine giri, pagamento
- RICORRENZE: nel gruppo bonfissuto "Catanzaro verso Lamezia Terme" rimosso Excalibur e aggiunto Eurodrink (solo ricorrenza; anagrafica/giri/altre ricorrenze invariati). Barra di ricerca (nome/comune, realtime, "Nessun cliente trovato", clear) in ricorrenza/[company].tsx. Azione "Rimuovi dalla ricorrenza" con Alert di conferma (DELETE member; permesso admin o agente proprietario).
- DA VERIFICARE: endpoint /clients/da-verificare ora ritorna clienti con giro_id None OPPURE extra.needs_review True (admin vede tutti gli agenti). Schermata con più info (comune, indirizzo, zona, agente) + modal verify-assign/[id] (scelta tra i 7 giri, "Conferma e assegna" append in fondo + azzera needs_review, oppure "Lascia da verificare").
- GIRI TERRITORIALI: nuovo ordine di visualizzazione (Catanzaro e Limitrofi, Guardavalle, Lamezia→Vibo, Vibo→Ricadi, Altilia, Crotone, Sila Piccola) via campo order nel DB. Ricerca cliente nel giro già presente (Dashboard).
- PAGAMENTO: nuova modalità "Rifatturazione Pac" (days=None → nessuna scadenza/promemoria/sospeso). Altre modalità invariate.
- Verificato: testing_agent 12/12 nuovi flussi + suite completa 103 test verdi. Test obsoleti aggiornati.

## Implemented (2026-09-21) — PWA responsive + web
- app.json web: display "standalone", themeColor #047857, backgroundColor #FFFFFF, name/shortName "Rodomisto Rappresentanze"/"Rodomisto", lang it, description → manifest PWA + add-to-home + fullscreen standalone (attivi nell'export web/deploy).
- `document.title` = "Rodomisto Rappresentanze" (titolo scheda browser) via effect web in _layout.
- Nuovo `src/components/web-frame.tsx`: su web e viewport > 768px (iPad landscape/desktop) centra l'app in colonna maxWidth 820px con bordi laterali; su mobile/native passthrough (nessuna modifica). Applicato attorno allo Stack in _layout.
- Endpoint /health e /api/health (200) per la sonda di deployment.
- Nessuna modifica a backend/logica/DB/API. Deploy: da pulsante Publish → Deploy (stesso backend/DB).

## Implemented (2026-09-21) — Ricerca cliente nel giro
- Campo "🔎 Cerca cliente" in cima alla lista del giro (Dashboard), visibile quando un giro è attivo. Filtro dinamico lato client per **ragione sociale** o **comune** (case/accento-insensibile).
- Durante la ricerca: sezione unica "RISULTATI" con i corrispondenti; se vuoto → "Nessun cliente trovato". Cancellando il testo (X) si ripristina la lista completa con ordine e sezioni originali (Da visitare / Gestiti + riepilogo).
- Le azioni rapide (Sospeso, Ordine, Incassato, Rimandata, Nota) e l'indicatore 🔴 restano disponibili sui risultati (stessa ClientRow). Nessuna modifica a ordine/posizioni/giri/logica visite. Funziona su mobile e web.

## Import (2026-09-20) — "clienti menu.xlsx"
- Import anagrafica da file (141 righe → 121 unici, 20 duplicati interni ignorati). Dedup per Partita IVA/CF/ragione sociale.
- 97 già presenti (match per P.IVA) → invariati. 22 nuovi creati e assegnati al giro via Descrizione Zona (Catanzaro e Limitrofi 8, Altilia 6, Guardavalle 4, Crotone 3, Sila Piccola 1), aggiunti IN FONDO al giro (ordine esistente invariato, verificato 0 modifiche alle posizioni). 2 "da verificare" (zona MONTEPAONE LIDO) creati senza giro.
- 0 duplicati introdotti. Giri/ricorrenze/sospesi/storico invariati. Nota: restano 13 P.IVA duplicate PRE-ESISTENTI (seed originale + import ricorrenze, es. La conca d'oro), non toccate da questo import.

## Implemented (2026-09-20) — iterazione 7 (SOSPESI nei giri territoriali)
- **Indicatore 🔴 SOSPESO** nella lista del giro: accanto al cliente compaiono i nomi delle aziende con sospeso attivo (es. "Librandi · Pellegrini"), senza importi/fatture. Calcolo dinamico dagli eventi (nessuna collezione contabile separata).
- **Azioni rapide** dal giro (bottom sheet), senza aprire l'anagrafica. Modifiche pulsanti:
  - RIMOSSO "Visitato".
  - **Ordine effettuato** = scegli azienda (da portafoglio agente) + **modalità di pagamento solo per quell'ordine** (non tocca l'anagrafica). Modalità: Anticipato, Contrassegno, Bonifico 30/60, Agente 30/60/90.
  - **+ Sospeso** = scegli azienda → sospeso manuale attivo subito (non segna il cliente come "gestito oggi").
  - **Incassato** = scegli azienda → chiude il sospeso di quell'azienda (le altre restano).
  - Visita rimandata e Nota invariati.
- **Scadenze automatiche**: Anticipato/Contrassegno → nessun sospeso. Differiti → due_at = data ordine + 30/60/90 gg; nessun sospeso prima della scadenza; alla scadenza, se non incassato, il cliente mostra 🔴 azienda automaticamente. Incasso prima della scadenza → nessun sospeso.
- Backend: PAYMENT_MODES, GET /api/payment-modes, event types `order`(+payment_mode,+due_at), `collection`(richiede azienda), `suspension`(manuale). `_active_suspensions_for` calcola i sospesi attivi; esposti in GET /api/clients e /api/clients/{id} come `suspensions[]`. Storico cliente mostra ordini (con modalità/scadenza) e sospesi.
- Invariati: giri territoriali, ordine clienti, assegnazione Umberto/Andrea, ricorrenze, dati esistenti. Permessi rispettati (andrea solo propri clienti).
- Verificato: 14/14 test dedicati + 75/76 suite (test obsoleto aggiornato) → tutto verde; UI verificata (🔴 compare/scompare, ordine a 2 passi).

## Implemented (2026-09-19) — iterazione 6 (RICORRENZE + WEB)
- **Versione WEB**: la stessa app Expo è accessibile da browser desktop (React Native Web) sullo stesso backend/DB → dati sincronizzati in tempo reale tra telefono e web. Nessun DB separato.
- **Nuova sezione RICORRENZE** (tab dedicata, sia admin sia agente), completamente separata dai giri territoriali:
  - Aziende: **Mazzetti d'Altavilla** (solo Natale) e **Bonfissuto** (Pasqua + Natale). Struttura flessibile per aggiungere aziende/periodi futuri (collezioni `recurrence_defs`, `recurrence_members`).
  - Import dai due Excel: match con anagrafica esistente per ragione sociale + città (44/51 Mazzetti, 16/17 Bonfissuto collegati SENZA duplicare e SENZA toccare giro/posizione). Non abbinati (8) creati come clienti **solo ricorrenza** (giro_id=None, extra.recurrence_only), i 4 dubbi con extra.needs_review.
  - Gruppi geografici presi dai fogli Excel; il foglio "Catanzaro e limitrofi" (elenco completo in Bonfissuto) processato per ultimo così i clienti finiscono nel gruppo geografico specifico.
  - **Nessuna logica 21 giorni**: unico comando **ORDINE EFFETTUATO** (event type `recurrence_order` con company+period). Reversibile (undo). Azzeramento automatico per anno solare (ricorrenza annuale). Stato per (azienda, periodo) indipendente.
  - Filtri "Da gestire" / "Effettuati" per gruppo; aggiunta manuale cliente (esistente via ricerca o nuovo) con scelta gruppo e agente (admin); membership senza duplicati.
  - Permessi: agente vede/gestisce solo i propri clienti (403 sugli altri).
  - Backend endpoints: GET /api/recurrences, GET /api/recurrences/{company}/members?period=, POST .../order, POST .../order/undo, POST .../members, DELETE .../members/{id}.
  - Verificato: 62/62 test backend, flussi frontend, indipendenza aziende/periodi, giri territoriali e anagrafica invariati.

## Implemented (2026-09-15) — iterazione 5
- **Fix visualizzazione lista località nei Giri su iOS**: `DraggableFlatList` ora usa `containerStyle={{flex:1}}` invece di `style`, così l'elenco delle località si mostra correttamente anche su iPhone (Expo Go), non solo su web.
- **Cambio password utenti**: umberto → `Umberto2774!`, andrea → `Andrea1606!`. Seed reso idempotente: reimposta l'hash solo se la password configurata in `.env` non verifica più (pattern da playbook auth). Ruoli/permessi/dati invariati.
- **Logo aziendale nella login**: rimosso il badge testuale "Agenda Visite", inserito il logo "Umberto Rodomisto Rappresentanze" (`assets/images/logo.webp`) sopra i campi Login/Password, proporzionato ed elegante. Nessun'altra modifica al layout/funzionamento. **[ANNULLATO il 2026-09-15 su richiesta utente: logo rimosso, schermata login ripristinata alla versione originale con badge "Agenda Visite". Le password NON sono state toccate dal rollback.]**


- **Gestione manuale ordine località** in ogni giro: elenco numerato nell'ordine attuale, riordino con **drag & drop** e in più con **frecce su/giù** (affidabile su ogni dispositivo), salvataggio esplicito che persiste e viene usato dalla Dashboard.
- **Aggiungi località con scelta posizione**: campo "Pos." accanto al nome (vuoto = in fondo, oppure numero della posizione desiderata); nessun posizionamento automatico. "AGGIUNGI LOCALITÀ +" sempre visibile (fisso in alto) anche con molte località.
- Nessuna modifica automatica dei percorsi: ordine, suddivisione giri e località restano invariati salvo modifica manuale.

## Implemented (2026-09-14) — iterazione 3
- **Scheda cliente completa**: card "Contatti rapidi" con numeri Fisso e Cellulare distinti, pulsanti **CHIAMA** (tel:) e **WHATSAPP** (wa.me, solo se presente un cellulare).
- **Modifica anagrafica** ed **Elimina cliente** (admin) direttamente dalla scheda; eliminazione con **modale di conferma** (soft-delete, esce dai giri/anagrafica senza perdere lo storico).
- **Cambio agente** dalla modifica scheda (admin): trasferisce il cliente ai giri dell'agente corretto senza duplicati, mantenendo giro/posizione.
- Backend: `DELETE /api/clients/{id}` (admin, soft-delete). 47/47 test backend verdi.

## Implemented (2026-09-13) — iterazione 2
- **Dashboard a due sezioni**: card "Anagrafica Clienti" e "Statistiche / Esportazione" + sezione "GIRO VISITE CLIENTI" (flusso giro invariato).
- **Anagrafica Clienti** (`/anagrafica`): elenco di tutti i clienti (admin) o dei propri (agente), ricerca per ragione sociale, apertura scheda, modifica anagrafica completa (`/client/edit/[id]`), inserimento nuovi clienti, assegnazione/modifica agente (Umberto/Andrea, solo admin), provincia/giro/posizione.
- **Fix bug GIRI**: "Aggiungi località +" ora in sezione fissa in alto, sempre visibile anche con molte località; lista località con scroll interno.
- **Statistiche / Esportazione** (`/statistiche`): selezione giro + anno, anteprima a schermo del riepilogo mensile per cliente (visita / ordine con azienda / incasso), download Excel (celle ordine con nome azienda).
- Backend: nuovi endpoint `/api/clients/all` (ricerca), `/api/stats/monthly`; campo `agent` su create/update cliente (solo admin); export mensile con nome azienda negli ordini.
- Verificato: 35/35 test backend, fix bug confermato dal testing agent, 633 clienti attivi, giri e ordine invariati.

## Implemented (2026-09-13) — iterazione 1
- Login password per utente + ruoli admin/agent (403 su mutazioni giri/aziende per agent).
- Dashboard: data odierna + selettore giro grande; lista clienti divisa DA VISITARE / GESTITI nell'ordine del giro; azioni rapide via bottom sheet (Visitato, Ordine, Incassato, Rimandata, Nota).
- Storico cliente, nota permanente, assegnazione giro; sezione Da Verificare; nuovo cliente.
- Gestione giri con drag&drop ordine località (admin); gestione aziende attiva/disattiva (admin).
- Export Excel riepilogo mensile per giro.
- Config definitiva giri applicata: Francavilla Angitola in Altilia; Rombiolo+Nicotera in Lamezia→Vibo; Vibo Valentia rimossa da Ricadi; Joppolo solo in Lamezia→Vibo. 10 clienti eliminati (soft/skip), 36 clienti zona "Vibo Valentia" assegnati definitivamente, Tenuta Klopè in Altilia/Francavilla Angitola. 633 clienti attivi, 10 in Da Verificare, 0 duplicati.

## Backlog (P1/P2)
- Reset password / cambio password self-service.
- Filtro/ricerca cliente nel giro.
- Riepilogo/export multi-giro.
