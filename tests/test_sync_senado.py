"""Robô do Senado: sem rede, banco ou credenciais reais. Dados no formato da API /processo."""
import datetime as dt
import importlib.util
import io
import os
import pathlib
import unittest
import urllib.error
from unittest.mock import patch

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "fake-test-only")

SPEC = importlib.util.spec_from_file_location(
    "senado_under_test", pathlib.Path(__file__).resolve().parents[1] / "scripts" / "sync_senado.py")
SEN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SEN)

AGORA = dt.datetime(2026, 11, 23, 18, 0, tzinfo=dt.timezone.utc)
CCJ = {"casa": "SF", "codigo": 34, "nome": "Comissão de Constituição, Justiça e Cidadania", "sigla": "CCJ"}

# PL 2391/2026 (resumo real de 23/11/2026): na CCJ, aguardando relator.
NA_CCJ = {
    "id": 9056488, "codigoMateria": 174389, "identificacao": "PL 2391/2026", "objetivo": "Revisora",
    "tramitando": "Sim", "situacaoAtual": "AGUARDANDO DESIGNAÇÃO DO RELATOR", "siglaSituacaoAtual": "AGDREL",
    "dataSituacaoAtual": "2026-06-08",
    "autuacoes": [{"numero": 1, "descricao": "Autuação Principal",
                   "situacoes": [{"descricao": "MATÉRIA DESPACHADA", "colegiado": {"sigla": "PLEN", "nome": "Plenário do Senado Federal"}},
                                 {"descricao": "AGUARDANDO DESIGNAÇÃO DO RELATOR", "colegiado": CCJ}],
                   "informesLegislativos": [
                       {"data": "2026-08-19 18:18:05", "descricao": "Recebida a Emenda nº 2,\r\n de autoria do Senador X.", "colegiado": CCJ},
                       {"data": "2026-06-08 08:07:04", "descricao": "Matéria aguardando distribuição.", "colegiado": CCJ},
                       {"data": "2026-06-09 10:00:00", "descricao": "   ", "colegiado": {}}]}],
}
# PL 1881/2025: a Câmara ainda dizia "Aguardando sanção", mas já era a Lei 15.500.
VIROU_LEI = {
    "id": 8947603, "codigoMateria": 171475, "identificacao": "PL 1881/2025", "objetivo": "Revisora",
    "tramitando": "Não", "situacaoAtual": "TRANSFORMADA EM NORMA JURÍDICA COM VETO PARCIAL",
    "siglaSituacaoAtual": "TNJRVETO", "dataSituacaoAtual": "2026-09-04",
    "deliberacao": {"data": "2026-08-11", "destino": "À sanção", "tipoDeliberacao": "Aprovada pelo Plenário"},
    "normaGerada": {"descricao": "Lei nº 15.500 de 04/09/2026", "dataPublicacao": "2026-09-04",
                    "observacao": "Esta Lei entra em vigor 45 dias após a sua publicação oficial."},
    "autuacoes": [{"numero": 1, "situacoes": [{"descricao": "TRANSFORMADA EM NORMA JURÍDICA COM VETO PARCIAL", "colegiado": {}}],
                   "informesLegislativos": [{"data": "2026-09-04 12:00:00", "descricao": "SANCIONADA. LEI 15500 DE 2026.", "colegiado": {}}]}],
}
RELATORIAS = [
    {"nomeParlamentar": "Fabiano Contarato", "formaTratamentoParlamentar": "Senador", "siglaPartidoParlamentar": "PT",
     "ufParlamentar": "ES", "siglaColegiado": "CCJ", "nomeColegiado": "Comissão de Constituição, Justiça e Cidadania",
     "dataDesignacao": "2026-08-10 14:45:00", "dataDestituicao": "2026-08-11 06:59:00", "casaRelator": "SF"},
    {"nomeParlamentar": "Fulana de Tal", "formaTratamentoParlamentar": "Senadora", "siglaPartidoParlamentar": "MDB",
     "ufParlamentar": "PA", "siglaColegiado": "CAS", "nomeColegiado": "Comissão de Assuntos Sociais",
     "dataDesignacao": "2026-09-01 10:00:00", "dataDestituicao": None, "casaRelator": "SF"},
]


class ResumoTests(unittest.TestCase):
    def test_na_comissao(self):
        s = SEN.resumo(NA_CCJ, [], AGORA.isoformat())
        self.assertTrue(s["encontrado"] and s["tramitando"])
        self.assertEqual(s["url"], "https://www25.senado.leg.br/web/atividade/materias/-/materia/174389")
        self.assertEqual(s["situacao"], {"descricao": "AGUARDANDO DESIGNAÇÃO DO RELATOR", "sigla": "AGDREL", "data": "2026-06-08"})
        self.assertEqual(s["local"], {"sigla": "CCJ", "nome": "Comissão de Constituição, Justiça e Cidadania"})
        self.assertIsNone(s["relator"])
        self.assertIsNone(s["norma"])
        # Ordem cronológica, sem quebra de linha e sem movimentação vazia.
        self.assertEqual([m["data"] for m in s["movimentacoes"]], ["2026-06-08T08:07", "2026-08-19T18:18"])
        self.assertEqual(s["movimentacoes"][1]["descricao"], "Recebida a Emenda nº 2, de autoria do Senador X.")

    def test_virou_lei(self):
        s = SEN.resumo(VIROU_LEI, [], AGORA.isoformat())
        self.assertFalse(s["tramitando"])
        self.assertEqual(s["norma"]["descricao"], "Lei nº 15.500 de 04/09/2026")
        self.assertEqual(s["deliberacao"], {"tipo": "Aprovada pelo Plenário", "destino": "À sanção", "data": "2026-08-11"})
        self.assertIsNone(s["local"])

    def test_relator_atual_ignora_quem_saiu(self):
        r = SEN.relator_atual(RELATORIAS)
        self.assertEqual((r["nome"], r["partido"], r["uf"], r["colegiado"], r["desde"]),
                         ("Fulana de Tal", "MDB", "PA", "CAS", "2026-09-01"))
        self.assertIsNone(SEN.relator_atual(RELATORIAS[:1]))

    def test_escolhe_a_mesma_identificacao(self):
        lista = [{"id": 1, "identificacao": "PL 23/2026", "tramitando": "Sim"},
                 {"id": 2, "identificacao": "PL 2391/2026", "tramitando": "Não", "dataApresentacao": "2026-05-28"},
                 {"id": 3, "identificacao": "PL 2391/2026", "tramitando": "Sim", "dataApresentacao": "2026-05-28"}]
        self.assertEqual(SEN.escolher(lista, "PL", 2391, 2026)["id"], 3)
        self.assertIsNone(SEN.escolher(lista[:1], "PL", 2391, 2026))
        self.assertIsNone(SEN.escolher([], "PL", 2391, 2026))


