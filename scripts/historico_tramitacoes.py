#!/usr/bin/env python3
"""Carga do histórico de movimentações (tramitações) das propostas que ainda não o têm.

O sync de 30 em 30 minutos (sync_supabase.py) só busca o histórico de até 35 propostas por
rodada; este script faz a carga do acervo de uma vez, em lotes, sem mexer na situação, na
autoria nem no texto atual. Só grava tramitacoes, tramitacoes_seq e tramitacoes_ultima.

- Fila: propostas com tramitacoes_seq nulo, da mais nova para a mais antiga (por id).
- Proposta sem nenhuma movimentação na Câmara: lista vazia e sequência 0 (fica conferida).
- Falha isolada numa proposta: pula e segue; ela volta na próxima execução.
- Câmara fora do ar (3 tentativas) ou banco falhando: para e avisa, sem apagar nada.
- Prazo (PRAZO_MINUTOS): ao terminar o tempo com fila restante, escreve continuar=sim em
  GITHUB_OUTPUT para o workflow disparar a próxima rodada.
"""
import concurrent.futures as cf
import importlib.util
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse

SPEC = importlib.util.spec_from_file_location(
    "sync_supabase", pathlib.Path(__file__).resolve().parent / "sync_supabase.py")
SYNC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SYNC)

LOTE = int(os.getenv("LOTE", "200"))
TRABALHADORES = max(1, min(8, int(os.getenv("TRABALHADORES", "4"))))
PAUSA = float(os.getenv("PAUSA", "0.25"))  # por trabalhador, entre propostas
PRAZO_MINUTOS = float(os.getenv("PRAZO_MINUTOS", "300"))
LIMITE = int(os.getenv("LIMITE", "0"))  # 0 = sem limite


def fila(antes_de=None, lote=LOTE):
    """Próximo lote sem histórico, pelo id (decrescente), a partir do cursor."""
    params = {"select": "id", "tramitacoes_seq": "is.null", "order": "id.desc", "limit": str(lote)}
    if antes_de:
        params["id"] = "lt." + str(int(antes_de))
    return [int(r["id"]) for r in SYNC.read_json(SYNC.DB + "?" + urllib.parse.urlencode(params), SYNC.DB_HEADERS)]


def carregar(id):
    """Busca e grava o histórico de uma proposta. Devolve o número de movimentações."""
    try:
        dados = SYNC.api("/proposicoes/" + str(id) + "/tramitacoes").get("dados")
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
        dados = []  # a Câmara não tem histórico para este id
    tram = SYNC.compact_tramitacoes(dados)
    SYNC.patch(id, SYNC.history_columns(tram))
    time.sleep(PAUSA)
    return len(tram)


def main():
    fim = time.monotonic() + PRAZO_MINUTOS * 60
    feitas = vazias = falhas = 0
    cursor, interrompido, acabou_tempo = None, None, False
    with cf.ThreadPoolExecutor(max_workers=TRABALHADORES) as pool:
        while True:
            if time.monotonic() > fim:
                acabou_tempo = True
                break
            if LIMITE and feitas >= LIMITE:
                break
            ids = fila(cursor)
            if LIMITE:
                ids = ids[:max(0, LIMITE - feitas)]
            if not ids:
                break
            cursor = ids[-1]
            futuros = {pool.submit(carregar, id): id for id in ids}
            for futuro in cf.as_completed(futuros):
                id = futuros[futuro]
                try:
                    n = futuro.result()
                    feitas += 1
                    vazias += n == 0
                except RuntimeError as exc:  # Câmara indisponível ou falha de gravação
                    interrompido = str(exc)
                except Exception as exc:
                    falhas += 1
                    print("Falha isolada na proposta", id, str(exc)[:150], flush=True)
            print(f"Histórico gravado: {feitas} propostas ({vazias} sem movimentação), {falhas} falhas", flush=True)
            if interrompido:
                break
    restam = len(fila(lote=1)) if not interrompido else None
    resumo = f"**Histórico:** {feitas} propostas gravadas ({vazias} sem movimentação), {falhas} falhas."
    if interrompido:
        resumo += f" Interrompido: {interrompido}"
    elif acabou_tempo and restam:
        resumo += " Ainda há fila; a próxima rodada continua."
    else:
        resumo += " Fila zerada."
    print(resumo, flush=True)
    saida = os.getenv("GITHUB_OUTPUT")
    if saida:
        with open(saida, "a", encoding="utf-8") as f:
            # Só continua sozinho se esta rodada avançou e parou por tempo (não por falha).
            f.write("continuar=" + ("sim" if acabou_tempo and restam and feitas and not interrompido else "nao") + "\n")
    resumo_md = os.getenv("GITHUB_STEP_SUMMARY")
    if resumo_md:
        with open(resumo_md, "a", encoding="utf-8") as f:
            f.write(resumo + "\n")
    if interrompido:
        sys.exit(2)


if __name__ == "__main__":
    main()
