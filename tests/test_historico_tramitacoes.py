"""Carga do histórico de movimentações: sem rede, banco ou credenciais reais."""
import importlib.util
import io
import os
import pathlib
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "fake-test-only")

SPEC = importlib.util.spec_from_file_location(
    "historico_under_test", pathlib.Path(__file__).resolve().parents[1] / "scripts" / "historico_tramitacoes.py")
HIST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HIST)


def tram(seq):
    return {"dataHora": "2026-11-19T15:05", "sequencia": seq, "siglaOrgao": "MESA",
            "descricaoTramitacao": "Apresentação de Proposição"}


class CargaTests(unittest.TestCase):
    def run_main(self, filas, api, **env):
        saida = tempfile.NamedTemporaryFile("w+", delete=False)
        saida.close()
        gravados = {}
        def fila(antes_de=None, lote=HIST.LOTE):
            return list(filas.pop(0)) if filas else []
        with patch.object(HIST, "fila", side_effect=fila), \
             patch.object(HIST.SYNC, "api", side_effect=api), \
             patch.object(HIST.SYNC, "patch", side_effect=lambda id, p: gravados.__setitem__(id, p)), \
             patch.object(HIST, "PAUSA", 0), \
             patch.dict(os.environ, {"GITHUB_OUTPUT": saida.name}), \
             patch("sys.stdout", new_callable=io.StringIO) as stdout:
            for k, v in env.items():
                setattr(HIST, k, v)
            try:
                HIST.main()
                code = 0
            except SystemExit as exc:
                code = exc.code
        self.stdout = stdout.getvalue()
        with open(saida.name, encoding="utf-8") as f:
            out = f.read()
        os.unlink(saida.name)
        return gravados, out, code

    def test_grava_historico_e_marca_quem_nao_tem_movimentacao(self):
        def api(path):
            id = int(path.split("/")[2])
            if id == 3:
                raise urllib.error.HTTPError(path, 404, "nao achou", {}, None)
            return {"dados": [] if id == 2 else [tram(1), tram(5)]}
        gravados, out, code = self.run_main([[1, 2, 3], []], api, PRAZO_MINUTOS=10, LIMITE=0)
        self.assertEqual(code, 0)
        self.assertEqual(gravados[1]["tramitacoes_seq"], 5)
        self.assertEqual(gravados[2], {"tramitacoes": [], "tramitacoes_seq": 0})
        self.assertEqual(gravados[3], {"tramitacoes": [], "tramitacoes_seq": 0})
        self.assertIn("continuar=nao", out)

    def test_falha_isolada_pula_e_segue(self):
        def api(path):
            if path.startswith("/proposicoes/2/"):
                raise ValueError("resposta estranha")
            return {"dados": [tram(1)]}
        gravados, out, code = self.run_main([[1, 2, 3], []], api, PRAZO_MINUTOS=10, LIMITE=0)
        self.assertEqual(sorted(gravados), [1, 3])
        self.assertEqual(code, 0)

    def test_camara_fora_do_ar_para_sem_disparar_proxima(self):
        def api(path):
            raise RuntimeError("API da Câmara indisponível após 3 tentativas (HTTP 503)")
        gravados, out, code = self.run_main([[1, 2], [3]], api, PRAZO_MINUTOS=10, LIMITE=0)
        self.assertEqual(gravados, {})
        self.assertEqual(code, 2)
        self.assertIn("continuar=nao", out)

    def test_instabilidade_depois_de_avancar_retoma_apos_pausa(self):
        chamadas = {"n": 0}
        def api(path):
            chamadas["n"] += 1
            if path.startswith("/proposicoes/3/"):
                raise RuntimeError("API da Câmara indisponível após 3 tentativas (TimeoutError)")
            return {"dados": [tram(1)]}
        gravados, out, code = self.run_main([[1, 2], [3], [4]], api, PRAZO_MINUTOS=10, LIMITE=0)
        self.assertEqual(sorted(gravados), [1, 2])
        self.assertEqual(code, 2)
        self.assertIn("continuar=sim", out)
        self.assertIn("pausa=300", out)

    def test_prazo_esgotado_com_fila_pede_proxima_rodada(self):
        filas = [[1, 2], [3, 4], [5]]
        relogio = iter([0, 0, 10**6, 10**6, 10**6])
        with patch.object(HIST.time, "monotonic", side_effect=lambda: next(relogio)):
            gravados, out, code = self.run_main(filas, lambda p: {"dados": [tram(1)]}, PRAZO_MINUTOS=1, LIMITE=0)
        self.assertEqual(sorted(gravados), [1, 2])
        self.assertIn("continuar=sim", out)

    def test_limite_manual_nao_dispara_proxima(self):
        gravados, out, code = self.run_main([[1, 2, 3], [4, 5]], lambda p: {"dados": [tram(1)]},
                                            PRAZO_MINUTOS=10, LIMITE=2)
        self.assertEqual(sorted(gravados), [1, 2])
        self.assertNotIn("Fila zerada", self.stdout)
        self.assertIn("continuar=nao", out)


if __name__ == "__main__":
    unittest.main()
