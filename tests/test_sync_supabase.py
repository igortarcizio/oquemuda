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
             patch.object(SYNC, "pending_rows", return_value=[row]), \
             patch.object(SYNC, "api", side_effect=fake_api), \
             patch.object(SYNC, "patch") as save, \
             patch.object(SYNC.time, "sleep"):
            self.assertEqual(SYNC.enrich(), (1, True))
            self.assertEqual(save.call_args.args[1]["situacao_codigo"], 924)
            self.assertEqual(save.call_args.args[1]["situacao_descricao"], "Pronta para Pauta")


if __name__ == "__main__":
    unittest.main()
