"""Evita duplicação de identificação oficial na importação anual sem rede."""
import importlib.util
import os
import pathlib
import unittest
from unittest.mock import patch

os.environ.setdefault("SUPABASE_URL","https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY","fake-only")
spec=importlib.util.spec_from_file_location(
    "bulk",pathlib.Path(__file__).resolve().parents[1]/"scripts"/"sync_bulk.py")
bulk=importlib.util.module_from_spec(spec)
spec.loader.exec_module(bulk)

class BulkTests(unittest.TestCase):
    def test_ignores_different_id_with_same_official_number(self):
        indexed={"2652463":{"id":2652463,"sigla_tipo":"PL","numero":1,
                            "ano":2026,"ementa":"Registro existente"}}
        candidates=[
            {"id":"2600001","siglaTipo":"PL","numero":"1","ano":"2026",
             "ementa":"Projeto oficial com número duplicado","dataApresentacao":"2026-02-01"},
            {"id":"2600002","siglaTipo":"PL","numero":"2","ano":"2026",
             "ementa":"Garante atenção à saúde dos cidadãos","dataApresentacao":"2026-02-01"}]
        with patch.object(bulk,"parse_csv",return_value=iter(candidates)):
            proposals,ok=bulk.proposal_csv(2026,indexed)
        self.assertTrue(ok)
        self.assertNotIn("2600001",indexed)
        self.assertIn("2600002",indexed)
        self.assertEqual(len(proposals),1)

if __name__=="__main__":
    unittest.main()
