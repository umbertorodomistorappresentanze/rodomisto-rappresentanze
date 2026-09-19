# AgendaVisite — PRD

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
