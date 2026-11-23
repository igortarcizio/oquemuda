"""Testes isolados: sem rede, banco ou credenciais reais."""
import importlib.util
import json
import os
import pathlib
import unittest
import urllib.error
import urllib.parse
from unittest.mock import patch, call

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "fake-test-only")

SPEC = importlib.util.spec_from_file_location(
    "sync_under_test", pathlib.Path(__file__).resolve().parents[1] / "scripts" / "sync_supabase.py")
SYNC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SYNC)


class Response:
    def __init__(self, data):
        self.data = data

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self):
        return json.dumps(self.data).encode("utf-8")


def error(code):
    return urllib.error.HTTPError("https://dadosabertos.camara.leg.br/api/v2/proposicoes", code, "test", {}, None)


class SyncTests(unittest.TestCase):
    def test_503_429_then_success_only_two_retries(self):
        with patch.object(SYNC.urllib.request, "urlopen",
                          side_effect=[error(503), error(429), Response({"dados": [1]})]) as fetch, \
             patch.object(SYNC.time, "sleep") as sleep:
            self.assertEqual(SYNC.api("/proposicoes"), {"dados": [1]})
            self.assertEqual(fetch.call_count, 3)
            self.assertEqual(sleep.call_args_list, [call(2), call(4)])

    def test_three_transient_failures_stop_with_clear_message(self):
        with patch.object(SYNC.urllib.request, "urlopen", side_effect=[error(503)] * 3) as fetch, \
             patch.object(SYNC.time, "sleep") as sleep:
            with self.assertRaisesRegex(RuntimeError, "Câmara indisponível após 3 tentativas \\(HTTP 503\\)"):
                SYNC.api("/proposicoes")
            self.assertEqual(fetch.call_count, 3)
            self.assertEqual(sleep.call_count, 2)

    def test_400_is_not_retried(self):
        with patch.object(SYNC.urllib.request, "urlopen", side_effect=error(400)) as fetch, \
             patch.object(SYNC.time, "sleep") as sleep:
            with self.assertRaises(urllib.error.HTTPError):
                SYNC.api("/proposicoes")
            self.assertEqual(fetch.call_count, 1)
            sleep.assert_not_called()

    def test_supabase_write_error_has_separate_diagnostic(self):
        with patch.object(SYNC.urllib.request, "urlopen", side_effect=error(400)) as fetch, \
             patch.object(SYNC.time, "sleep") as sleep:
            with self.assertRaisesRegex(RuntimeError, "Supabase: falha na gravação \\(HTTP 400\\)"):
                SYNC.patch(98765, {"atualizado_em": "2026-11-10T00:00:00Z"})
            self.assertEqual(fetch.call_count, 1)
            sleep.assert_not_called()

    def test_incomplete_official_stage_preserves_stored_status(self):
        row = {"id": 98765, "situacao_atualizada_em": None,
               "dados_oficiais": {"statusProposicao": {
                   "codSituacao": 924, "descricaoSituacao": "Pronta para Pauta"}}}
        def fake_api(path):
            if path.endswith("/autores"):
                return {"dados": []}
            return {"dados": {"id": 98765, "statusProposicao": {}}}
        with patch.object(SYNC, "PRIORITY_IDS", []), \
             patch.object(SYNC, "tramitacoes_available", return_value=False), \
             patch.object(SYNC, "apensacao_available", return_value=False), \
             patch.object(SYNC, "pending_rows", return_value=[row]), \
             patch.object(SYNC, "missing_history_rows", return_value=[]), \
             patch.object(SYNC, "api", side_effect=fake_api), \
             patch.object(SYNC, "patch") as save, \
             patch.object(SYNC.time, "sleep"):
            self.assertEqual(SYNC.enrich(), (1, True))
            self.assertEqual(save.call_args.args[1]["situacao_codigo"], 924)
            self.assertEqual(save.call_args.args[1]["situacao_descricao"], "Pronta para Pauta")

    def _enrich_with(self, rows, fake_api):
        with patch.object(SYNC, "PRIORITY_IDS", []), \
             patch.object(SYNC, "tramitacoes_available", return_value=False), \
             patch.object(SYNC, "apensacao_available", return_value=False), \
             patch.object(SYNC, "pending_rows", return_value=rows), \
             patch.object(SYNC, "missing_history_rows", return_value=[]), \
             patch.object(SYNC, "api", side_effect=fake_api), \
             patch.object(SYNC, "patch") as save, \
             patch.object(SYNC.time, "sleep"):
            result = SYNC.enrich()
        return result, save

    def test_ficha_sem_situacao_recebe_carimbo_e_sai_do_topo_da_fila(self):
        row = {"id": 111, "situacao_atualizada_em": None, "dados_oficiais": {}}
        def fake_api(path):
            if path.endswith("/autores"):
                return {"dados": []}
            return {"dados": {"id": 111, "statusProposicao": {}}}
        result, save = self._enrich_with([row], fake_api)
        self.assertEqual(result, (1, True))
        payload = save.call_args.args[1]
        self.assertIn("situacao_atualizada_em", payload)
        self.assertNotIn("situacao_codigo", payload)

    def test_sem_ficha_oficial_so_marca_a_consulta(self):
        row = {"id": 222, "situacao_atualizada_em": None, "dados_oficiais": {}}
        result, save = self._enrich_with([row], lambda path: {"dados": {}})
        self.assertEqual(result, (0, True))
        self.assertEqual(save.call_count, 1)
        self.assertEqual(save.call_args.args[0], 222)
        self.assertEqual(set(save.call_args.args[1]), {"situacao_atualizada_em"})

    def test_erro_permanente_da_camara_nao_prende_a_ficha_na_fila(self):
        rows = [{"id": 333, "situacao_atualizada_em": None, "dados_oficiais": {}},
                {"id": 444, "situacao_atualizada_em": None, "dados_oficiais": {}}]
        def fake_api(path):
            if "/333" in path:
                raise error(404)
            if path.endswith("/autores"):
                return {"dados": []}
            return {"dados": {"id": 444, "statusProposicao": {"descricaoTramitacao": "Apresentação de Proposição"}}}
        result, save = self._enrich_with(rows, fake_api)
        self.assertEqual(result, (1, True))
        self.assertEqual(save.call_args_list[0].args, (333, save.call_args_list[0].args[1]))
        self.assertEqual(set(save.call_args_list[0].args[1]), {"situacao_atualizada_em"})
        self.assertEqual(save.call_args_list[1].args[0], 444)

    def test_falha_ao_gravar_o_carimbo_interrompe_a_rodada(self):
        row = {"id": 555, "situacao_atualizada_em": None, "dados_oficiais": {}}
        with patch.object(SYNC, "PRIORITY_IDS", []), \
             patch.object(SYNC, "tramitacoes_available", return_value=False), \
             patch.object(SYNC, "apensacao_available", return_value=False), \
             patch.object(SYNC, "pending_rows", return_value=[row]), \
             patch.object(SYNC, "missing_history_rows", return_value=[]), \
             patch.object(SYNC, "api", side_effect=error(404)), \
             patch.object(SYNC, "patch", side_effect=RuntimeError("Supabase: falha na gravação (HTTP 500)")), \
             patch.object(SYNC.time, "sleep"):
            self.assertEqual(SYNC.enrich(), (0, False))


