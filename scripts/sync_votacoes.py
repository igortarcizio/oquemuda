#!/usr/bin/env python3
"""Votações das propostas na Câmara (coluna proposicoes.votacoes).

- Quem entra: propostas com histórico gravado (tramitacoes_seq) que ainda não foram
  consultadas ou tiveram movimentação nova desde a última consulta (votacoes_seq menor).
- O que grava: todas as votações (o que foi votado, órgão, data, resultado). Nas votações
  nominais grava o placar; só nas nominais sobre o texto da proposta grava também o voto de
  cada deputado e a orientação das lideranças. Votação de urgência, emenda ou requerimento
  nunca vale como "a favor ou contra a proposta".
- Votação simbólica: a Câmara não registra voto individual; fica marcada como simbólica.
- Prazo (PRAZO_MINUTOS): ao terminar com fila restante, ou após instabilidade da Câmara numa
  rodada que avançou, escreve continuar=sim em GITHUB_OUTPUT (o workflow dispara a próxima).
"""
import concurrent.futures as cf
import importlib.util
import os
import pathlib
import re
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse

SPEC = importlib.util.spec_from_file_location(
    "sync_supabase", pathlib.Path(__file__).resolve().parent / "sync_supabase.py")
SYNC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SYNC)

TRABALHADORES = max(1, min(8, int(os.getenv("TRABALHADORES", "4"))))
PAUSA = float(os.getenv("PAUSA", "0.25"))
PRAZO_MINUTOS = float(os.getenv("PRAZO_MINUTOS", "300"))
LIMITE = int(os.getenv("LIMITE", "0"))  # 0 = sem limite
PARAR = threading.Event()
TIPOS_VOTO = {"Sim": "sim", "Não": "nao", "Abstenção": "abstencao", "Obstrução": "obstrucao", "Artigo 17": "art17"}
PLACAR = re.compile(r"\bSim:\s*\d+", re.I)


def sem_acento(s):
    return unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()


def tipo_votacao(descricao):
    """O que foi votado: 'texto' (a proposta, substitutivo, parecer, redação final),
    'urgencia', 'emenda', 'requerimento' ou 'outra' (a Câmara não diz o que foi)."""
    d = sem_acento(descricao)
    if "urgencia" in d:
        return "urgencia"
    if re.search(r"\brequerimento\b", d):
        return "requerimento"
    if "subemenda substitutiva" in d:
        return "texto"
    if re.match(r"^(aprovad|rejeitad|mantid)[oa]s?\b", d) and re.search(
            r"\b(projeto|proposta de emenda|pec\b|substitutivo|medida provisoria|parecer|redacao final|"
            r"projeto de lei de conversao)", d) and not re.search(
            r"emenda(s)? (de plenario|n[o.]|aglutinativa)|\bdestaque|\bemendas\b", d):
        return "texto"
    if re.search(r"emenda|destaque", d):
        return "emenda"
    return "outra"


def placar(votos):
    conta = {v: 0 for v in TIPOS_VOTO.values()}
    for v in votos:
        k = TIPOS_VOTO.get(v.get("tipoVoto"))
        if k:
            conta[k] += 1
    conta["total"] = len(votos)
    return conta


def resumo(v, votos, orientacoes):
    """Só o que a ficha mostra."""
    tipo = tipo_votacao(v.get("descricao"))
    nominal = bool(votos)
    out = {
        "id": str(v.get("id")),
        "data": str(v.get("dataHoraRegistro") or v.get("data") or "")[:16] or None,
        "orgao": str(v.get("siglaOrgao") or "") or None,
        "descricao": re.sub(r"\s+", " ", str(v.get("descricao") or "")).strip()[:400] or None,
        "aprovacao": v.get("aprovacao") if v.get("aprovacao") in (0, 1) else None,
        "tipo": tipo,
        "nominal": nominal,
    }
    if nominal:
        out["placar"] = placar(votos)
    if nominal and tipo == "texto":
        dep = lambda v: v.get("deputado_") or {}
        out["votos"] = sorted(
            [[dep(x).get("id"), dep(x).get("nome"), dep(x).get("siglaPartido"), dep(x).get("siglaUf"), x.get("tipoVoto")]
             for x in votos if dep(x).get("nome") and x.get("tipoVoto")],
            key=lambda r: sem_acento(r[1]))
        out["orientacoes"] = [[o.get("siglaPartidoBloco"), o.get("orientacaoVoto")]
                              for o in orientacoes or [] if o.get("siglaPartidoBloco") and o.get("orientacaoVoto")]
    return out


