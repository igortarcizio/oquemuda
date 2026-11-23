#!/usr/bin/env python3
"""Andamento no Senado das propostas que a Câmara já aprovou (coluna proposicoes.senado).

Fonte: API /processo dos dados abertos do Senado (https://legis.senado.leg.br/dadosabertos).
A família /materia foi descontinuada pelo Senado; não usar.

- Quem entra: propostas com situação da Câmara de "aprovada" (foi ao Senado, à sanção ou
  à promulgação) e as que o robô já achou tramitando no Senado.
- Como acha: desde 2019 a proposta mantém a mesma identificação nas duas Casas, então a
  busca é por sigla, número e ano. Depois da primeira vez, usa o id do processo gravado.
- O que grava: só o que a ficha mostra (situação, comissão, relator atual, resultado da
  votação, lei gerada e as últimas movimentações), com links só para o Senado.
- Não achou: grava {"encontrado": false}; a ficha diz que o Senado ainda não registrou.
- Falha do Senado (3 tentativas) ou do banco: para e avisa, sem apagar o que já estava gravado.
"""
import concurrent.futures as cf
import datetime as dt
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

SENADO = "https://legis.senado.leg.br/dadosabertos"
PAGINA = "https://www25.senado.leg.br/web/atividade/materias/-/materia/"
DB = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/proposicoes"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
DB_HEADERS = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Accept": "application/json"}
TRANSIENT = {429, 500, 502, 503, 504}
# Situações da Câmara de proposta aprovada (src/lib/status.js, BY_CODE.approved).
CODIGOS_APROVADA = [926, 1070, 1150, 1160, 1293, 1294, 1303, 939]
MAX_MOVIMENTACOES = 40
TRABALHADORES = max(1, min(6, int(os.getenv("TRABALHADORES", "4"))))
PAUSA = float(os.getenv("PAUSA", "0.2"))
LIMITE = int(os.getenv("LIMITE", "0"))  # 0 = todas
# Proposta que já saiu do Senado (virou lei, foi à sanção, voltou à Câmara): reconfere de semana em semana.
DIAS_ENCERRADA = 7
PARAR = threading.Event()  # Senado ou banco fora do ar: as consultas que faltam nem começam


