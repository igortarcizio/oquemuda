"""Robô de votações: sem rede, banco ou credenciais reais. Dados no formato da API da Câmara."""
import importlib.util
import io
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "fake-test-only")

SPEC = importlib.util.spec_from_file_location(
    "votacoes_under_test", pathlib.Path(__file__).resolve().parents[1] / "scripts" / "sync_votacoes.py")
VOT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VOT)


def dep(id, nome, partido, uf):
    return {"id": id, "nome": nome, "siglaPartido": partido, "siglaUf": uf}


# Recortes reais (PLP 80/2026, PL 4921/2026 e PL 1625/2026).
VOTACOES = [
    {"id": "2611992-28", "dataHoraRegistro": "2026-08-12T19:13:31", "siglaOrgao": "PLEN", "aprovacao": 1,
     "descricao": "Aprovada a Redação Final assinada pelo relator, Dep. Júnior Ferrari (PSD/PA)."},
    {"id": "2611992-24", "dataHoraRegistro": "2026-08-12T19:11:36", "siglaOrgao": "PLEN", "aprovacao": 1,
     "descricao": "Aprovado o Substitutivo ao Projeto de Lei Complementar nº 80, de 2026, adotado pelo relator da "
                  "Comissão de Finanças e Tributação. Sim: 327; Não: 26; Total: 353."},
    {"id": "2624620-7", "dataHoraRegistro": "2026-06-09T17:00:46", "siglaOrgao": "PLEN", "aprovacao": 1,
     "descricao": "Aprovado, por unanimidade, o Requerimento de Urgência (Art. 155 do RICD)."},
]
VOTOS = [
    {"tipoVoto": "Sim", "deputado_": dep(1, "Zeca", "PT", "RJ")},
    {"tipoVoto": "Não", "deputado_": dep(2, "Ana", "NOVO", "DF")},
    {"tipoVoto": "Sim", "deputado_": dep(3, "Ádila", "PL", "DF")},
    {"tipoVoto": "Artigo 17", "deputado_": dep(4, "Hugo Motta", "REPUBLICANOS", "PB")},
]
ORIENTACOES = [{"siglaPartidoBloco": "PL", "orientacaoVoto": "Sim"}, {"siglaPartidoBloco": "DC", "orientacaoVoto": ""},
               {"siglaPartidoBloco": "NOVO", "orientacaoVoto": "Não"}]


class TipoTests(unittest.TestCase):
    def test_o_que_foi_votado(self):
        t = VOT.tipo_votacao
        self.assertEqual(t(VOTACOES[1]["descricao"]), "texto")
        self.assertEqual(t(VOTACOES[0]["descricao"]), "texto")
        self.assertEqual(t("Aprovado o Projeto de Lei nº 4.921, de 2026."), "texto")
        self.assertEqual(t("Aprovado o Parecer."), "texto")
        self.assertEqual(t("Aprovada a Subemenda Substitutiva ao Projeto de Lei nº 1.625, de 2026, ressalvados os destaques."), "texto")
        self.assertEqual(t("Aprovada a Proposta de Emenda à Constituição nº 45, de 2019, em primeiro turno. Sim: 380; Não: 110."), "texto")
        self.assertEqual(t("Aprovado o Requerimento de Urgência (Art. 155 do RICD). Sim: 320; Não: 67; Abstenção: 1; Total: 388."), "urgencia")
        self.assertEqual(t("Rejeitada a Emenda de Plenário nº 2. Sim: 196; Não: 200; Abstenção: 1; Total: 397."), "emenda")
        self.assertEqual(t("Rejeitado o Requerimento. Sim: 115; Não: 313; Total: 428."), "requerimento")
        self.assertEqual(t("Mantido o texto."), "outra")
        self.assertEqual(t("Resultado. Sim: 182; Não: 182; Abstenção: 2; Total: 366."), "outra")


class ResumoTests(unittest.TestCase):
    def test_nominal_do_texto_guarda_votos_e_orientacoes(self):
        r = VOT.resumo(VOTACOES[1], VOTOS, ORIENTACOES)
        self.assertTrue(r["nominal"])
        self.assertEqual(r["placar"], {"sim": 2, "nao": 1, "abstencao": 0, "obstrucao": 0, "art17": 1, "total": 4})
        self.assertEqual([v[1] for v in r["votos"]], ["Ádila", "Ana", "Hugo Motta", "Zeca"], "ordem alfabética, sem acento")
        self.assertEqual(r["votos"][1], [2, "Ana", "NOVO", "DF", "Não"])
        self.assertEqual(r["orientacoes"], [["PL", "Sim"], ["NOVO", "Não"]], "sem orientação vazia")
        self.assertEqual((r["data"], r["orgao"], r["aprovacao"]), ("2026-08-12T19:11", "PLEN", 1))

    def test_nominal_que_nao_e_do_texto_guarda_so_o_placar(self):
        v = {"id": "x", "descricao": "Aprovado o Requerimento de Urgência. Sim: 2; Não: 1.", "siglaOrgao": "PLEN"}
        r = VOT.resumo(v, VOTOS, ORIENTACOES)
        self.assertEqual(r["tipo"], "urgencia")
        self.assertEqual(r["placar"]["total"], 4)
        self.assertNotIn("votos", r)
        self.assertNotIn("orientacoes", r)

    def test_simbolica(self):
        r = VOT.resumo(VOTACOES[0], [], [])
        self.assertEqual((r["tipo"], r["nominal"]), ("texto", False))
        self.assertNotIn("placar", r)


