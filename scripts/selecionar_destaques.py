#!/usr/bin/env python3
"""Seleção diária, determinística e não partidária de destaques por etapa.

Três posições, cada uma de uma etapa da tramitação na Câmara:
  1. pronta para pauta (situação 924);
  2. aprovada na Câmara ou já transformada em lei;
  3. nova proposta (só troca quando surge uma nova qualificada).
Sem candidata numa etapa, a posição recebe outra proposta nova qualificada
e, em último caso, um destaque anterior: nunca fica vazia. Preserva os
destaques anteriores na falta de dados ou de disponibilidade do Supabase.
"""
import datetime as dt
import json
import os
import re
import unicodedata
import urllib.parse
import urllib.request

BASE = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Accept": "application/json"}
TYPES = {"PL", "PLP", "PEC", "MPV", "PDL", "PRC"}
EXCLUDE = (
    "denomina", "denominacao", "da nome", "concede titulo", "dia nacional",
    "semana nacional", "homenagem", "sessao solene",
    "altera a denominacao", "inclui no calendario", "declara patrono"
)
AREAS = {
    "Saúde": r"\b(sus|saude|hospital\w*|tratamento\w*|paciente\w*|vacina\w*|medicament\w*|doenca\w*|cancer\w*|diabetes)\b",
    "Trabalho": r"\b(trabalh|empreg|salario|previdenc|aposent|licenca|trabalhador|jornada)\w*",
    "Educação": r"\b(educa|escol|universi|estud|professor|alfabetiza|ensino)\w*",
    "Consumo": r"\b(consumidor|tarifa|conta de luz|conta de agua|credito|financiam|fraude banc|superendivid)\w*",
    "Mobilidade": r"\b(transporte|passageiro|transito|mobilidade|passagem|onibus|rodovia)\w*",
    "Tecnologia": r"\b(dados pessoais|seguranca digital|internet|plataforma digital|inteligencia artificial)\b",
    "Moradia": r"\b(moradia|habitac|aluguel|morador|saneamento)\w*",
    "Segurança": r"\b(violencia domestica|medida protetiva|seguranca publica|violencia contra)\b",
    "Ambiente": r"\b(meio ambiente|desmatamento|enchente|queimada|emergencia climatica)\b",
}
EFFECT = re.compile(r"\b(assegura|garante|protege|proibe|estabelece|institui|obriga|determina|altera|amplia|reduz|prev[eê])\b")
PUBLIC = re.compile(r"\b(pessoas|familias|criancas|adolescentes|idosos|mulheres|pacientes|trabalhadores|estudantes|consumidores|usuarios|populacao|deficiencia)\b")

# Etapas: códigos oficiais iguais aos de src/lib/status.js (voting, approved e law).
VOTING_CODES = (924,)
APPROVED_CODES = (926, 1070, 1150, 1160, 1293, 1294, 1303, 939, 1140)
STAGE_WINDOWS = (21, 60)  # dias desde a última movimentação; o segundo é a reserva
STAGE_TYPES = {"PL", "PLP", "PEC", "MPV", "PDL"}
# Atos de rotina que chegam ao Plenário em bloco e não mudam o cotidiano.
STAGE_EXCLUDE = (
    "radiodifusao", "credito extraordinario", "aprova o texto do", "acordo entre",
    "premio", "selo ", "livro dos herois", "manifestacao da cultura", "calendario turistico",
    "mobilizacao nacional", "simbolo nacional", "patrimonio cultural",
)
STAGE_EFFECT = re.compile(r"\b(assegura\w*|garant\w*|proib\w*|ved\w*|obrig\w*|amplia\w*|reduz\w*|cria\w*|torna\w*|estabelece\w*|altera\w*|institui\w*|dispoe)\b")
STAGE_PUBLIC = re.compile(r"\b(pessoas?|familias?|criancas?|adolescentes?|idos[oa]s?|mulheres|maes|pacientes?|trabalhador\w*|estudantes?|consumidor\w*|usuarios?|populacao|deficiencias?|empresas?|produtores?|taxistas?|motoristas?|animais)\b")
CRITERIA = {"pauta": "etapa_pauta_v2", "aprovada": "etapa_aprovada_v2", "nova": "etapa_nova_v2"}

def simplify(text):
    return "".join(c for c in unicodedata.normalize("NFD", (text or "").lower()) if not unicodedata.combining(c))