def votacoes_da_proposta(id):
    lista = SYNC.api("/proposicoes/" + str(int(id)) + "/votacoes").get("dados") or []
    out = []
    for v in lista:
        if not isinstance(v, dict) or not v.get("id"):
            continue
        tipo = tipo_votacao(v.get("descricao"))
        votos, orientacoes = [], []
        # Votos individuais: quando a descrição traz o placar ou quando é o texto (para confirmar se foi simbólica).
        if tipo == "texto" or PLACAR.search(str(v.get("descricao") or "")):
            vid = urllib.parse.quote(str(v["id"]))
            votos = SYNC.api("/votacoes/" + vid + "/votos").get("dados") or []
            if votos and tipo == "texto":
                orientacoes = SYNC.api("/votacoes/" + vid + "/orientacoes").get("dados") or []
        out.append(resumo(v, votos, orientacoes))
    out.sort(key=lambda x: x["data"] or "", reverse=True)
    return out


def alvos():
    """Propostas com histórico e movimentação nova desde a última consulta, mais novas primeiro."""
    out, offset = [], 0
    while True:
        q = urllib.parse.urlencode({"select": "id,tramitacoes_seq,votacoes_seq", "tramitacoes_seq": "not.is.null",
                                    "order": "id.desc", "limit": "1000", "offset": str(offset)})
        rows = SYNC.read_json(SYNC.DB + "?" + q, SYNC.DB_HEADERS, timeout=30)
        out += [r for r in rows if r.get("votacoes_seq") is None or (r.get("tramitacoes_seq") or 0) > r["votacoes_seq"]]
        if len(rows) < 1000:
            return out
        offset += 1000


def carregar(row):
    if PARAR.is_set():
        return None
    v = votacoes_da_proposta(row["id"])
    SYNC.patch(row["id"], {"votacoes": v, "votacoes_seq": row.get("tramitacoes_seq") or 0})
    time.sleep(PAUSA)
    return sum(1 for x in v if x["nominal"] and x["tipo"] == "texto")


def main():
    fim = time.monotonic() + PRAZO_MINUTOS * 60
    rows = alvos()
    if LIMITE:
        rows = rows[:LIMITE]
    print("Propostas para consultar:", len(rows), flush=True)
    feitas = com_nominal = falhas = 0
    interrompido, acabou_tempo = None, False
    with cf.ThreadPoolExecutor(max_workers=TRABALHADORES) as pool:
        for i in range(0, len(rows), 200):
            if time.monotonic() > fim:
                acabou_tempo = True
                break
            lote = rows[i:i + 200]
            futuros = {pool.submit(carregar, r): r for r in lote}
            for futuro in cf.as_completed(futuros):
                r = futuros[futuro]
                try:
                    n = futuro.result()
                    if n is not None:
                        feitas += 1
                        com_nominal += n > 0
                except RuntimeError as exc:
                    PARAR.set()
                    interrompido = interrompido or str(exc)
                except Exception as exc:
                    falhas += 1
                    print("Falha isolada na proposta", r["id"], str(exc)[:150], flush=True)
            print(f"Votações gravadas: {feitas} propostas ({com_nominal} com votação nominal do texto), {falhas} falhas",
                  flush=True)
            if interrompido:
                break
    restam = feitas + falhas < len(rows)
    resumo_txt = (f"**Votações:** {feitas} propostas consultadas, {com_nominal} com votação nominal do texto, "
                  f"{falhas} falhas.")
    if interrompido:
        resumo_txt += f" Interrompido: {interrompido}" + (" A próxima rodada tenta de novo depois de uma pausa." if feitas else "")
    elif acabou_tempo and restam:
        resumo_txt += " Ainda há fila; a próxima rodada continua."
    print(resumo_txt, flush=True)
    for var, texto in (("GITHUB_STEP_SUMMARY", resumo_txt + "\n"),):
        if os.getenv(var):
            with open(os.environ[var], "a", encoding="utf-8") as f:
                f.write(texto)
    if os.getenv("GITHUB_OUTPUT"):
        segue = feitas and ((acabou_tempo and restam) or interrompido)
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            f.write("continuar=" + ("sim" if segue else "nao") + "\n")
            f.write("pausa=" + ("300" if interrompido else "0") + "\n")
    if interrompido:
        sys.exit(2)


if __name__ == "__main__":
    main()