# Recorte real do PL 220/2026 (id 2600635), consultado na API em 19/11/2026:
# parecer com substitutivo aprovado na CSPCCO em 17/11; SBT-A registrado em 19/11.
TRAM_PL220 = [
    {"dataHora": "2026-02-03T10:00", "sequencia": 1, "siglaOrgao": "PLEN", "codTipoTramitacao": "100",
     "descricaoTramitacao": "Apresentação de Proposição", "despacho": "Apresentação do PL n. 220/2026", "url": None},
    {"dataHora": "2026-09-16T12:26", "sequencia": 19, "siglaOrgao": "CSPCCO", "codTipoTramitacao": "322",
     "descricaoTramitacao": "Parecer do(a) Relator(a)",
     "despacho": "Parecer do Relator, Dep. Aluisio Mendes (REPUBLIC-MA), pela aprovação do PL 220/26 e da Emenda 1/2026 apresentada nesta comissão, com substitutivo",
     "url": "https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=3180800"},
    {"dataHora": "2026-11-17T14:15", "sequencia": 24, "siglaOrgao": "CSPCCO", "codTipoTramitacao": "336",
     "descricaoTramitacao": "Aprovação do Parecer", "despacho": "Aprovado o Parecer.", "url": "https://malicioso.example/x"},
]
REL_PL220 = [
    {"id": 2655526, "siglaTipo": "PAR", "dataApresentacao": "2026-11-19T12:14"},
    {"id": 2646562, "siglaTipo": "SBT", "dataApresentacao": "2026-09-17T10:32"},
    {"id": 2655527, "siglaTipo": "SBT-A", "dataApresentacao": "2026-11-19T12:14"},
]
SBT_A = {"id": 2655527, "urlInteiroTeor": "https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=3199112",
         "statusProposicao": {"siglaOrgao": "CSPCCO"}}
