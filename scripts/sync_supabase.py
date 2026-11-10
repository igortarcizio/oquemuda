#!/usr/bin/env python3
"""Atualização incremental e retomável de fichas da Câmara no Supabase.

- Prioriza fichas ainda não enriquecidas e as que estão desatualizadas.
- Verifica dados individuais ANTES das listas (indisponibilidade não impede o próximo lote).
- Um erro 503/429 interrompe o lote sem bombardear a fonte pública.
- Persistência por ficha: cada avanço permanece após falhas ou interrupções.
"""
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

CAMARA = "https://dadosabertos.camara.leg.br/api/v2"
DB = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/proposicoes"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
DB_HEADERS = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Accept": "application/json"}
MAX_DETAILS = int(os.getenv("MAX_DETAILS", "35"))
PRIORITY_IDS = [2649558, 2650489]  # PL 5702/2026 e PL 5751/2026
TRANSIENT = {429, 500, 502, 503, 504}

def read_json(url, headers=None, timeout=9):
    request = urllib.request.Request(url, headers=headers or {"Accept": "application/json", "User-Agent": "OQueMuda/1.0 (sincronizacao publica)"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        if exc.code in TRANSIENT:
            raise RuntimeError("Fonte indisponível: HTTP " + str(exc.code)) from exc
        raise

def write_json(url, payload, method):
    request = urllib.request.Request(
        url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), method=method,
        headers={**DB_HEADERS, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(request, timeout=15) as response:
        response.read()

def api(path):
    return read_json(CAMARA + path)

def patch(id, payload):
    write_json(DB + "?id=eq." + str(int(id)), payload, "PATCH")

def ensure_rows(rows):
    if rows:
        write_json(DB + "?on_conflict=id", rows, "POST")

def pending_rows():
    q = urllib.parse.urlencode({
        "select": "id,situacao_atualizada_em,dados_oficiais",
        "order": "situacao_atualizada_em.asc.nullsfirst",
        "limit": str(max(MAX_DETAILS * 2, 100))
    })
    return read_json(DB + "?" + q, DB_HEADERS)

def normalize_authors(rows):
    result = []
    for author in rows[:10]:
        uri = author.get("uri") or ""
        match = re.search(r"/deputados/(\\d+)$", uri)
        result.append({
            "nome": author.get("nome") or author.get("tipo") or "Autoria institucional",
            "partido": author.get("siglaPartido"),
            "deputadoId": int(match.group(1)) if match else None,
        })
    return result

def enrich():
    rows = pending_rows()
    by_id = {int(p["id"]): p for p in rows}
    # Prioridades são lidas por ID, mesmo fora das primeiras páginas do catálogo.
    for id in PRIORITY_IDS:
        if id not in by_id:
            qs = urllib.parse.urlencode({"select": "id,situacao_atualizada_em,dados_oficiais", "id": "eq." + str(id), "limit": "1"})
            candidate = read_json(DB + "?" + qs, DB_HEADERS)
            if candidate:
                by_id[id] = candidate[0]
    current = dt.datetime.now(dt.timezone.utc)
    def is_stale(row):
        timestamp = row.get("situacao_atualizada_em")
        if not timestamp: return True
        try: return (current - dt.datetime.fromisoformat(timestamp.replace("Z", "+00:00"))).total_seconds() > 24*3600
        except (ValueError, TypeError): return True
    prioritized = [by_id[x] for x in PRIORITY_IDS if x in by_id and is_stale(by_id[x])]
    others = [x for x in rows if x["id"] not in PRIORITY_IDS]
    selected = (prioritized + others)[:MAX_DETAILS]
    done = 0
    for row in selected:
        id = row["id"]
        try:
            detail = api("/proposicoes/" + str(id)).get("dados") or {}
            if not detail.get("id"):
                print("Sem ficha oficial:", id, flush=True)
                continue
            stage = detail.get("statusProposicao") or {}
            previous = row.get("dados_oficiais") or {}
            try:
                authors = normalize_authors(api("/proposicoes/" + str(id) + "/autores").get("dados") or [])
                authors_checked = True
            except RuntimeError:
                raise
            except Exception as exc:
                print("Autoria não atualizada:", id, str(exc)[:130], flush=True)
                authors = previous.get("autores")
                authors_checked = previous.get("autoresConsultados") is True
            saved = dict(previous)
            saved.update({
                "statusProposicao": stage,
                "urlInteiroTeor": detail.get("urlInteiroTeor"),
                "autores": authors,
                "autoresConsultados": authors_checked,
            })
            stamp = dt.datetime.now(dt.timezone.utc).isoformat()
            patch(id, {
                "situacao_codigo": stage.get("codSituacao"),
                "situacao_descricao": stage.get("descricaoSituacao"),
                "situacao_atualizada_em": stamp,
                "dados_oficiais": saved,
                "atualizado_em": stamp,
            })
            done += 1
        except RuntimeError as exc:
            print("Enriquecimento interrompido após", done, "fichas:", exc, flush=True)
            return done, False
        except Exception as exc:
            print("Falha isolada na ficha", id, str(exc)[:160], flush=True)
        time.sleep(0.35)
    print("Fichas enriquecidas:", done, "de", len(selected), flush=True)
    return done, True

def lists():
    year = dt.date.today().year
    count = 0
    for y in (year, year - 1):
        for kind in ("PL", "PLP", "PEC", "MPV", "PDL", "PRC"):
            qs = urllib.parse.urlencode({
                "ano": y, "siglaTipo": kind, "itens": 100,
                "pagina": 1, "ordenarPor": "id", "ordem": "DESC"})
            try:
                data = api("/proposicoes?" + qs).get("dados") or []
            except RuntimeError as exc:
                print("Listagens interrompidas:", exc, flush=True)
                return count, False
            except Exception as exc:
                print("Falha na listagem", kind, y, str(exc)[:130], flush=True)
                continue
            stamp = dt.datetime.now(dt.timezone.utc).isoformat()
            rows = [{
                "id": p["id"], "sigla_tipo": p.get("siglaTipo", kind),
                "numero": p.get("numero"), "ano": p.get("ano"),
                "ementa": p.get("ementa", ""),
                "data_apresentacao": (p.get("dataApresentacao") or "")[:10] or None,
                "uri_oficial": p.get("uri"),
                "coletado_em": stamp
            } for p in data if p.get("id")]
            try:
                ensure_rows(rows)
                count += len(rows)
            except Exception as exc:
                print("Falha na escrita da listagem", kind, y, str(exc)[:130], flush=True)
                return count, False
            time.sleep(0.3)
    print("Registros processados em listagens:", count, flush=True)
    return count, True

def main():
    done, enriched_ok = enrich()
    count, lists_ok = lists() if enriched_ok else (0, False)
    print("Resumo: fichas =", done, "listagens =", count, "fonte íntegra =", enriched_ok and lists_ok, flush=True)
    # Indisponibilidade externa não apaga dados; alerta no Actions sem simular sucesso completo.
    if not enriched_ok or not lists_ok:
        sys.exit(2)

if __name__ == "__main__":
    main()
