"""Teste da política de relevância sem acesso real a rede ou credenciais."""
import datetime as dt
import importlib.util
import os
from pathlib import Path
import unittest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "fake-for-tests")
p = Path(__file__).resolve().parents[1] / "scripts" / "selecionar_destaques.py"
spec = importlib.util.spec_from_file_location("selector", p)
selector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selector)

PREVIOUS = [
    {"posicao":1,"proposicao_id":11,"selecionado_em":"2026-11-10T12:00:00Z"},
    {"posicao":2,"proposicao_id":12,"selecionado_em":"2026-11-10T12:00:00Z"},
    {"posicao":3,"proposicao_id":13,"selecionado_em":"2026-11-10T12:00:00Z"},
]
TODAY = dt.datetime(2026,11,11,6,0,tzinfo=dt.timezone.utc)
def proposal(id, date="2026-11-11", ementa=None):
    return {"id":id,"sigla_tipo":"PL","ano":2026,"data_apresentacao":date,
            "ementa":ementa or "Assegura às pessoas e famílias acesso a tratamento médico especializado no SUS e estabelece regras para assistência e transporte aos pacientes.",
            "situacao_codigo":907}

class SelectorTests(unittest.TestCase):
    def test_stays_unchanged_without_new_proposal(self):
        self.assertEqual(selector.choose(PREVIOUS,[proposal(55,"2026-11-10")],TODAY),[])
        self.assertEqual(selector.choose(PREVIOUS,[],TODAY),[])

    def test_one_qualified_proposal_rotates_one_slot(self):
        new=selector.choose(PREVIOUS,[proposal(55)],TODAY)
        self.assertEqual([x["proposicao_id"] for x in new],[55,11,12])

    def test_rejects_symbolic_or_poorly_described_proposals(self):
        p=proposal(77,ementa="Denomina Hospital do SUS de Professor José, em homenagem às pessoas da comunidade e assegura reconhecimento solene.")
        self.assertIsNone(selector.relevance(p))
        self.assertEqual(selector.choose(PREVIOUS,[p],TODAY),[])

    def test_new_candidate_on_same_calendar_day_is_not_lost(self):
        rows=[dict(p) for p in PREVIOUS]
        rows[0]["candidatos_avaliados"]=[77]
        existing=proposal(77,"2026-11-10")
        new=proposal(88,"2026-11-10")
        selection=selector.choose(rows,[existing,new],TODAY)
        self.assertEqual(selection[0]["proposicao_id"],88)
        self.assertEqual(selection[0]["candidatos_avaliados"],[77,88])
        rows[0]["candidatos_avaliados"]=[77,88]
        self.assertEqual(selector.choose(rows,[existing,new],TODAY),[])

    def test_promocao_da_saude_nao_e_mocao(self):
        p=proposal(101,ementa="Institui política de promoção da saúde e assegura aos pacientes e suas famílias acesso gratuito a medicamentos essenciais na rede pública de saúde.")
        self.assertIsNotNone(selector.relevance(p))

    def test_ignores_party_affiliation_and_selects_across_subjects(self):
        health=proposal(55)
        education=proposal(66,ementa="Assegura às crianças e aos estudantes o acesso gratuito à educação pública e estabelece medidas para apoiar famílias e professores na escola.")
        selection=selector.choose(PREVIOUS,[health,education],TODAY)
        self.assertEqual(set(x["proposicao_id"] for x in selection[:2]),{55,66})

if __name__=="__main__":
    unittest.main()