NOW = SYNC.dt.datetime(2026, 11, 19, 18, 0, tzinfo=SYNC.dt.timezone.utc)


class TramitacaoTests(unittest.TestCase):
    def fake_api(self, calls):
        def api(path):
            calls.append(path)
            if path.endswith("/tramitacoes"):
                return {"dados": TRAM_PL220}
            if path.endswith("/relacionadas"):
                return {"dados": REL_PL220}
            if path == "/proposicoes/2655527":
                return {"dados": SBT_A}
            raise AssertionError("chamada inesperada: " + path)
        return api

    def test_compacta_ordena_e_so_aceita_links_da_camara(self):
        rows = SYNC.compact_tramitacoes(list(reversed(TRAM_PL220)))
        self.assertEqual([r["sequencia"] for r in rows], [1, 19, 24])
        self.assertIsNone(rows[2]["url"])
        self.assertTrue(rows[1]["url"].startswith("https://www.camara.leg.br/"))
        self.assertEqual(SYNC.max_sequence(rows), 24)

    def test_substitutivo_proposto_pelo_relator_nao_conta_so_o_adotado(self):
        self.assertEqual(SYNC.adopted_text(REL_PL220)["id"], 2655527)
        self.assertIsNone(SYNC.adopted_text([r for r in REL_PL220 if r["siglaTipo"] != "SBT-A"]))
        rdf = REL_PL220 + [{"id": 2700000, "siglaTipo": "RDF", "dataApresentacao": "2026-12-01T10:00"}]
        self.assertEqual(SYNC.adopted_text(rdf)["siglaTipo"], "RDF")

    def test_primeira_vez_busca_historico_e_acha_texto_novo_com_data_da_aprovacao(self):
        calls = []
        with patch.object(SYNC, "api", side_effect=self.fake_api(calls)):
            out = SYNC.tramitacao_changes(2600635, {"id": 2600635}, {"sequencia": 24}, NOW)
        self.assertEqual(out["tramitacoes_seq"], 24)
        self.assertEqual(out["tramitacoes_ultima"], "2026-11-17T14:15:00-03:00")
        self.assertEqual(out["texto_atual"], {
            "id": 2655527, "sigla": "SBT-A", "descricao": "Substitutivo aprovado na comissão",
            "data": "2026-11-17", "orgao": "CSPCCO", "url": SBT_A["urlInteiroTeor"]})
        self.assertEqual(calls.count("/proposicoes/2600635/tramitacoes"), 1)

    def test_sem_movimentacao_nova_e_antiga_nao_faz_chamada_extra(self):
        row = {"id": 2600635, "tramitacoes_seq": 24, "tramitacoes_ultima": "2026-09-16T12:26:00-03:00"}
        with patch.object(SYNC, "api", side_effect=AssertionError("não devia chamar")):
            self.assertEqual(SYNC.tramitacao_changes(2600635, row, {"sequencia": 24}, NOW), {})

    def test_movimentacao_recente_continua_conferindo_o_substitutivo(self):
        # O SBT-A aparece dias depois da aprovação: sem sequencia nova, ainda confere.
        calls = []
        row = {"id": 2600635, "tramitacoes_seq": 24, "tramitacoes_ultima": "2026-11-17T14:15:00-03:00"}
        with patch.object(SYNC, "api", side_effect=self.fake_api(calls)):
            out = SYNC.tramitacao_changes(2600635, row, {"sequencia": 24}, NOW)
        self.assertNotIn("tramitacoes", out)
        self.assertEqual(out["texto_atual"]["id"], 2655527)

    def test_texto_ja_conhecido_nao_e_regravado(self):
        row = {"id": 2600635, "tramitacoes_seq": 24, "tramitacoes_ultima": "2026-11-17T14:15:00-03:00",
               "texto_atual": {"id": 2655527}}
        calls = []
        with patch.object(SYNC, "api", side_effect=self.fake_api(calls)):
            self.assertEqual(SYNC.tramitacao_changes(2600635, row, {"sequencia": 24}, NOW), {})
        self.assertEqual(calls, ["/proposicoes/2600635/relacionadas"])

    def test_enrich_grava_historico_junto_com_a_situacao(self):
        row = {"id": 2600635, "situacao_atualizada_em": None, "dados_oficiais": {}}
        calls = []
        base = self.fake_api(calls)
        def api(path):
            if path == "/proposicoes/2600635":
                return {"dados": {"id": 2600635, "statusProposicao": {"sequencia": 24, "codSituacao": 1140,
                                                                     "descricaoSituacao": "Aguardando Encaminhamento"}}}
            if path.endswith("/autores"):
                return {"dados": []}
            return base(path)
        with patch.object(SYNC, "PRIORITY_IDS", []), \
             patch.object(SYNC, "tramitacoes_available", return_value=True), \
             patch.object(SYNC, "apensacao_available", return_value=False), \
             patch.object(SYNC, "pending_rows", return_value=[row]), \
             patch.object(SYNC, "missing_history_rows", return_value=[]), \
             patch.object(SYNC, "api", side_effect=api), \
             patch.object(SYNC, "patch") as save, \
             patch.object(SYNC.time, "sleep"):
            self.assertEqual(SYNC.enrich(), (1, True))
        saved = save.call_args.args[1]
        self.assertEqual(saved["situacao_codigo"], 1140)
        self.assertEqual(len(saved["tramitacoes"]), 3)
        self.assertEqual(saved["texto_atual"]["sigla"], "SBT-A")

    def test_falha_isolada_no_historico_nao_impede_salvar_a_situacao(self):
        row = {"id": 5, "situacao_atualizada_em": None, "dados_oficiais": {}}
        def api(path):
            if path == "/proposicoes/5":
                return {"dados": {"id": 5, "statusProposicao": {"sequencia": 3, "codSituacao": 924}}}
            if path.endswith("/autores"):
                return {"dados": []}
            raise error(404)
        with patch.object(SYNC, "PRIORITY_IDS", []), \
             patch.object(SYNC, "tramitacoes_available", return_value=True), \
             patch.object(SYNC, "apensacao_available", return_value=False), \
             patch.object(SYNC, "pending_rows", return_value=[row]), \
             patch.object(SYNC, "missing_history_rows", return_value=[]), \
             patch.object(SYNC, "api", side_effect=api), \
             patch.object(SYNC, "patch") as save, \
             patch.object(SYNC.time, "sleep"):
            self.assertEqual(SYNC.enrich(), (1, True))
        self.assertEqual(save.call_args.args[1]["situacao_codigo"], 924)
        self.assertNotIn("tramitacoes", save.call_args.args[1])

    def test_sem_migration_o_sincronizador_segue_sem_as_colunas(self):
        with patch.object(SYNC, "read_json", side_effect=error(400)):
            self.assertFalse(SYNC.tramitacoes_available())


