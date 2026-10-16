"""Client per le API JSON di GooseApp (gestionale raccolta ordini).

Documentazione di riferimento:
  - SELECT:    https://api.gooseapp.com/select/
  - OPERATION: https://api.gooseapp.com/operation/
  - TABLES:    https://api.gooseapp.com/tables/
  - STRUCTURE: https://api.gooseapp.com/structure/

Ogni chiamata è un POST JSON che deve contenere SEMPRE `code` (Codice Azienda)
e `key` (Chiave API). Le chiamate sono accettate solo da IP in whitelist nel
Pannello Admin GooseApp: da IP non autorizzati si riceve l'errore #111.
Questo ambiente di anteprima NON è in whitelist, quindi le chiamate live
funzioneranno solo in produzione (Render) dopo aver abilitato gli IP.
"""
import os
import logging

import httpx

logger = logging.getLogger("agendavisite.goose")

GOOSE_BASE = os.environ.get("GOOSEAPP_BASE", "https://api.gooseapp.com").rstrip("/")
GOOSE_CODE = os.environ.get("GOOSEAPP_CODE", "").strip()
GOOSE_KEY = os.environ.get("GOOSEAPP_KEY", "").strip()

# Messaggi d'errore noti (per restituire testo utile all'interfaccia)
ERROR_HINTS = {
    111: ("IP non autorizzato o chiave non valida (#111). Aggiungi l'IP statico "
          "in uscita di Render alla whitelist in GooseApp → GESTISCI → API → IP di connessione."),
    120: "Tabella inesistente (#120): verifica il nome tabella in configurazione.",
}


class GooseError(Exception):
    def __init__(self, code, description, extra=None):
        self.code = code
        self.description = description
        if code == 111:
            ip = extra or "sconosciuto"
            msg = (f"Errore #111: IP non autorizzato per la richiesta proveniente da {ip}. "
                   f"Aggiungi questo IP alla whitelist in GooseApp → GESTISCI → API → IP di connessione.")
        else:
            hint = ERROR_HINTS.get(code)
            msg = hint or f"GooseApp error #{code}: {description}"
        super().__init__(msg)


def is_configured() -> bool:
    return bool(GOOSE_CODE and GOOSE_KEY)


async def _outbound_ip() -> str:
    """Rileva l'IP pubblico in uscita della richiesta (per diagnosticare il #111).
    Usa servizi di echo IP; se tutti falliscono ritorna 'sconosciuto'."""
    services = ("https://api.ipify.org", "https://ifconfig.me/ip", "https://checkip.amazonaws.com")
    for url in services:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url)
                ip = (resp.text or "").strip()
                if ip:
                    return ip
        except httpx.HTTPError:
            continue
    return "sconosciuto"


async def _call(service: str, payload: dict) -> dict:
    """Esegue un POST JSON verso un service GooseApp iniettando code+key."""
    if not is_configured():
        raise GooseError(0, "GooseApp non configurato: mancano GOOSEAPP_CODE / GOOSEAPP_KEY.")
    body = {"code": GOOSE_CODE, "key": GOOSE_KEY, **payload}
    url = f"{GOOSE_BASE}/{service}/"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=body)
    except httpx.HTTPError as e:
        logger.error("GooseApp network error su %s: %s", service, e)
        raise GooseError(-1, f"Errore di rete verso GooseApp: {e}")
    try:
        data = resp.json()
    except ValueError:
        raise GooseError(-2, f"Risposta non JSON da GooseApp (HTTP {resp.status_code}).")
    if data.get("status") == "OK":
        return data.get("result", {})
    err = data.get("error") or {}
    code = err.get("code")
    if code == 111:
        ip = await _outbound_ip()
        raise GooseError(111, err.get("description"), extra=ip)
    raise GooseError(code, err.get("description") or "Errore sconosciuto")


async def select(table: str, from_: str = None, fields: str = None, filter_: dict = None) -> list:
    """SELECT: restituisce la lista di record (result.data) di una tabella."""
    payload = {"table": table}
    if from_:
        payload["from"] = from_
    if fields:
        payload["fields"] = fields
    if filter_:
        payload["filter"] = filter_
    result = await _call("select", payload)
    return result.get("data", []) if isinstance(result, dict) else []


async def list_tables(with_structure: bool = False) -> dict:
    """TABLES: elenco delle tabelle disponibili."""
    payload = {}
    if with_structure:
        payload["structure"] = True
    return await _call("tables", payload)


async def get_structure(table: str) -> dict:
    """STRUCTURE: definizione dei campi di una tabella."""
    return await _call("structure", {"table": table})