def relevance(row):
    """Retorna score e área; rejeita procedimentos simbólicos e textos genéricos."""
    if row.get("sigla_tipo") not in TYPES:
        return None
    description = simplify(row.get("ementa", ""))
    if len(description) < 65 or any(term in description for term in EXCLUDE) or re.search(r"\bmocao\b", description):
        return None
    if row.get("situacao_codigo") in (923, 950, 1292):
        return None
    matched = [(area, bool(re.search(regex, description))) for area, regex in AREAS.items()]
    topics = [area for area, ok in matched if ok]
    if not topics or not EFFECT.search(description):
        return None
    score = 3 + min(len(topics), 3) + 2 + (2 if PUBLIC.search(description) else 0)
    if re.search(r"\b(direito|acesso|gratuit|beneficio|prote[cç]ao|assistencia)\w*", description):
        score += 1
    if score < 7:
        return None
    # Empate resolvido deterministicamente por ordem do dicionário.
    return score, topics[0]

def stage_relevance(row):
    """Pontuação para propostas que avançaram (pauta ou aprovação).

    Chegar a essas etapas já é notícia; o filtro só tira atos de rotina e homenagens
    e ordena pelo efeito no cotidiano. Retorna (score, tema) ou None.
    """
    if row.get("sigla_tipo") not in STAGE_TYPES:
        return None
    description = simplify(row.get("ementa", ""))
    if len(description) < 50 or any(t in description for t in EXCLUDE + STAGE_EXCLUDE) or re.search(r"\bmocao\b", description):
        return None
    topics = [area for area, regex in AREAS.items() if re.search(regex, description)]
    score = min(len(topics), 3) * 2
    score += 2 if STAGE_PUBLIC.search(description) else 0
    score += 1 if STAGE_EFFECT.search(description) else 0
    score += 1 if re.search(r"\b(direito|acesso|gratuit|beneficio|prote[cç]ao|assistencia|financiamento)\w*", description) else 0
    if score < 2:
        return None
    return score, (topics[0] if topics else "Outros")

def stage_date(row):
    return str(row.get("etapa_em") or "")[:19]

def best_stage(candidates, used_ids, used_topics, today):
    """Melhor candidata da etapa: janela curta primeiro, depois a reserva.

    Ordem: pontuação, tema ainda não usado nos outros destaques, movimentação mais recente.
    """
    for days in STAGE_WINDOWS:
        since = (today - dt.timedelta(days=days)).isoformat()
        scored = []
        for p in candidates:
            if int(p["id"]) in used_ids or stage_date(p)[:10] < since:
                continue
            value = stage_relevance(p)
            if value is not None:
                scored.append((value[0], value[1] not in used_topics, stage_date(p), int(p["id"]), value[1]))
        if scored:
            scored.sort(reverse=True)
            return scored[0][3], scored[0][4]
    return None, None