class HistoricoTests(unittest.TestCase):
    """Propostas sem histórico de movimentações (tramitacoes_seq nulo)."""

    def rows(self, *ids, stamp="2026-11-23T00:00:00+00:00"):
        return [{"id": i, "situacao_atualizada_em": stamp, "dados_oficiais": {}} for i in ids]

    def test_sem_movimentacao_fica_conferida_com_lista_vazia(self):
        self.assertEqual(SYNC.history_columns([]), {"tramitacoes": [], "tramitacoes_seq": 0})
        with patch.object(SYNC, "api", return_value={"dados": []}):
            out = SYNC.tramitacao_changes(9, {"id": 9}, {"sequencia": None},
                                          SYNC.dt.datetime(2026, 11, 23, tzinfo=SYNC.dt.timezone.utc))
        self.assertEqual(out["tramitacoes"], [])
        self.assertEqual(out["tramitacoes_seq"], 0)

    def test_sem_historico_ocupa_ate_dois_tercos_da_rodada(self):
        missing = self.rows(*range(100, 140))
        others = self.rows(*range(1, 50))
        out = [r["id"] for r in SYNC.pick([], [], missing, others, limit=30)]
        self.assertEqual(len(out), 30)
        self.assertEqual(out[:20], list(range(100, 120)), "20 de 30 para quem não tem histórico")
        self.assertEqual(out[20:], list(range(1, 11)), "o resto segue reconferindo as mais antigas")

    def test_prioridades_e_nunca_consultadas_vem_antes(self):
        out = [r["id"] for r in SYNC.pick(self.rows(7), self.rows(8, stamp=None), self.rows(100, 7, 101),
                                           self.rows(1, 8), limit=5)]
        self.assertEqual(out, [7, 8, 100, 101, 1])

    def test_sobrando_espaco_completa_com_mais_sem_historico(self):
        out = [r["id"] for r in SYNC.pick([], [], self.rows(*range(100, 110)), self.rows(1), limit=6)]
        self.assertEqual(out, [100, 101, 102, 103, 1, 104])

    def test_enrich_pega_primeiro_quem_esta_sem_historico(self):
        visitados = []
        def api(path):
            if path.endswith("/autores") or path.endswith("/relacionadas"):
                return {"dados": []}
            if path.endswith("/tramitacoes"):
                return {"dados": [{"dataHora": "2026-11-19T15:05", "sequencia": 1, "siglaOrgao": "MESA",
                                   "descricaoTramitacao": "Apresentação de Proposição"}]}
            id = int(path.rsplit("/", 1)[1])
            visitados.append(id)
            return {"dados": {"id": id, "statusProposicao": {"sequencia": 1}}}
        with patch.object(SYNC, "PRIORITY_IDS", []), patch.object(SYNC, "MAX_DETAILS", 3), \
             patch.object(SYNC, "tramitacoes_available", return_value=True), \
             patch.object(SYNC, "apensacao_available", return_value=False), \
             patch.object(SYNC, "pending_rows", return_value=self.rows(1, 2, 3)), \
             patch.object(SYNC, "missing_history_rows", return_value=self.rows(50, 51, 52)), \
             patch.object(SYNC, "api", side_effect=api), \
             patch.object(SYNC, "patch") as save, patch.object(SYNC.time, "sleep"):
            self.assertEqual(SYNC.enrich(), (3, True))
        self.assertEqual(visitados, [50, 51, 1])
        self.assertEqual(save.call_args_list[0].args[1]["tramitacoes_seq"], 1)


