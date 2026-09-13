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

## Implemented (2026-09-13)
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
