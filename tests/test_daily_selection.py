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

def ids(rows):
    return [r["proposicao_id"] for r in rows]

def staged(id, code, when="2026-11-09T10:00:00", ementa=None, tipo="PL"):
    return {"id":id,"sigla_tipo":tipo,"situacao_codigo":code,"etapa_em":when,
            "ementa":ementa or "Altera a Lei nº 13.667 para garantir atenção especial às mães solo e aos trabalhadores no Sistema Nacional de Emprego."}

EDUCATION="Assegura às crianças e aos estudantes o acesso gratuito à educação pública e estabelece medidas para apoiar famílias e professores na escola."
CONSUMO="Estabelece regras de proteção ao consumidor contra fraude bancária e superendividamento das famílias, com ressarcimento aos idosos."

class NewProposalTests(unittest.TestCase):
    """A posição de proposta nova mantém a política de antes: só troca com novidade."""
    def test_keeps_previous_new_without_novelty(self):
        rows=selector.compose(PREVIOUS,[proposal(55,"2026-11-10")],[],[],TODAY)
        self.assertEqual(ids(rows)[2],11)

    def test_rejects_symbolic_or_poorly_described_proposals(self):
        p=proposal(77,ementa="Denomina Hospital do SUS de Professor José, em homenagem às pessoas da comunidade e assegura reconhecimento solene.")
        self.assertIsNone(selector.relevance(p))
        self.assertEqual(selector.fresh_new(PREVIOUS,[p]),[])

    def test_new_candidate_on_same_calendar_day_is_not_lost(self):
        rows=[dict(p) for p in PREVIOUS]
        rows[0]["candidatos_avaliados"]=[77]
        existing=proposal(77,"2026-11-10")
        new=proposal(88,"2026-11-10")
        self.assertEqual([i for i,_ in selector.fresh_new(rows,[existing,new])],[88])
        selection=selector.compose(rows,[existing,new],[],[],TODAY)
        self.assertIn(88,ids(selection))
        self.assertEqual(selection[0]["candidatos_avaliados"],[77,88])
        rows[0]["candidatos_avaliados"]=[77,88]
        self.assertEqual(selector.fresh_new(rows,[existing,new]),[])

    def test_promocao_da_saude_nao_e_mocao(self):
        p=proposal(101,ementa="Institui política de promoção da saúde e assegura aos pacientes e suas famílias acesso gratuito a medicamentos essenciais na rede pública de saúde.")
        self.assertIsNotNone(selector.relevance(p))

    def test_new_proposals_come_from_different_subjects(self):
        fresh=selector.fresh_new(PREVIOUS,[proposal(55),proposal(56),proposal(66,ementa=EDUCATION)])
        self.assertEqual({t for _,t in fresh},{"Saúde","Educação"})

class StageTests(unittest.TestCase):
    def test_three_stages_in_order(self):
        rows=selector.compose(PREVIOUS,[proposal(55)],[staged(200,924)],[staged(300,926,ementa=CONSUMO)],TODAY)
        self.assertEqual(ids(rows),[200,300,55])
        self.assertEqual([r["criterio"] for r in rows],["etapa_pauta_v2","etapa_aprovada_v2","etapa_nova_v2"])

    def test_law_counts_as_approved(self):
        rows=selector.compose(PREVIOUS,[],[],[staged(301,1140)],TODAY)
        self.assertEqual(ids(rows)[1],301)
        self.assertEqual(rows[1]["criterio"],"etapa_aprovada_v2")

    def test_routine_acts_never_fill_a_stage(self):
        radio=staged(400,926,tipo="PDL",ementa="Aprova o ato que renova a permissão outorgada à Rádio Mundial FM Ltda. para executar serviço de radiodifusão sonora no Município de Ijuí.")
        honor=staged(401,926,ementa="Inclui no Calendário Turístico Oficial do Brasil o Festival de Inverno de Pedro II, realizado no Município de Pedro II, Estado do Piauí.")
        credit=staged(402,1140,tipo="MPV",ementa="Abre crédito extraordinário, em favor do Ministério da Integração e do Desenvolvimento Regional, no valor de R$ 300.000.000,00.")
        for p in (radio,honor,credit):
            self.assertIsNone(selector.stage_relevance(p))
        rows=selector.compose(PREVIOUS,[],[],[radio,honor,credit],TODAY)
        self.assertNotIn(400,ids(rows));self.assertNotIn(401,ids(rows));self.assertNotIn(402,ids(rows))

    def test_recent_movement_wins_over_old_within_window(self):
        old=staged(500,924,when="2026-10-01T10:00:00")
        new=staged(501,924,when="2026-11-10T10:00:00")
        self.assertEqual(ids(selector.compose(PREVIOUS,[],[old,new],[],TODAY))[0],501)

    def test_uses_reserve_window_when_short_window_is_empty(self):
        old=staged(500,924,when="2026-10-01T10:00:00")
        self.assertEqual(ids(selector.compose(PREVIOUS,[],[old],[],TODAY))[0],500)
        stale=staged(502,924,when="2026-08-01T10:00:00")
        self.assertNotEqual(ids(selector.compose(PREVIOUS,[],[stale],[],TODAY))[0],502)

    def test_empty_stage_falls_back_to_new_proposal_never_blank(self):
        # Recesso: nada pronto para pauta nem aprovado. As três posições continuam preenchidas.
        rows=selector.compose(PREVIOUS,[proposal(55),proposal(66,ementa=EDUCATION)],[],[],TODAY)
        self.assertEqual(len(rows),3)
        self.assertEqual(len(set(ids(rows))),3)
        self.assertEqual([r["criterio"] for r in rows],["etapa_nova_v2"]*3)
        self.assertTrue({55,66}<=set(ids(rows)))

    def test_without_any_candidate_keeps_previous_highlights(self):
        rows=selector.compose(PREVIOUS,[],[],[],TODAY)
        self.assertEqual(sorted(ids(rows)),[11,12,13])

    def test_same_proposal_never_appears_twice(self):
        p=staged(600,924)
        rows=selector.compose(PREVIOUS,[],[p],[dict(p,situacao_codigo=926)],TODAY)
        self.assertEqual(len(set(ids(rows))),3)

    def test_prefers_a_different_subject_across_slots(self):
        trabalho=staged(700,926)
        escola=staged(701,926,when="2026-11-01T10:00:00",ementa="Garante às famílias de estudantes atendimento especial na escola pública de sua cidade.")
        self.assertEqual(selector.stage_relevance(trabalho)[0],selector.stage_relevance(escola)[0])
        pauta=staged(702,924,ementa="Garante aos trabalhadores e às famílias ampliação da licença e do salário-maternidade no emprego formal.")
        rows=selector.compose(PREVIOUS,[],[pauta],[trabalho,escola],TODAY)
        self.assertEqual(ids(rows)[:2],[702,701])

    def test_ignores_party_affiliation(self):
        with_party=dict(staged(800,924),partido="XYZ",autor="Fulano")
        self.assertEqual(selector.stage_relevance(with_party),selector.stage_relevance(staged(801,924)))

    def test_incomplete_previous_selection_changes_nothing(self):
        self.assertEqual(selector.compose(PREVIOUS[:2],[proposal(55)],[staged(200,924)],[],TODAY),[])

if __name__=="__main__":
    unittest.main()
