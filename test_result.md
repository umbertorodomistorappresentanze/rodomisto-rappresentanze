#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Iter 20 (2026-10-03) — Filtro periodo storico + Promemoria sospesi
- Backend: GET /api/activities nuovi param from_date/to_date (YYYY-MM-DD, giorno locale Rome); limit cap alzato a 2000. Nuovo GET /api/suspensions?scope= (overdue + due_soon entro 15gg, per-agente).
- Frontend: /storico filtro periodo (chip mesi ultimi 12 + "Personalizzato" con Da/A GG/MM/AAAA + Applica). Nuova schermata /sospesi. Dashboard: card alert sospesi (testID sospesi-alert). Link in Altro (menu-sospesi).
- needs_retesting: true. Credenziali: umberto/Umberto2774!, andrea/Andrea1606!.

## Iter 21 (2026-10-03) — Unisci/Elimina duplicati in Da Verificare + badge sospesi su tab
- Backend: GET /api/clients/da-verificare ora include campi partita_iva e duplicates[] (altri clienti attivi con stessa P.IVA normalizzata). Nuovo POST /api/clients/{id}/merge {target_id} (admin): riassegna eventi+ricorrenze a target, completa campi mancanti, azzera needs_review, soft-delete sorgente.
- Frontend: da-verificare mostra P.IVA + avviso "Stessa P.IVA di X" + pulsanti Unisci (testID verify-merge-<id>) ed Elimina (verify-delete-<id>) per admin, con conferma cross-platform. Tab "Oggi" ha tabBarBadge con conteggio sospesi (/suspensions). Card promemoria in home invariata.
- Dati preview: 9 gruppi duplicati (18 record) flaggati needs_review, 2 sospesi attivi (badge=2).
- needs_retesting: true.

## Iter 28 (2026-10-05) — Ricerca libera dashboard + Data attività + Sigla provincia
- #1 RICERCA LIBERA: Dashboard (app/(tabs)/index.tsx) ora mostra SEMPRE la barra di ricerca (testID giro-search), anche senza giro selezionato. Nuovo endpoint GET /api/clients/search?q= (cerca ragione_sociale O citta, filtro per agente se non admin, limit 60, arricchito con status/suspensions/last_order_at/last_collection_at). Si può cercare e aprire le azioni rapide su qualunque cliente.
- #2 DATA ATTIVITA': QuickActionsSheet (src/components/quick-actions-sheet.tsx) ha nuovo campo ActivityDateField (src/components/activity-date-field.tsx) in modalità order/collection/suspension/note. Default OGGI, chip rapidi (Oggi/Ieri/2gg/3gg, testID activity-date-0..3) + input GG/MM/AAAA su web (testID activity-date-input) / DateTimePicker su native. Backend EventCreate.activity_date (ISO o YYYY-MM-DD) → usato per created_at, due_at base (ordini) e last_visit_at (visite). Helper parse_activity_date (giorno locale Rome a mezzogiorno).
- #3 SIGLA PROVINCIA: backend normalize_provincia() forza sigla 2 lettere maiuscole (mappa nomi italiani→sigle); applicata in create_client, update_client, recurrence add. Frontend client/new.tsx e client/edit/[id].tsx: campo Provincia autoCapitalize characters + normalizzazione onEndEditing + su submit (src/utils/provincia.ts). Es: "Catanzaro"→CZ, "vibo valentia"→VV, "kr"→KR.
- Verificato backend via requests: search OK (38 risultati "bar", con status/suspensions), province (CZ/VV/KR/RC/CS/MI) OK, order con activity_date 5gg fa → created_at corretto. Frontend smoke: ricerca "bar" senza giro → 38 RISULTATI OK.
- Credenziali: umberto/Umberto2774!, andrea/Andrea1606!.
- needs_retesting: true.

## Iter 30 (2026-10-06) — Avviso sospesi su scheda cliente + Incasso dalla lista promemoria
- #1 BANNER SOSPESI: aprendo le azioni rapide di un cliente (QuickActionsSheet, da giro o da ricerca libera) compare in alto un banner giallo "Forniture in sospeso" con azienda + data scadenza ("scade/scaduta il GG/MM/AAAA" o "sospeso attivo"). Dati da nuovo GET /api/clients/{id}/pending-suspensions (TUTTI i sospesi non incassati del cliente, incluse scadenze future, kind overdue|pending).
- #2 INCASSO DA LISTA: in /sospesi ogni riga ha pulsante verde "Incassa" (testID sos-collect-<client_id>) -> modale con ActivityDateField "Data dell'incasso" (default oggi), chip modalità Contanti/Bonifico/Assegno (testID collect-method-contanti|bonifico|assegno); se Bonifico compare "Data del bonifico"; pulsante Conferma (testID collect-confirm). Registra evento collection e il sospeso sparisce (invalidate suspensions).
- Backend: EventCreate.collection_method (contanti|bonifico|assegno) + collection_ref_date; create_event type collection imposta created_at a FINE giornata (Roma) della data scelta così salda tutti i sospesi fino a quel giorno incluso. list_suspensions items ora includono company_id.
- Verificato via requests: pending-suspensions mostra ordine differito futuro (kind pending) + sospeso manuale (overdue); dopo collection contanti/bonifico il pending torna vuoto (saldato). Vale per umberto e andrea.
- needs_retesting: true.
