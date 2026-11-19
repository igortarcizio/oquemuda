#!/usr/bin/env python3
"""Atualização incremental e retomável de fichas da Câmara no Supabase.

- Prioriza fichas ainda não enriquecidas e as que estão desatualizadas.
- Verifica dados individuais ANTES das listas (indisponibilidade não impede o próximo lote).
- A API da Câmara recebe no máximo três tentativas para falhas transitórias.
- Persistência por ficha: cada avanço permanece após falhas ou interrupções.
- Tramitações: só busca o histórico quando a Câmara registra movimentação nova
  (statusProposicao.sequencia maior que a gravada) e, enquanto a movimentação é recente,
  confere se a comissão publicou um substitutivo (texto novo que substitui o original).
- Listagens: lê as páginas mais recentes de cada tipo até achar uma página só com
  propostas já conhecidas (no máximo MAX_LIST_PAGES), então recupera sozinho depois de
  dias fora do ar. É o único robô que cria fichas novas (substitui sincronizar_supabase.py).
- Cada execução fica registrada em public.sync_runs (migration 20261119_sync_runs.sql).
- Apensação: quando a ficha oficial traz uriPropPrincipal, sobe a cadeia (até MAX_CADEIA)
  e guarda um resumo da proposta que conduz a tramitação (migration 20261119_apensadas.sql).
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
# Versões que substituem o texto original (siglaTipo em /proposicoes/{id}/relacionadas).
# SBT (sem -A) é só a proposta do relator e ainda não mudou nada: fica de fora.
TEXTO_ADOTADO = {
    "SBT-A": "Substitutivo aprovado na comissão",
    "RDF": "Redação final aprovada pela Câmara",
}
# O substitutivo costuma ser registrado dias depois da aprovação do parecer.
JANELA_TEXTO_DIAS = 21
MAX_TRAMITACOES = 200
TRAM_COLS = "tramitacoes_seq,tramitacoes_ultima,texto_atual"
MAX_LIST_PAGES = int(os.getenv("MAX_LIST_PAGES", "5"))
APENS_COLS = "apensada_a"
MAX_CADEIA = 5
RUNS = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/sync_runs"
STATS = {"tramitacoes": 0, "textos_novos": 0, "fichas_novas": 0}

def read_json(url, headers=None, timeout=9):
    request = urllib.request.Request(url, headers=headers or {"Accept": "application/json", "User-Agent": "OQueMuda/1.0 (sincronizacao publica)"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)

def write_json(url, payload, method):
    request = urllib.request.Request(
        url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), method=method,
        headers={**DB_HEADERS, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        raise RuntimeError("Supabase: falha na gravação (HTTP " + str(exc.code) + ")") from exc
    except (TimeoutError, urllib.error.URLError) as exc:
        raise RuntimeError("Supabase: falha de conexão na gravação (" + type(exc).__name__ + ")") from exc

def api(path):
    """Tenta novamente apenas falhas transitórias da Câmara, nunca escritas no banco."""
    for attempt in range(3):
        try:
            return read_json(CAMARA + path)
        except urllib.error.HTTPError as exc:
            if exc.code not in TRANSIENT:
                raise
            error = "HTTP " + str(exc.code)
        except (TimeoutError, urllib.error.URLError) as exc:
            error = type(exc).__name__
        if attempt < 2:
            delay = 2 * (attempt + 1)
            print("API da Câmara:", error, "- nova tentativa em", delay, "s", flush=True)
            time.sleep(delay)
        else:
            raise RuntimeError("API da Câmara indisponível após 3 tentativas (" + error + ")")

def patch(id, payload):
    write_json(DB + "?id=eq." + str(int(id)), payload, "PATCH")

def ensure_rows(rows):
    if rows:
        write_json(DB + "?on_conflict=id", rows, "POST")

def columns_available(cols, migration, what):
    """Colunas novas vêm de migrations; sem elas, o resto da sincronização segue igual."""
    try:
        read_json(DB + "?" + urllib.parse.urlencode({"select": "id," + cols, "limit": "1"}), DB_HEADERS)
        return True
    except urllib.error.HTTPError as exc:
        if exc.code in (400, 404):
            print(f"::notice::Colunas ausentes (aplique a migration {migration}); {what} não serão atualizados.", flush=True)
            return False
        raise


def tramitacoes_available():
    return columns_available(TRAM_COLS, "20261119_tramitacoes_versao_texto.sql", "linha do tempo e texto atual")


def apensacao_available():
    return columns_available(APENS_COLS, "20261119_apensadas.sql", "dados de apensação")


def principal_id(detail):
    match = re.search(r"/proposicoes/(\d+)$", (detail or {}).get("uriPropPrincipal") or "")
    return int(match.group(1)) if match else None


def principal_summary(d):
    stage = d.get("statusProposicao") or {}
    return {"id": int(d["id"]), "sigla": d.get("siglaTipo"), "numero": d.get("numero"), "ano": d.get("ano"),
            "ementa": (d.get("ementa") or "").strip()[:300], "situacao": stage.get("descricaoSituacao"),
            "codSituacao": stage.get("codSituacao"), "orgao": stage.get("siglaOrgao"), "dataHora": stage.get("dataHora")}


def apensacao_changes(id, detail, row, now):
    """A cadeia direta → raiz, com a situação atual da raiz (quem conduz a tramitação)."""
    current = principal_id(detail)
    if not current:
        # Desapensada: limpa o que estava gravado.
        return {"apensada_a": None, "apensada_raiz_id": None} if row.get("apensada_a") else {}
    chain, seen = [], {int(id)}
    while current and current not in seen and len(chain) < MAX_CADEIA:
        seen.add(current)
        d = api("/proposicoes/" + str(current)).get("dados") or {}
        if not d.get("id"):
            break
        chain.append(principal_summary(d))
        current = principal_id(d)
    if not chain:
        return {}
    return {"apensada_a": {"direta": chain[0], "raiz": chain[-1], "cadeia": [c["id"] for c in chain],
                           "consultado_em": now.isoformat()},
            "apensada_raiz_id": chain[-1]["id"]}


def camara_time(value):
    """A Câmara informa hora de Brasília sem fuso ("2026-11-17T14:15")."""
    if not value or not isinstance(value, str):
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", value):
        return value + ":00-03:00"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return value + "T00:00:00-03:00"
    return value


def compact_tramitacoes(rows):
    """Só o que a ficha mostra, em ordem cronológica, com links apenas para o site da Câmara."""
    out = []
    for t in rows or []:
        if not isinstance(t, dict):
            continue
        link = t.get("url") or ""
        out.append({
            "dataHora": t.get("dataHora"),
            "sequencia": t.get("sequencia"),
            "siglaOrgao": t.get("siglaOrgao"),
            "descricao": (t.get("descricaoTramitacao") or "").strip() or None,
            "codTipo": str(t.get("codTipoTramitacao")) if t.get("codTipoTramitacao") is not None else None,
            "despacho": (t.get("despacho") or "").strip()[:400] or None,
            "situacao": t.get("descricaoSituacao"),
            "url": link if link.startswith("https://www.camara.leg.br/") else None,
        })
    out.sort(key=lambda x: (x["dataHora"] or "", x["sequencia"] if isinstance(x["sequencia"], int) else 0))
    return out[-MAX_TRAMITACOES:]


def max_sequence(rows):
    seqs = [t["sequencia"] for t in rows if isinstance(t.get("sequencia"), int)]
    return max(seqs) if seqs else None


def needs_tramitacoes(row, stage):
    """Busca na primeira vez e sempre que a Câmara registrar movimentação nova."""
    stored = row.get("tramitacoes_seq")
    if stored is None:
        return True
    seq = stage.get("sequencia")
    return isinstance(seq, int) and seq > stored


def is_recent(timestamp, now, days=JANELA_TEXTO_DIAS):
    if not timestamp:
        return False
    try:
        moment = dt.datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
    except ValueError:
        return False
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=dt.timezone(dt.timedelta(hours=-3)))
    return (now - moment).total_seconds() <= days * 86400


def adopted_text(relacionadas):
    """Versão mais recente do texto que substitui o original, se houver."""
    found = [r for r in relacionadas or []
             if isinstance(r, dict) and r.get("id") and (r.get("siglaTipo") or "").upper() in TEXTO_ADOTADO]
    if not found:
        return None
    return max(found, key=lambda r: (r.get("dataApresentacao") or "", int(r["id"])))


def approval_date(tramitacoes, orgao, until):
    """Data em que a comissão aprovou o parecer (o substitutivo é registrado depois)."""
    best = None
    for t in tramitacoes:
        when = t.get("dataHora") or ""
        if until and when[:10] > until[:10]:
            continue
        if orgao and t.get("siglaOrgao") != orgao:
            continue
        if t.get("codTipo") == "336" or re.search(r"aprova[çc][ãa]o do parecer|aprovado o parecer",
                                                   (t.get("descricao") or "") + " " + (t.get("despacho") or ""), re.I):
            best = when
    return best


def tramitacao_changes(id, row, stage, now):
    """Colunas novas a gravar para esta ficha. Chamadas extras só quando algo mudou."""
    out = {}
    tram = None
    changed = needs_tramitacoes(row, stage)
    last = row.get("tramitacoes_ultima")
    if changed:
        tram = compact_tramitacoes(api("/proposicoes/" + str(id) + "/tramitacoes").get("dados"))
        if tram:
            out["tramitacoes"] = tram
            out["tramitacoes_seq"] = max_sequence(tram)
            last = camara_time(tram[-1].get("dataHora"))
            out["tramitacoes_ultima"] = last
    if not (changed or is_recent(last, now)):
        return out
    found = adopted_text(api("/proposicoes/" + str(id) + "/relacionadas").get("dados"))
    current = row.get("texto_atual") or {}
    if not found or str(found["id"]) == str(current.get("id")):
        return out
    detail = api("/proposicoes/" + str(found["id"])).get("dados") or {}
    link = detail.get("urlInteiroTeor") or ""
    if not link.startswith("https://www.camara.leg.br/"):
        print("Texto novo sem link do inteiro teor:", id, found["id"], flush=True)
        return out
    sigla = found["siglaTipo"].upper()
    orgao = (detail.get("statusProposicao") or {}).get("siglaOrgao")
    registered = found.get("dataApresentacao") or detail.get("dataApresentacao")
    if tram is None:
        tram = compact_tramitacoes(api("/proposicoes/" + str(id) + "/tramitacoes").get("dados"))
    approved = approval_date(tram, orgao, registered) if sigla == "SBT-A" else None
    out["texto_atual"] = {
        "id": int(found["id"]), "sigla": sigla, "descricao": TEXTO_ADOTADO[sigla],
        "data": ((approved or registered or "")[:10]) or None, "orgao": orgao, "url": link,
    }
    print("Texto novo:", id, sigla, out["texto_atual"]["data"], orgao, flush=True)
    return out


def pending_rows(extra_cols=""):
    q = urllib.parse.urlencode({
        "select": "id,situacao_atualizada_em,dados_oficiais" + extra_cols,
        "order": "situacao_atualizada_em.asc.nullsfirst",
        "limit": str(max(MAX_DETAILS * 2, 100))
    })
    return read_json(DB + "?" + q, DB_HEADERS)

def normalize_authors(rows):
    result = []
    for author in rows[:10]:
        uri = author.get("uri") or ""
        match = re.search(r"/deputados/(\d+)$", uri)
        result.append({
            "nome": author.get("nome") or author.get("tipo") or "Autoria institucional",
            "partido": author.get("siglaPartido"),
            "deputadoId": int(match.group(1)) if match else None,
        })
    return result

def enrich():
    with_tram = tramitacoes_available()
    with_apens = apensacao_available()
    extra = ("," + TRAM_COLS if with_tram else "") + ("," + APENS_COLS if with_apens else "")
    rows = pending_rows(extra)
    by_id = {int(p["id"]): p for p in rows}
    # Prioridades são lidas por ID, mesmo fora das primeiras páginas do catálogo.
    for id in PRIORITY_IDS:
        if id not in by_id:
            qs = urllib.parse.urlencode({"select": "id,situacao_atualizada_em,dados_oficiais" + extra, "id": "eq." + str(id), "limit": "1"})
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
    done = tram_done = texts_done = 0
    for row in selected:
        id = row["id"]
        try:
            detail = api("/proposicoes/" + str(id)).get("dados") or {}
            if not detail.get("id"):
                print("Sem ficha oficial:", id, flush=True)
                continue
            previous = row.get("dados_oficiais") or {}
            # Uma resposta incompleta não deve apagar a última situação válida.
            stage = detail.get("statusProposicao") or previous.get("statusProposicao") or {}
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
            changes = {"dados_oficiais": saved, "atualizado_em": stamp}
            if stage:
                changes["situacao_atualizada_em"] = stamp
            if stage.get("codSituacao") is not None:
                changes["situacao_codigo"] = stage["codSituacao"]
            if stage.get("descricaoSituacao"):
                changes["situacao_descricao"] = stage["descricaoSituacao"]
            if with_apens:
                try:
                    changes.update(apensacao_changes(id, detail, row, dt.datetime.now(dt.timezone.utc)))
                except RuntimeError:
                    raise
                except Exception as exc:
                    print("Apensação não atualizada:", id, str(exc)[:130], flush=True)
            if with_tram:
                try:
                    extra_changes = tramitacao_changes(id, row, stage, dt.datetime.now(dt.timezone.utc))
                    changes.update(extra_changes)
                    tram_done += "tramitacoes" in extra_changes
                    texts_done += "texto_atual" in extra_changes
                    STATS["tramitacoes"], STATS["textos_novos"] = tram_done, texts_done
                except RuntimeError:
                    raise
                except Exception as exc:
                    print("Tramitações não atualizadas:", id, str(exc)[:130], flush=True)
            patch(id, changes)
            done += 1
        except RuntimeError as exc:
            print("Enriquecimento interrompido após", done, "fichas:", exc, flush=True)
            return done, False
        except Exception as exc:
            print("Falha isolada na ficha", id, str(exc)[:160], flush=True)
        time.sleep(0.35)
    print("Fichas enriquecidas:", done, "de", len(selected), "| tramitações atualizadas:", tram_done,
          "| textos novos (substitutivo/redação final):", texts_done, flush=True)
    return done, True

def known_ids(ids):
    """Quais destes IDs já estão no banco (uma consulta por página de listagem)."""
    if not ids:
        return set()
    q = urllib.parse.urlencode({"select": "id", "id": "in.(" + ",".join(str(int(i)) for i in ids) + ")"})
    return {int(r["id"]) for r in read_json(DB + "?" + q, DB_HEADERS)}


def lists():
    year = dt.date.today().year
    count = 0
    for y in (year, year - 1):
        for kind in ("PL", "PLP", "PEC", "MPV", "PDL", "PRC"):
            for page in range(1, MAX_LIST_PAGES + 1):
                qs = urllib.parse.urlencode({
                    "ano": y, "siglaTipo": kind, "itens": 100,
                    "pagina": page, "ordenarPor": "id", "ordem": "DESC"})
                try:
                    data = api("/proposicoes?" + qs).get("dados") or []
                except RuntimeError as exc:
                    print("Listagens interrompidas:", exc, flush=True)
                    return count, False
                except Exception as exc:
                    print("Falha na listagem", kind, y, str(exc)[:130], flush=True)
                    break
                stamp = dt.datetime.now(dt.timezone.utc).isoformat()
                rows = [{
                    "id": p["id"], "sigla_tipo": p.get("siglaTipo", kind),
                    "numero": p.get("numero"), "ano": p.get("ano"),
                    "ementa": p.get("ementa", ""),
                    "data_apresentacao": (p.get("dataApresentacao") or "")[:10] or None,
                    "uri_oficial": CAMARA + "/proposicoes/" + str(p["id"]),
                    "coletado_em": stamp
                } for p in data if p.get("id")]
                try:
                    known = known_ids([r["id"] for r in rows])
                    ensure_rows(rows)
                    count += len(rows)
                    STATS["fichas_novas"] += len(rows) - len(known)
                except Exception as exc:
                    print("Falha na escrita da listagem", kind, y, str(exc)[:130], flush=True)
                    return count, False
                time.sleep(0.3)
                # Página inteira já conhecida (ou a última): nada novo mais para trás.
                if len(data) < 100 or len(known) == len(rows):
                    break
    print("Registros processados em listagens:", count, "| fichas novas:", STATS["fichas_novas"], flush=True)
    return count, True


def record_run(started, done, count, ok, error=None):
    """Registro em sync_runs. Sem a tabela (migration não aplicada), só avisa."""
    payload = {"robo": "sync_supabase", "iniciado_em": started, "terminado_em": dt.datetime.now(dt.timezone.utc).isoformat(),
               "ok": ok, "fichas": done, "listagens": count, "fichas_novas": STATS["fichas_novas"],
               "tramitacoes": STATS["tramitacoes"], "textos_novos": STATS["textos_novos"],
               "erro": (error or "")[:500] or None, "execucao_url": run_url()}
    request = urllib.request.Request(RUNS, data=json.dumps(payload).encode("utf-8"), method="POST",
                                     headers={**DB_HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            response.read()
    except Exception as exc:  # registro nunca derruba a sincronização
        print("::notice::Execução não registrada em sync_runs:", str(exc)[:120], flush=True)


def run_url():
    server, repo, run = os.getenv("GITHUB_SERVER_URL"), os.getenv("GITHUB_REPOSITORY"), os.getenv("GITHUB_RUN_ID")
    return f"{server}/{repo}/actions/runs/{run}" if server and repo and run else None


def main():
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    try:
        done, enriched_ok = enrich()
        count, lists_ok = lists() if enriched_ok else (0, False)
    except Exception as exc:
        record_run(started, 0, 0, False, type(exc).__name__ + ": " + str(exc))
        raise
    print("Resumo: fichas =", done, "listagens =", count, "fonte íntegra =", enriched_ok and lists_ok, flush=True)
    record_run(started, done, count, enriched_ok and lists_ok,
               None if enriched_ok and lists_ok else "Câmara ou banco indisponível em parte da execução (ver log)")
    # Indisponibilidade externa não apaga dados; alerta no Actions sem simular sucesso completo.
    if not enriched_ok or not lists_ok:
        sys.exit(2)

if __name__ == "__main__":
    main()