if __name__ == "__main__":
    unittest.main()


def page(ids):
    return {"dados": [{"id": i, "siglaTipo": "PL", "numero": i, "ano": 2026, "ementa": "E", "uri": "x"} for i in ids]}


class ListagemTests(unittest.TestCase):
    def run_lists(self, pages_by_kind, known):
        calls, written = [], []
        def api(path):
            calls.append(path)
            q = dict(urllib.parse.parse_qsl(path.split("?", 1)[1]))
            return pages_by_kind.get((q["siglaTipo"], int(q["ano"]), int(q["pagina"])), {"dados": []})
        with patch.object(SYNC, "api", side_effect=api), \
             patch.object(SYNC, "known_ids", side_effect=lambda ids: {i for i in ids if i in known}), \
             patch.object(SYNC, "ensure_rows", side_effect=lambda rows: written.extend(rows)), \
             patch.dict(SYNC.STATS, {"fichas_novas": 0}), \
             patch.object(SYNC.time, "sleep"):
            result = SYNC.lists()
            return result, calls, written, SYNC.STATS["fichas_novas"]

    def test_segue_paginando_ate_achar_pagina_conhecida(self):
        y = SYNC.dt.date.today().year
        pages = {("PL", y, 1): page(range(1000, 900, -1)), ("PL", y, 2): page(range(900, 800, -1)),
                 ("PL", y, 3): page(range(800, 700, -1))}
        known = set(range(700, 880))  # página 1 toda nova, 21 novas na 2 (880–900), página 3 toda conhecida
        (count, ok), calls, written, novas = self.run_lists(pages, known)
        self.assertTrue(ok)
        pl = [c for c in calls if "siglaTipo=PL&" in c and "ano=%d" % y in c]
        self.assertEqual(len(pl), 3, "para na primeira página toda conhecida")
        self.assertEqual(novas, 121)
        self.assertTrue(all(r["uri_oficial"] == SYNC.CAMARA + "/proposicoes/" + str(r["id"]) for r in written),
                        "uri_oficial num formato só")

    def test_limite_de_paginas_mesmo_com_tudo_novo(self):
        y = SYNC.dt.date.today().year
        pages = {("PL", y, n): page(range(10000 - 100 * n, 9900 - 100 * n, -1)) for n in range(1, 20)}
        with patch.object(SYNC, "MAX_LIST_PAGES", 3):
            _, calls, _, _ = self.run_lists(pages, set())
        self.assertEqual(len([c for c in calls if "siglaTipo=PL&" in c and "ano=%d" % y in c]), 3)

    def test_registro_da_execucao_nunca_derruba_o_robo(self):
        with patch.object(SYNC.urllib.request, "urlopen", side_effect=error(404)):
            SYNC.record_run("2026-11-19T00:00:00+00:00", 1, 2, True)  # não levanta

    def test_registro_envia_contadores(self):
        sent = []
        def fake(request, timeout=0):
            sent.append(json.loads(request.data))
            return Response({})
        with patch.object(SYNC.urllib.request, "urlopen", side_effect=fake), \
             patch.dict(SYNC.STATS, {"tramitacoes": 4, "textos_novos": 1, "fichas_novas": 7}):
            SYNC.record_run("2026-11-19T00:00:00+00:00", 35, 886, False, "Câmara fora")
        self.assertEqual({k: sent[0][k] for k in ("robo", "ok", "fichas", "listagens", "fichas_novas", "tramitacoes", "textos_novos", "erro")},
                         {"robo": "sync_supabase", "ok": False, "fichas": 35, "listagens": 886, "fichas_novas": 7,
                          "tramitacoes": 4, "textos_novos": 1, "erro": "Câmara fora"})