class AtualizarTests(unittest.TestCase):
    def setUp(self):
        SEN.PARAR.clear()

    def run_one(self, row, respostas):
        chamadas, gravado = [], {}
        def api(path):
            chamadas.append(path)
            for prefixo, resposta in respostas.items():
                if path.startswith(prefixo):
                    if isinstance(resposta, Exception):
                        raise resposta
                    return resposta
            raise AssertionError("chamada inesperada: " + path)
        with patch.object(SEN, "api", side_effect=api), \
             patch.object(SEN, "patch", side_effect=lambda id, p: gravado.update(p)), \
             patch.object(SEN, "PAUSA", 0):
            resultado = SEN.atualizar(row, AGORA)
        return resultado, chamadas, gravado

    def test_primeira_vez_procura_pela_identificacao(self):
        row = {"id": 10, "sigla_tipo": "PL", "numero": 2391, "ano": 2026, "senado": None}
        resultado, chamadas, gravado = self.run_one(row, {
            "/processo?": [{"id": 9056488, "identificacao": "PL 2391/2026", "tramitando": "Sim"}],
            "/processo/relatoria": [],
            "/processo/9056488": NA_CCJ})
        self.assertEqual(resultado, "tramitando")
        self.assertEqual(chamadas[0], "/processo?sigla=PL&numero=2391&ano=2026")
        self.assertEqual(gravado["senado"]["id"], 9056488)
        self.assertEqual(gravado["senado_atualizado_em"], AGORA.isoformat())

    def test_depois_usa_o_id_gravado(self):
        row = {"id": 10, "sigla_tipo": "PL", "numero": 2391, "ano": 2026,
               "senado": {"encontrado": True, "id": 9056488, "tramitando": True}}
        resultado, chamadas, _ = self.run_one(row, {"/processo/relatoria": RELATORIAS, "/processo/9056488": NA_CCJ})
        self.assertNotIn("/processo?sigla=PL&numero=2391&ano=2026", chamadas)
        self.assertEqual(resultado, "tramitando")

    def test_senado_ainda_nao_registrou(self):
        row = {"id": 11, "sigla_tipo": "PLP", "numero": 139, "ano": 2026, "senado": None}
        resultado, _, gravado = self.run_one(row, {"/processo?": []})
        self.assertEqual(resultado, "nao_encontrada")
        self.assertEqual(gravado["senado"], {"encontrado": False, "consultado_em": AGORA.isoformat()})

    def test_encerrada_ha_pouco_nao_consulta_de_novo(self):
        row = {"id": 12, "sigla_tipo": "PL", "numero": 1881, "ano": 2025,
               "senado": {"encontrado": True, "id": 8947603, "tramitando": False,
                          "consultado_em": (AGORA - dt.timedelta(days=2)).isoformat()}}
        resultado, chamadas, gravado = self.run_one(row, {})
        self.assertEqual((resultado, chamadas, gravado), ("pulada", [], {}))
        row["senado"]["consultado_em"] = (AGORA - dt.timedelta(days=8)).isoformat()
        resultado, _, gravado = self.run_one(row, {"/processo/relatoria": [], "/processo/8947603": VIROU_LEI})
        self.assertEqual(resultado, "encerrada")
        self.assertEqual(gravado["senado"]["norma"]["descricao"], "Lei nº 15.500 de 04/09/2026")

    def test_relatoria_fora_do_ar_nao_impede_o_resto(self):
        row = {"id": 10, "sigla_tipo": "PL", "numero": 2391, "ano": 2026,
               "senado": {"encontrado": True, "id": 9056488, "tramitando": True}}
        erro = urllib.error.HTTPError("x", 404, "nao achou", {}, None)
        resultado, _, gravado = self.run_one(row, {"/processo/relatoria": erro, "/processo/9056488": NA_CCJ})
        self.assertEqual(resultado, "tramitando")
        self.assertIsNone(gravado["senado"]["relator"])

    def test_senado_fora_do_ar_para_tudo(self):
        rows = [{"id": i, "sigla_tipo": "PL", "numero": i, "ano": 2026, "senado": None} for i in range(1, 6)]
        with patch.object(SEN, "alvos", return_value=rows), \
             patch.object(SEN, "api", side_effect=RuntimeError("API do Senado indisponível após 3 tentativas (HTTP 503)")), \
             patch.object(SEN, "patch") as save, patch.object(SEN, "TRABALHADORES", 1), \
             patch("sys.stdout", new_callable=io.StringIO):
            with self.assertRaises(SystemExit) as fim:
                SEN.main()
        self.assertEqual(fim.exception.code, 2)
        save.assert_not_called()


if __name__ == "__main__":
    unittest.main()
