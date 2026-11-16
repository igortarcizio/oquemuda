import io
import json
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import resumir_propostas as rp  # noqa: E402

RAIZ = os.path.join(os.path.dirname(__file__), "..")


def editorial():
    src = open(os.path.join(RAIZ, "dados", "editorial.js"), encoding="utf-8").read()
    return json.loads(src[src.index("{"): src.rindex("}") + 1])


class Selecao(unittest.TestCase):
    def test_pula_o_que_o_resumo_automatico_ja_cobre(self):
        for e in ["Aprova o ato que renova a outorga à Rádio X para executar serviço de radiodifusão.",
                  "Abre crédito extraordinário, em favor do Ministério X, no valor de R$ 1,00.",
                  "Institui o Dia Nacional do Forró.",
                  "Inscreve o nome de Fulano no Livro dos Heróis e Heroínas da Pátria.",
                  "Reconhece a Festa X como manifestação da cultura nacional.",
                  "Confere ao Município de X o título de Capital Nacional do Y."]:
            self.assertTrue(rp.deve_pular(e), e)
        for e in ["Altera a Lei nº 8.080, de 19 de setembro de 1990, para X.",
                  "Institui o Programa Nacional de X.",
                  "Dispõe sobre medidas de prevenção a fraudes."]:
            self.assertFalse(rp.deve_pular(e), e)


class Texto(unittest.TestCase):
    def test_limpa_rodapes_de_assinatura(self):
        t = ("Art. 1º Texto.\nAssinado eletronicamente pelo(a) Dep. Fulano\nPara verificar a assinatura, acesse https://infoleg-autenticidade\n"
             "*CD261234567800*\nPL n.5751/2026 Apresentação: 04/11/2026 11:48:46.703 - Mesa\n3\nArt. 2º Vigência.")
        limpo = rp.limpar_texto(t)
        self.assertEqual(limpo, "Art. 1º Texto.\nArt. 2º Vigência.")

    def test_recorte_preserva_articulado_e_inicio_da_justificativa(self):
        art = "Art. 1º " + "a" * 30000
        just = "\nJUSTIFICAÇÃO\n" + "b" * 80000
        r = rp.recortar(art + just, 60000)
        self.assertLessEqual(len(r), 60100)
        self.assertTrue(r.startswith("Art. 1º"))
        self.assertIn("JUSTIFICAÇÃO", r)
        self.assertEqual(rp.recortar("curto"), "curto")


class Saida(unittest.TestCase):
    BOA = {"resumo": "Pacientes do SUS que precisam se tratar em outra cidade passariam a ter ajuda de custo ou transporte pagos antes do atendimento.",
           "hoje": "Segundo o autor, a regra atual deixa de fora trajetos curtos.",
           "proposta": "O município ou estado que encaminhou paga a ajuda de custo ou oferece o transporte.",
           "pontos": ["Ajuda paga antes de cada atendimento.", "Acompanhante incluído quando o médico indicar."],
           "areas": ["Saúde pública", "Prefeituras"]}

    def test_extrai_json_mesmo_com_cerca_de_codigo(self):
        self.assertEqual(rp.extrair_json("```json\n" + json.dumps(self.BOA) + "\n```")["areas"], ["Saúde pública", "Prefeituras"])
        with self.assertRaises(ValueError):
            rp.extrair_json("desculpe, não consigo")

    def test_valida_campos_e_tamanhos(self):
        ok = rp.validar(dict(self.BOA), "Altera a Lei 8.080 para assegurar ajuda de custo.")
        self.assertEqual(len(ok["pontos"]), 2)
        for ruim in [{**self.BOA, "pontos": ["só um"]}, {**self.BOA, "resumo": "curto"},
                     {**self.BOA, "areas": []}, {**self.BOA, "proposta": "x" * 600}, {**self.BOA, "resumo": None}]:
            with self.assertRaises(ValueError):
                rp.validar(ruim)

    def test_recusa_resumo_que_copia_a_ementa(self):
        ementa = "Dispõe sobre o rastreamento precoce do diabetes mellitus tipo 1 e da doença celíaca na população pediátrica, no âmbito do SUS."
        with self.assertRaises(ValueError):
            rp.validar({**self.BOA, "resumo": "Dispõe sobre o rastreamento precoce do diabetes mellitus tipo 1 e da doença celíaca"}, ementa)

    def test_textos_aprovados_pela_redacao_passam_no_validador(self):
        # Referência de qualidade: o que a redação aprovou precisa caber nos limites exigidos da IA.
        textos = [v for v in editorial().values() if v.get("validado")]
        self.assertGreaterEqual(len(textos), 7)
        for v in textos:
            rp.validar({k: v[k] for k in ("resumo", "hoje", "proposta", "pontos", "areas")})

    def test_prompt_exige_fidelidade_ao_texto(self):
        for regra in ["Use só o que está no texto", "Segundo o autor", "futuro do pretérito", "Não dê opinião", "apenas com um objeto JSON"]:
            self.assertIn(regra, rp.SISTEMA)
        prompt = rp.montar_prompt({"sigla_tipo": "PL", "numero": 1, "ano": 2026, "ementa": "E."}, "TEXTO")
        self.assertIn("PL 1/2026", prompt)
        self.assertIn("<texto>\nTEXTO\n</texto>", prompt)


if __name__ == "__main__":
    unittest.main()


class RitmoTeste(unittest.TestCase):
    def test_espaca_chamadas_pelo_limite_de_tokens(self):
        r = rp.Ritmo(60000)  # 1000 tokens por segundo
        dormiu = []
        orig = rp.time.sleep
        rp.time.sleep = lambda s: dormiu.append(s)
        try:
            r.esperar(500)
            r.esperar(500)
            r.esperar(500)
        finally:
            rp.time.sleep = orig
        self.assertEqual(len(dormiu), 2)
        self.assertAlmostEqual(dormiu[-1], 1.0, delta=0.1)

    def test_estimativa_de_tokens(self):
        self.assertGreater(rp.estimar_tokens("a" * 32000), 10000)


class ChaveRecusada(unittest.TestCase):
    def test_chave_invalida_para_tudo_sem_marcar_erro(self):
        import urllib.error
        gravados = []
        orig = (rp.http, rp.gravar, rp.texto_integral, rp.url_inteiro_teor, rp.RITMO.esperar)
        def http_falso(url, **kw):
            raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"invalid x-api-key"}'))
        rp.http = http_falso
        rp.gravar = lambda r: gravados.append(r)
        rp.texto_integral = lambda url: "Art. 1º " + "texto " * 100
        rp.url_inteiro_teor = lambda p: "https://exemplo/pdf"
        rp.RITMO.esperar = lambda t: None
        os.environ["ANTHROPIC_API_KEY"] = "x"
        try:
            st1, _ = rp.processar({"id": 1, "ementa": "E", "sigla_tipo": "PL", "numero": 1, "ano": 2026})
            st2, _ = rp.processar({"id": 2, "ementa": "E", "sigla_tipo": "PL", "numero": 2, "ano": 2026})
        finally:
            rp.http, rp.gravar, rp.texto_integral, rp.url_inteiro_teor, rp.RITMO.esperar = orig
            rp.PARAR.clear()
        self.assertEqual((st1, st2), ("parado", "parado"))
        self.assertEqual(gravados, [], "não grava erro quando a chave é recusada")
