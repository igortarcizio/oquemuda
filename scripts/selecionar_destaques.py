#!/usr/bin/env python3
"""Seleção diária, determinística e não partidária de temas com impacto cotidiano.

Só incorpora propostas novas depois da última seleção e só altera os três slots
quando encontra candidatas qualificadas. Preserva os destaques anteriores
na falta de candidatas, de dados ou de disponibilidade do Supabase.
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

def choose(previous, candidates, day):
    """Escolhe somente IDs inéditos desde a última avaliação do catálogo."""
    previous = sorted(previous, key=lambda row: row["posicao"])
    if len(previous) != 3:
        return []
    cutoff = max(str(row["selecionado_em"])[:10] for row in previous)
    seen = set(previous[0].get("candidatos_avaliados") or []) if "candidatos_avaliados" in previous[0] else None
    old = [row["proposicao_id"] for row in previous]
    qualified = []
    for p in candidates:
        if p["id"] in old or (p["id"] in seen if seen is not None else str(p.get("data_apresentacao") or "")[:10] <= cutoff):
            continue
        value = relevance(p)
        if value is not None:
            qualified.append((value[0], value[1], p))
    qualified.sort(key=lambda x:(x[0], str(x[2]["data_apresentacao"]), x[2]["id"]), reverse=True)
    fresh, categories = [], set()
    for _, topic, candidate in qualified:
        if topic in categories:
            continue
        fresh.append(candidate["id"])
        categories.add(topic)
        if len(fresh) == 3:
            break
    if not fresh:
        return []
    chosen = fresh + [id for id in old if id not in fresh][:3-len(fresh)]
    observed = sorted({int(p["id"]) for p in candidates})
    return [{"posicao":idx+1, "proposicao_id":id, "selecionado_em":day.isoformat(),
             "criterio":"interesse_publico_v1", "candidatos_avaliados":observed} for idx,id in enumerate(chosen)]

def update_seen(ids):
    """Grava o progresso mesmo quando não há rodízio; não altera propostas destacadas."""
    payload = json.dumps({"candidatos_avaliados":ids}).encode("utf-8")
    req = urllib.request.Request(BASE + "destaques_diarios?posicao=eq.1",
        data=payload, method="PATCH",headers={**HEADERS,"Content-Type":"application/json",
        "Prefer":"return=minimal"})
    with urllib.request.urlopen(req,timeout=25) as response:response.read()

def main():
    previous = request("destaques_diarios", {"select":"posicao,proposicao_id,selecionado_em,candidatos_avaliados",
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
    rows = choose(previous, candidates, now)
    if not rows:
        update_seen(sorted({int(p["id"]) for p in candidates}))
        print("Sem novas propostas qualificadas: mantidos os 3 destaques anteriores.",flush=True)
        return
    update_selection(rows)
    print("Seleção atualizada:",[r["proposicao_id"] for r in rows],flush=True)

if __name__ == "__main__":
    main()