# Cadeia real (19/11/2026): PL 5/2025 → PL 254/2024 (também apensado) → raiz 2220112.
PL254 = {"id": 2417912, "siglaTipo": "PL", "numero": 254, "ano": 2024, "ementa": "Ementa do PL 254/2024",
         "uriPropPrincipal": "https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220112",
         "statusProposicao": {"descricaoSituacao": "Tramitando em Conjunto", "codSituacao": 925, "siglaOrgao": "CCJC"}}
RAIZ = {"id": 2220112, "siglaTipo": "PL", "numero": 2338, "ano": 2019, "ementa": "Ementa da raiz",
        "uriPropPrincipal": None,
        "statusProposicao": {"descricaoSituacao": "Pronta para Pauta", "codSituacao": 924, "siglaOrgao": "PLEN",
                             "dataHora": "2026-10-01T10:00"}}


class ApensacaoTests(unittest.TestCase):
    def api(self, calls):
        def fake(path):
            calls.append(path)
            return {"dados": {"/proposicoes/2417912": PL254, "/proposicoes/2220112": RAIZ}[path]}
        return fake

    def test_sobe_a_cadeia_ate_quem_conduz(self):
        calls = []
        detail = {"id": 2481000, "uriPropPrincipal": "https://dadosabertos.camara.leg.br/api/v2/proposicoes/2417912"}
        with patch.object(SYNC, "api", side_effect=self.api(calls)):
            out = SYNC.apensacao_changes(2481000, detail, {}, NOW)
        self.assertEqual(out["apensada_raiz_id"], 2220112)
        self.assertEqual(out["apensada_a"]["direta"]["numero"], 254)
        self.assertEqual(out["apensada_a"]["raiz"]["situacao"], "Pronta para Pauta")
        self.assertEqual(out["apensada_a"]["cadeia"], [2417912, 2220112])

    def test_sem_principal_nao_chama_nada_e_limpa_se_tinha(self):
        with patch.object(SYNC, "api", side_effect=AssertionError("sem chamada")):
            self.assertEqual(SYNC.apensacao_changes(1, {"uriPropPrincipal": None}, {}, NOW), {})
            self.assertEqual(SYNC.apensacao_changes(1, {}, {"apensada_a": {"raiz": {}}}, NOW),
                             {"apensada_a": None, "apensada_raiz_id": None})

    def test_ciclo_ou_cadeia_longa_para(self):
        loop = {"id": 10, "siglaTipo": "PL", "numero": 1, "ano": 2020,
                "uriPropPrincipal": "https://dadosabertos.camara.leg.br/api/v2/proposicoes/11"}
        loop2 = {**loop, "id": 11, "uriPropPrincipal": "https://dadosabertos.camara.leg.br/api/v2/proposicoes/10"}
        calls = []
        def fake(path):
            calls.append(path)
            return {"dados": {"/proposicoes/10": loop, "/proposicoes/11": loop2}[path]}
        with patch.object(SYNC, "api", side_effect=fake):
            out = SYNC.apensacao_changes(9, {"uriPropPrincipal": "https://dadosabertos.camara.leg.br/api/v2/proposicoes/10"}, {}, NOW)
        self.assertEqual(out["apensada_a"]["cadeia"], [10, 11])
        self.assertEqual(len(calls), 2)

    def test_enrich_grava_apensacao(self):
        row = {"id": 2481000, "situacao_atualizada_em": None, "dados_oficiais": {}}
        calls = []
        base = self.api(calls)
        def api(path):
            if path == "/proposicoes/2481000":
                return {"dados": {"id": 2481000, "uriPropPrincipal": "https://dadosabertos.camara.leg.br/api/v2/proposicoes/2417912",
                                  "statusProposicao": {"codSituacao": 925, "descricaoSituacao": "Tramitando em Conjunto"}}}
            if path.endswith("/autores"):
                return {"dados": []}
            return base(path)
        with patch.object(SYNC, "PRIORITY_IDS", []), \
             patch.object(SYNC, "tramitacoes_available", return_value=False), \
             patch.object(SYNC, "apensacao_available", return_value=True), \
             patch.object(SYNC, "pending_rows", return_value=[row]), \
             patch.object(SYNC, "missing_history_rows", return_value=[]), \
             patch.object(SYNC, "api", side_effect=api), \
             patch.object(SYNC, "patch") as save, \
             patch.object(SYNC.time, "sleep"):
            self.assertEqual(SYNC.enrich(), (1, True))
        self.assertEqual(save.call_args.args[1]["apensada_raiz_id"], 2220112)
