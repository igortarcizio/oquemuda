#!/usr/bin/env python3
"""Indexa todas as propostas dos tipos cobertos dos anos recentes e atualiza fichas.

Fonte: https://dadosabertos.camara.leg.br/swagger/api.html (arquivos CSV).
Importa proposições, situação, órgão, último registro e autoria por CSV, em lotes.
Não inventa campos: quando uma informação não está no CSV, preserva dado anterior.
"""
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

BASE = "https://dadosabertos.camara.leg.br/arquivos"
DB = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/proposicoes"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Accept": "application/json"}
YEARS = [dt.date.today().year, dt.date.today().year - 1]
BATCH = 100
TYPES = {'PL','PLP','PEC','MPV','PDL','PRC'}

def get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)

def load_index():
    out = {}
    for offset in range(0, 150000, 1000):
        qs = urllib.parse.urlencode({"select": "id,ano,numero,sigla_tipo,ementa,data_apresentacao,dados_oficiais,situacao_codigo,situacao_descricao,situacao_atualizada_em", "limit": 1000, "offset": offset})
        rows = get_json(DB + "?" + qs)
        for row in rows:
            if row.get("ano") in YEARS: out[str(row["id"])] = row
        if len(rows) < 1000: break
    return out

def parse_csv(category, year):
    url = f"{BASE}/{category}/csv/{category}-{year}.csv"
    request = urllib.request.Request(url, headers={"User-Agent": "OQueMuda/1.0 (uso de dados abertos oficiais)", "Accept": "text/csv,*/*"})
    with urllib.request.urlopen(request, timeout=75) as response:
        raw = response.read()
    # Os CSV da Câmara são publicados com ponto e vírgula entre colunas.
    try: decoded = raw.decode("utf-8-sig")
    except UnicodeDecodeError: decoded = raw.decode("latin-1")
    first = decoded.splitlines()[0] if decoded else ""
    delimiter = ";" if first.count(";") >= first.count(",") else ","
    reader = csv.DictReader(io.StringIO(decoded), delimiter=delimiter)
    print("Arquivo", category, year, "bytes", len(raw), "colunas", reader.fieldnames[:12] if reader.fieldnames else [], flush=True)
    yield from reader

def value(row, *names):
    for key in names:
        val = row.get(key)
        if val is not None and str(val).strip() not in ("", "null", "None"):
            return str(val).strip()
    return None

def id_from(row, direct=(), uris=()):
    raw = value(row, *direct)
    if raw and raw.isdigit():return raw
    for field in uris:
        link = value(row, field) or ""
        match = re.search(r"/proposicoes/(\d+)", link)
        if match:return match.group(1)
    return None

def authors_csv(year, indexed):
    by_id = {}
    try:
        for row in parse_csv("proposicoesAutores", year):
            id = id_from(row, ("idProposicao",), ("uriProposicao",))
            if not id or id not in indexed:continue
            name = value(row, "nomeAutor", "nome")
            if not name:continue
            deputy = value(row, "idDeputadoAutor")
            who = {"nome": name,
                   "partido": value(row, "siglaPartidoAutor"),
                   "deputadoId": int(deputy) if deputy and deputy.isdigit() else None,
                   "ordem": value(row, "ordemAssinatura")}
            by_id.setdefault(id, []).append(who)
        for group in by_id.values():
            group.sort(key=lambda a: int(a["ordem"]) if a["ordem"] and a["ordem"].isdigit() else 99999)
            for item in group: item.pop("ordem", None)
        print("Autoria disponível para", len(by_id), "propostas", year, flush=True)
        return by_id, True
    except Exception as error:
        print("Arquivo de autoria indisponível para", year, str(error)[:180], flush=True)
        return {}, False