def request(path, params=None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.load(response)

def update_selection(rows):
    data = json.dumps(rows, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(BASE + "destaques_diarios?on_conflict=posicao",
        data=data, method="POST",
        headers={**HEADERS, "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=25) as response:
        response.read()

def fresh_new(previous, candidates):
    """Propostas novas qualificadas, inéditas desde a última avaliação, de temas diferentes.

    Retorna [(id, tema)] em ordem de relevância.
    """
    cutoff = max(str(row["selecionado_em"])[:10] for row in previous) if previous else ""
    seen = set(previous[0].get("candidatos_avaliados") or []) if previous and "candidatos_avaliados" in previous[0] else None
    old = {int(row["proposicao_id"]) for row in previous}
    qualified = []
    for p in candidates:
        if int(p["id"]) in old or (int(p["id"]) in seen if seen is not None else str(p.get("data_apresentacao") or "")[:10] <= cutoff):
            continue
        value = relevance(p)
        if value is not None:
            qualified.append((value[0], value[1], p))
    qualified.sort(key=lambda x:(x[0], str(x[2]["data_apresentacao"]), x[2]["id"]), reverse=True)
    fresh, categories = [], set()
    for _, topic, candidate in qualified:
        if topic in categories:
            continue
        fresh.append((int(candidate["id"]), topic))
        categories.add(topic)
    return fresh

def previous_new(previous):
    """Destaques anteriores de proposta nova, do mais recente ao mais antigo.

    Na primeira execução (critério antigo), as três posições eram todas de propostas novas.
    """
    rows = sorted(previous, key=lambda row: row["posicao"])
    marked = [r for r in rows if r.get("criterio") == CRITERIA["nova"]]
    legacy = [r for r in rows if r.get("criterio") not in CRITERIA.values()]
    return [int(r["proposicao_id"]) for r in marked + legacy]

def compose(previous, new_candidates, voting, approved, now):
    """Monta as três posições: pauta, aprovada e nova, sempre com três propostas distintas.

    Uma etapa sem candidata cede a posição a outra proposta nova qualificada; sem
    nenhuma, a um destaque anterior. Retorna [] quando não há como completar as três.
    """
    previous = sorted(previous, key=lambda row: row["posicao"])
    if len(previous) != 3:
        return []
    today = now.date()
    used_ids, used_topics, slots = set(), set(), {}
    fresh = fresh_new(previous, new_candidates)
    # A posição "nova" troca só com novidade; sem ela, mantém a anterior.
    if fresh:
        slots["nova"] = fresh.pop(0)
    else:
        kept = next((i for i in previous_new(previous)), None)
        slots["nova"] = (kept, None) if kept else (None, None)
    if slots["nova"][0]:
        used_ids.add(slots["nova"][0])
        if slots["nova"][1]:
            used_topics.add(slots["nova"][1])
    for stage, candidates in (("pauta", voting), ("aprovada", approved)):
        chosen, topic = best_stage(candidates, used_ids, used_topics, today)
        if chosen is None:
            # Reserva: outra proposta nova qualificada (marcada como nova) ou um destaque anterior.
            while fresh and fresh[0][0] in used_ids:
                fresh.pop(0)
            if fresh:
                chosen, topic = fresh.pop(0)
            else:
                chosen = next((i for i in previous_new(previous) + [int(r["proposicao_id"]) for r in previous] if i not in used_ids), None)
            if chosen is None:
                return []
            slots[stage + ":reserva"] = (chosen, topic)
        else:
            slots[stage] = (chosen, topic)
        used_ids.add(chosen)
        if topic:
            used_topics.add(topic)
    order = []
    for stage in ("pauta", "aprovada"):
        if stage in slots:
            order.append((slots[stage][0], CRITERIA[stage]))
        else:
            order.append((slots[stage + ":reserva"][0], CRITERIA["nova"]))
    if slots["nova"][0] is None:
        return []
    order.append((slots["nova"][0], CRITERIA["nova"]))
    if len({i for i, _ in order}) != 3:
        return []
    observed = sorted({int(p["id"]) for p in new_candidates})
    return [{"posicao":idx+1, "proposicao_id":id, "selecionado_em":now.isoformat(),
             "criterio":criterio, "candidatos_avaliados":observed} for idx,(id,criterio) in enumerate(order)]

def stage_candidates(codes, today):
    """Propostas na etapa com movimentação nos últimos 60 dias (a data vem da situação oficial)."""
    since = (today - dt.timedelta(days=max(STAGE_WINDOWS))).isoformat()
    return request("proposicoes", {
        "select":"id,sigla_tipo,ementa,situacao_codigo,etapa_em:dados_oficiais->statusProposicao->>dataHora",
        "situacao_codigo":"in.(" + ",".join(str(c) for c in codes) + ")",
        "dados_oficiais->statusProposicao->>dataHora":"gte." + since,
        "order":"dados_oficiais->statusProposicao->>dataHora.desc", "limit":1000})

def update_seen(ids):
    """Grava o progresso mesmo quando não há rodízio; não altera propostas destacadas."""
    payload = json.dumps({"candidatos_avaliados":ids}).encode("utf-8")
    req = urllib.request.Request(BASE + "destaques_diarios?posicao=eq.1",
        data=payload, method="PATCH",headers={**HEADERS,"Content-Type":"application/json",
        "Prefer":"return=minimal"})
    with urllib.request.urlopen(req,timeout=25) as response:response.read()

def main():
    previous = request("destaques_diarios", {"select":"posicao,proposicao_id,selecionado_em,criterio,candidatos_avaliados",
                                           "order":"posicao.asc"})
    if len(previous) != 3:
        raise RuntimeError("Seleção anterior incompleta; atualização cancelada")
    start = dt.date.today() - dt.timedelta(days=12)
    candidates = []
    for offset in range(0, 4000, 1000):
        batch = request("proposicoes", {
            "select":"id,ano,sigla_tipo,data_apresentacao,ementa,situacao_codigo",
            "data_apresentacao":"gte."+start.isoformat(),
            "order":"data_apresentacao.desc,id.desc", "limit":1000, "offset":offset})
        candidates.extend(batch)
        if len(batch) < 1000:
            break
    now = dt.datetime.now(dt.timezone.utc)
    voting = stage_candidates(VOTING_CODES, now.date())
    approved = stage_candidates(APPROVED_CODES, now.date())
    rows = compose(previous, candidates, voting, approved, now)
    if not rows:
        update_seen(sorted({int(p["id"]) for p in candidates}))
        print("Sem candidatas suficientes: mantidos os 3 destaques anteriores.",flush=True)
        return
    update_selection(rows)
    print("Seleção atualizada:",[(r["proposicao_id"], r["criterio"]) for r in rows],flush=True)

if __name__ == "__main__":
    main()