class ConsultaTests(unittest.TestCase):
    def test_so_pede_votos_quando_pode_haver(self):
        chamadas = []
        def api(path):
            chamadas.append(path)
            if path.endswith("/votacoes"):
                return {"dados": VOTACOES}
            if path == "/votacoes/2611992-24/votos":
                return {"dados": VOTOS}
            if path == "/votacoes/2611992-24/orientacoes":
                return {"dados": ORIENTACOES}
            if path.endswith("/votos"):
                return {"dados": []}
            raise AssertionError(path)
        with patch.object(VOT.SYNC, "api", side_effect=api):
            out = VOT.votacoes_da_proposta(2611992)
        self.assertEqual([v["id"] for v in out], ["2611992-28", "2611992-24", "2624620-7"], "mais recente primeiro")
        self.assertNotIn("/votacoes/2624620-7/votos", chamadas, "urgência sem placar na descrição: nem pergunta")
        self.assertIn("/votacoes/2611992-28/votos", chamadas, "texto: confere se foi simbólica")
        self.assertEqual(sum(1 for c in chamadas if c.endswith("/orientacoes")), 1)
        self.assertFalse(out[0]["nominal"])
        self.assertTrue(out[1]["nominal"])

    def test_alvos_so_com_movimentacao_nova(self):
        rows = [{"id": 1, "tramitacoes_seq": 5, "votacoes_seq": None}, {"id": 2, "tramitacoes_seq": 5, "votacoes_seq": 5},
                {"id": 3, "tramitacoes_seq": 7, "votacoes_seq": 5}, {"id": 4, "tramitacoes_seq": 0, "votacoes_seq": 0}]
        with patch.object(VOT.SYNC, "read_json", return_value=rows):
            self.assertEqual([r["id"] for r in VOT.alvos()], [1, 3])

    def test_alvos_por_id_ignora_sequencia(self):
        rows = [{"id": 2, "tramitacoes_seq": 5, "votacoes_seq": 5}]
        with patch.object(VOT, "IDS", [2, 7]), patch.object(VOT.SYNC, "read_json", return_value=rows) as rj:
            self.assertEqual(VOT.alvos(), rows)
        self.assertIn("id=in.%282%2C7%29", rj.call_args[0][0])


class MainTests(unittest.TestCase):
    def setUp(self):
        VOT.PARAR.clear()

    def run_main(self, rows, api):
        saida = tempfile.NamedTemporaryFile("w+", delete=False)
        saida.close()
        gravados = {}
        with patch.object(VOT, "alvos", return_value=rows), patch.object(VOT.SYNC, "api", side_effect=api), \
             patch.object(VOT.SYNC, "patch", side_effect=lambda id, p: gravados.__setitem__(id, p)), \
             patch.object(VOT, "PAUSA", 0), patch.object(VOT, "TRABALHADORES", 1), \
             patch.dict(os.environ, {"GITHUB_OUTPUT": saida.name}), patch("sys.stdout", new_callable=io.StringIO):
            try:
                VOT.main()
                code = 0
            except SystemExit as exc:
                code = exc.code
        with open(saida.name, encoding="utf-8") as f:
            out = f.read()
        os.unlink(saida.name)
        return gravados, out, code

    def test_grava_lista_e_sequencia(self):
        rows = [{"id": 10, "tramitacoes_seq": 9}, {"id": 11, "tramitacoes_seq": 3}]
        api = lambda p: {"dados": []}
        gravados, out, code = self.run_main(rows, api)
        self.assertEqual(gravados[10], {"votacoes": [], "votacoes_seq": 9})
        self.assertEqual(code, 0)
        self.assertIn("continuar=nao", out)

    def test_camara_fora_do_ar_sem_avanco_nao_insiste(self):
        def api(p):
            raise RuntimeError("API da Câmara indisponível após 3 tentativas (HTTP 503)")
        gravados, out, code = self.run_main([{"id": 10, "tramitacoes_seq": 9}], api)
        self.assertEqual((gravados, code), ({}, 2))
        self.assertIn("continuar=nao", out)


if __name__ == "__main__":
    unittest.main()