def read_json(url, headers=None, timeout=20):
    request = urllib.request.Request(url, headers=headers or {
        "Accept": "application/json", "User-Agent": "OQueMuda/1.0 (sincronizacao publica)"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def api(path):
    """Tenta de novo só falhas transitórias do Senado."""
    for attempt in range(3):
        try:
            return read_json(SENADO + path)
        except urllib.error.HTTPError as exc:
            if exc.code not in TRANSIENT:
                raise
            error = "HTTP " + str(exc.code)
        except (TimeoutError, urllib.error.URLError) as exc:
            error = type(exc).__name__
        if attempt < 2:
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("API do Senado indisponível após 3 tentativas (" + error + ")")


def patch(id, payload):
    request = urllib.request.Request(
        DB + "?id=eq." + str(int(id)), data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), method="PATCH",
        headers={**DB_HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        raise RuntimeError("Supabase: falha na gravação (HTTP " + str(exc.code) + ")") from exc
    except (TimeoutError, urllib.error.URLError) as exc:
        raise RuntimeError("Supabase: falha de conexão na gravação (" + type(exc).__name__ + ")") from exc


def alvos():
    """Propostas aprovadas na Câmara e as que seguem tramitando no Senado."""
    out, offset = [], 0
    filtro = "(situacao_codigo.in.(" + ",".join(map(str, CODIGOS_APROVADA)) + "),senado->>tramitando.eq.true)"
    while True:
        q = urllib.parse.urlencode({"select": "id,sigla_tipo,numero,ano,senado", "or": filtro,
                                    "order": "id.desc", "limit": "1000", "offset": str(offset)})
        rows = read_json(DB + "?" + q, DB_HEADERS)
        out += rows
        if len(rows) < 1000:
            return out
        offset += 1000


def texto(v, limite=400):
    s = re.sub(r"\s+", " ", str(v or "")).strip()
    return s[:limite].rstrip() if s else None


def escolher(processos, sigla, numero, ano):
    """O processo da mesma identificação; se houver mais de um, o que ainda tramita e o mais novo."""
    ident = f"{sigla} {int(numero)}/{int(ano)}"
    iguais = [p for p in processos or [] if isinstance(p, dict) and p.get("id")
              and re.sub(r"\s+", " ", str(p.get("identificacao") or "")).strip().upper() == ident]
    if not iguais:
        return None
    return max(iguais, key=lambda p: (p.get("tramitando") == "Sim", str(p.get("dataApresentacao") or ""), int(p["id"])))


def relator_atual(relatorias):
    """Relator designado e ainda não substituído (sem data de destituição)."""
    ativos = [r for r in relatorias or [] if isinstance(r, dict) and not r.get("dataDestituicao")
              and r.get("casaRelator", "SF") == "SF"]
    if not ativos:
        return None
    r = max(ativos, key=lambda r: str(r.get("dataDesignacao") or ""))
    return {"nome": texto(r.get("nomeParlamentar") or r.get("nomeCompleto"), 80),
            "tratamento": texto(r.get("formaTratamentoParlamentar"), 20),
            "partido": texto(r.get("siglaPartidoParlamentar"), 20), "uf": texto(r.get("ufParlamentar"), 2),
            "colegiado": texto(r.get("siglaColegiado"), 20), "colegiadoNome": texto(r.get("nomeColegiado"), 120),
            "desde": str(r.get("dataDesignacao") or "")[:10] or None}


def colegiado(c):
    if not isinstance(c, dict) or not c.get("sigla"):
        return None
    return {"sigla": texto(c.get("sigla"), 20), "nome": texto(c.get("nome"), 120)}


def resumo(d, relatorias, agora):
    """Só o que a ficha mostra."""
    autuacoes = [a for a in d.get("autuacoes") or [] if isinstance(a, dict)]
    principal = next((a for a in autuacoes if a.get("numero") == 1), autuacoes[0] if autuacoes else {})
    situacoes = [s for s in principal.get("situacoes") or [] if isinstance(s, dict)]
    atual = situacoes[-1] if situacoes else {}
    movs = []
    for a in autuacoes:
        for i in a.get("informesLegislativos") or []:
            if not isinstance(i, dict) or not texto(i.get("descricao")):
                continue
            c = colegiado(i.get("colegiado")) or {}
            movs.append({"data": str(i.get("data") or "")[:16].replace(" ", "T") or None,
                         "descricao": texto(i.get("descricao")),
                         "local": c.get("sigla"), "localNome": c.get("nome")})
    movs.sort(key=lambda m: m["data"] or "")
    delib = d.get("deliberacao") if isinstance(d.get("deliberacao"), dict) else None
    norma = d.get("normaGerada") if isinstance(d.get("normaGerada"), dict) else None
    codigo = d.get("codigoMateria")
    return {
        "encontrado": True,
        "id": int(d["id"]),
        "codigoMateria": int(codigo) if codigo else None,
        "identificacao": texto(d.get("identificacao"), 40),
        "objetivo": texto(d.get("objetivo"), 30),
        "url": PAGINA + str(int(codigo)) if codigo else None,
        "tramitando": d.get("tramitando") == "Sim",
        "situacao": {"descricao": texto(d.get("situacaoAtual"), 160), "sigla": texto(d.get("siglaSituacaoAtual"), 20),
                     "data": str(d.get("dataSituacaoAtual") or "")[:10] or None},
        "local": colegiado(atual.get("colegiado")),
        "relator": relator_atual(relatorias),
        "deliberacao": {"tipo": texto(delib.get("tipoDeliberacao"), 80), "destino": texto(delib.get("destino"), 80),
                        "data": str(delib.get("data") or "")[:10] or None} if delib else None,
        "norma": {"descricao": texto(norma.get("descricao"), 120),
                  "data": str(norma.get("dataPublicacao") or norma.get("dataAssinatura") or "")[:10] or None,
                  "observacao": texto(norma.get("observacao"), 300)} if norma and norma.get("descricao") else None,
        "movimentacoes": movs[-MAX_MOVIMENTACOES:],
        "consultado_em": agora,
    }


def recente(antes, agora, dias):
    try:
        quando = dt.datetime.fromisoformat(str(antes.get("consultado_em")).replace("Z", "+00:00"))
    except ValueError:
        return False
    return (agora - quando).total_seconds() < dias * 86400


def atualizar(row, agora_dt=None):
    """Consulta o Senado e grava. Devolve 'tramitando', 'encerrada', 'nao_encontrada' ou 'pulada'."""
    if PARAR.is_set():
        return "pulada"
    agora_dt = agora_dt or dt.datetime.now(dt.timezone.utc)
    agora = agora_dt.isoformat()
    antes = row.get("senado") if isinstance(row.get("senado"), dict) else {}
    if antes.get("encontrado") and not antes.get("tramitando") and recente(antes, agora_dt, DIAS_ENCERRADA):
        return "pulada"
    pid = antes.get("id")
    if not pid:
        q = urllib.parse.urlencode({"sigla": row["sigla_tipo"], "numero": row["numero"], "ano": row["ano"]})
        achado = escolher(api("/processo?" + q), row["sigla_tipo"], row["numero"], row["ano"])
        if not achado:
            patch(row["id"], {"senado": {"encontrado": False, "consultado_em": agora}, "senado_atualizado_em": agora})
            time.sleep(PAUSA)
            return "nao_encontrada"
        pid = achado["id"]
    d = api("/processo/" + str(int(pid)))
    try:
        relatorias = api("/processo/relatoria?" + urllib.parse.urlencode({"codigoMateria": d.get("codigoMateria")})) \
            if d.get("codigoMateria") else []
    except urllib.error.HTTPError:
        relatorias = []
    s = resumo(d, relatorias, agora)
    patch(row["id"], {"senado": s, "senado_atualizado_em": agora})
    time.sleep(PAUSA)
    return "tramitando" if s["tramitando"] else "encerrada"


def main():
    rows = alvos()
    if LIMITE:
        rows = rows[:LIMITE]
    print("Propostas para consultar no Senado:", len(rows), flush=True)
    conta = {"tramitando": 0, "encerrada": 0, "nao_encontrada": 0, "pulada": 0, "falha": 0}
    interrompido = None
    with cf.ThreadPoolExecutor(max_workers=TRABALHADORES) as pool:
        futuros = {pool.submit(atualizar, r): r for r in rows}
        for futuro in cf.as_completed(futuros):
            r = futuros[futuro]
            try:
                conta[futuro.result()] += 1
            except RuntimeError as exc:
                PARAR.set()
                interrompido = interrompido or str(exc)
                conta["falha"] += 1
            except Exception as exc:
                conta["falha"] += 1
                print("Falha isolada:", r["sigla_tipo"], r["numero"], r["ano"], str(exc)[:150], flush=True)
    linha = (f"**Senado:** {conta['tramitando']} tramitando, {conta['encerrada']} encerradas no Senado, "
             f"{conta['nao_encontrada']} ainda não registradas, {conta['pulada']} sem consulta (encerradas há pouco), "
             f"{conta['falha']} falhas.")
    if interrompido:
        linha += " Interrompido: " + interrompido
    print(linha, flush=True)
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(linha + "\n")
    if interrompido:
        sys.exit(2)


if __name__ == "__main__":
    main()
