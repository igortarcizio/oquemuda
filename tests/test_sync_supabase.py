"""Testes isolados: sem rede, banco ou credenciais reais."""
import importlib.util
import json
import os
import pathlib
import unittest
import urllib.error
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
             patch.object(SYNC, "pending_rows", return_value=[row]), \
             patch.object(SYNC, "api", side_effect=fake_api), \
             patch.object(SYNC, "patch") as save, \
             patch.object(SYNC.time, "sleep"):
            self.assertEqual(SYNC.enrich(), (1, True))
            self.assertEqual(save.call_args.args[1]["situacao_codigo"], 924)
            self.assertEqual(save.call_args.args[1]["situacao_descricao"], "Pronta para Pauta")


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
             patch.object(SYNC, "pending_rows", return_value=[row]), \
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
             patch.object(SYNC, "pending_rows", return_value=[row]), \
             patch.object(SYNC, "api", side_effect=api), \
             patch.object(SYNC, "patch") as save, \
             patch.object(SYNC.time, "sleep"):
            self.assertEqual(SYNC.enrich(), (1, True))
        self.assertEqual(save.call_args.args[1]["situacao_codigo"], 924)
        self.assertNotIn("tramitacoes", save.call_args.args[1])

    def test_sem_migration_o_sincronizador_segue_sem_as_colunas(self):
        with patch.object(SYNC, "read_json", side_effect=error(400)):
            self.assertFalse(SYNC.tramitacoes_available())


if __name__ == "__main__":
    unittest.main()