def proposal_csv(year, indexed):
    by_id = {}
    try:
        new_count = 0
        for row in parse_csv("proposicoes", year):
            id = id_from(row, ("id", "idProposicao"), ("uri", "uriProposicao"))
            kind = value(row, "siglaTipo")
            if not id or kind not in TYPES:continue
            if id not in indexed:
                number = value(row, "numero")
                ementa = value(row, "ementa")
                if not number or not number.isdigit() or not ementa:continue
                indexed[id] = {
                    "id":int(id), "ano":year, "numero":int(number),
                    "sigla_tipo":kind, "ementa":ementa,
                    "data_apresentacao":(value(row, "dataApresentacao") or "")[:10] or None,
                    "dados_oficiais":{}, "situacao_codigo":None,
                    "situacao_descricao":None, "situacao_atualizada_em":None,
                }
                new_count += 1
            stage = {
                "codSituacao": value(row, "ultimoStatus_idSituacao", "ultimoStatus_codSituacao", "statusProposicao_codSituacao"),
                "descricaoSituacao": value(row, "ultimoStatus_descricaoSituacao", "statusProposicao_descricaoSituacao"),
                "descricaoTramitacao": value(row, "ultimoStatus_descricaoTramitacao", "statusProposicao_descricaoTramitacao"),
                "siglaOrgao": value(row, "ultimoStatus_siglaOrgao", "statusProposicao_siglaOrgao"),
                "dataHora": value(row, "ultimoStatus_dataHora", "statusProposicao_dataHora"),
                "despacho": value(row, "ultimoStatus_despacho"),
            }
            stage = {k:v for k,v in stage.items() if v is not None}
            by_id[id] = {"stage": stage,
                         "urlInteiroTeor": value(row, "urlInteiroTeor")}
        print("Proposições dos tipos cobertos:", len(by_id), "ano:",year,"novas:",new_count, flush=True)
        return by_id, True
    except Exception as error:
        print("Arquivo de proposições indisponível para", year, str(error)[:180], flush=True)
        return {}, False

def write_batch(rows):
    if not rows:return
    data = json.dumps(rows, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(DB + "?on_conflict=id", data=data, method="POST",
        headers={**HEADERS, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"})
    try:
        with urllib.request.urlopen(request, timeout=45) as response: response.read()
    except urllib.error.HTTPError as error:
        print('Erro ao gravar lote:',error.code,error.read().decode('utf-8','replace')[:1500],flush=True)
        raise

def main():
    indexed = load_index()
    if not indexed:
        print("Índice vazio; não há fichas para complementar.",flush=True)
        return
    print("Propostas existentes nos anos cobertos:",len(indexed),flush=True)
    total = 0
    successes = 0
    stamp = dt.datetime.now(dt.timezone.utc).isoformat()
    for year in YEARS:
        proposals, proposals_ok = proposal_csv(year, indexed)
        authors, authors_ok = authors_csv(year, indexed)
        if not proposals_ok and not authors_ok:continue
        batches = []
        for id, original in indexed.items():
            if original["ano"] != year:continue
            proposal = proposals.get(id)
            new_authors = authors.get(id)
            if not proposal and new_authors is None:continue
            previous = original.get("dados_oficiais") or {}
            official = dict(previous)
            updates = {}
            if proposal and proposal["stage"]:
                stage = dict(previous.get("statusProposicao") or {})
                stage.update(proposal["stage"])
                official["statusProposicao"] = stage
                code = stage.get("codSituacao")
                if code and str(code).isdigit():updates["situacao_codigo"] = int(code)
                if stage.get("descricaoSituacao"):updates["situacao_descricao"] = stage["descricaoSituacao"]
                updates["situacao_atualizada_em"] = stamp
            if proposal and proposal.get("urlInteiroTeor"):
                official["urlInteiroTeor"] = proposal["urlInteiroTeor"]
            if new_authors is not None and authors_ok:
                official["autores"] = new_authors[:10]
                official["autoresConsultados"] = True
            if not updates and new_authors is None:continue
            # Mantém valores obrigatórios em UPSERT; não reduz a cobertura do índice.
            # PostgREST exige que TODOS os elementos do lote tenham o mesmo conjunto de chaves.
            payload = {k: original[k] for k in ("id", "ano", "numero", "sigla_tipo", "ementa")}
            for field in ("data_apresentacao", "situacao_codigo", "situacao_descricao", "situacao_atualizada_em"):
                payload[field] = original.get(field)
            payload.update(updates)
            payload.update({"dados_oficiais": official, "atualizado_em": stamp})
            batches.append(payload)
            if len(batches) >= BATCH:
                write_batch(batches)
                total += len(batches)
                batches.clear()
        if batches:
            write_batch(batches)
            total += len(batches)
        successes += 1
        print("Ano",year,"atualizado; total de fichas:",total,flush=True)
    print("Total de fichas gravadas via arquivos oficiais:",total,flush=True)
    if successes == 0:
        print("Nenhum arquivo oficial acessível neste ciclo.",flush=True)
        sys.exit(2)

if __name__ == "__main__":
    main()
