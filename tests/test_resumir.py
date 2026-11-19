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
    BOA = {"titulo": "Garante transporte para pacientes do SUS que se tratam em outra cidade.",
           "resumo": "Pacientes do SUS que precisam se tratar em outra cidade passariam a ter ajuda de custo ou transporte pagos antes do atendimento.",
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
        self.assertEqual(ok["titulo"], "Garante transporte para pacientes do SUS que se tratam em outra cidade")
        for ruim in [{**self.BOA, "titulo": "Pacientes podem ter ajuda?"}, {**self.BOA, "titulo": "x" * 120}, {**self.BOA, "titulo": None},
                     {**self.BOA, "pontos": ["só um"]}, {**self.BOA, "resumo": "curto"},
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
            rp.validar({"titulo": "Título curto de referência", **{k: v[k] for k in ("resumo", "hoje", "proposta", "pontos", "areas")}})

    def test_prompt_exige_fidelidade_ao_texto(self):
        for regra in ["Use só o que está no texto", "Segundo o autor", "futuro do pretérito", "Não dê opinião", "apenas com um objeto JSON",
                      "Nunca fale do material que você recebeu", "no máximo uma vez", "data de entrada em vigor"]:
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


class Robustez(unittest.TestCase):
    def test_falha_da_camara_e_temporaria_e_volta_para_a_fila(self):
        self.assertTrue(rp.refazer({"status": "sem_texto", "erro": "HTTP Error 504: Gateway Timeout", "tentativas": 1}))
        self.assertTrue(rp.refazer({"status": "erro", "erro": "resposta sem JSON", "tentativas": 2}))
        self.assertFalse(rp.refazer({"status": "erro", "erro": "x", "tentativas": 3}))
        self.assertFalse(rp.refazer({"status": "sem_texto", "erro": "PDF sem texto legível", "tentativas": 1}))

    def test_download_tenta_de_novo_e_marca_como_temporario(self):
        import urllib.error
        chamadas = []
        orig_http, orig_sleep = rp.http, rp.time.sleep
        def falha(url, **kw):
            chamadas.append(url)
            raise urllib.error.HTTPError(url, 504, "Gateway Timeout", {}, io.BytesIO(b""))
        rp.http, rp.time.sleep = falha, lambda s: None
        try:
            with self.assertRaises(rp.FalhaTemporaria):
                rp.baixar_pdf("https://camara/pdf")
        finally:
            rp.http, rp.time.sleep = orig_http, orig_sleep
        self.assertEqual(len(chamadas), 3)

    def test_resposta_cortada_no_limite_vira_erro_com_diagnostico(self):
        orig_http = rp.http
        rp.http = lambda url, **kw: json.dumps({"content": [{"type": "thinking", "thinking": "..."}, {"type": "text", "text": "{\"resumo\": \"cort"}],
                                                 "stop_reason": "max_tokens", "usage": {"input_tokens": 10, "output_tokens": 8000}}).encode()
        os.environ["ANTHROPIC_API_KEY"] = "x"
        orig_espera = rp.RITMO.esperar
        rp.RITMO.esperar = lambda t: None
        try:
            with self.assertRaisesRegex(ValueError, "cortada no limite"):
                rp.chamar_modelo("prompt")
        finally:
            rp.http, rp.RITMO.esperar = orig_http, orig_espera


class RefazerPublicado(unittest.TestCase):
    def test_falha_ao_refazer_nao_tira_resumo_do_ar(self):
        gravados = []
        orig = (rp.gravar, rp.url_inteiro_teor, rp.texto_integral, rp.chamar_modelo)
        rp.gravar = lambda r: gravados.append(r)
        rp.url_inteiro_teor = lambda p: "https://x/pdf"
        rp.texto_integral = lambda u: "Art. 1º " + "texto " * 100
        rp.chamar_modelo = lambda prompt: ("sem json", {})
        try:
            st, _ = rp.processar({"id": 7, "ementa": "E", "_ja_publicado": True, "_tentativas": 1})
            st2, _ = rp.processar({"id": 8, "ementa": "E", "_tentativas": 0})
        finally:
            rp.gravar, rp.url_inteiro_teor, rp.texto_integral, rp.chamar_modelo = orig
        self.assertEqual((st, st2), ("erro", "erro"))
        self.assertEqual([g["proposicao_id"] for g in gravados], [8], "só grava erro de quem ainda não estava publicado")


VERSAO = {"id": 2655527, "sigla": "SBT-A", "descricao": "Substitutivo aprovado na comissão",
          "data": "2026-11-17", "orgao": "CSPCCO",
          "url": "https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=3199112"}
ORIGINAL = "https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=3078149"


class TextoNovo(unittest.TestCase):
    def test_refaz_quando_o_resumo_e_de_outro_texto(self):
        publicado = {"status": "publicado", "fonte_url": ORIGINAL}
        self.assertTrue(rp.precisa_refazer(publicado, VERSAO))
        self.assertFalse(rp.precisa_refazer({**publicado, "fonte_url": VERSAO["url"]}, VERSAO))
        self.assertFalse(rp.precisa_refazer(publicado, None))
        self.assertFalse(rp.precisa_refazer({"status": "erro"}, VERSAO))

    def test_desiste_da_versao_depois_de_tres_falhas(self):
        f = {"status": "publicado", "fonte_url": ORIGINAL, "refazer_url": VERSAO["url"], "refazer_falhas": 3}
        self.assertFalse(rp.precisa_refazer(f, VERSAO))
        self.assertTrue(rp.precisa_refazer({**f, "refazer_url": "https://www.camara.leg.br/outra"}, VERSAO))

    def test_so_aceita_link_oficial(self):
        self.assertIsNone(rp.versao_valida({**VERSAO, "url": "https://malicioso.example/x.pdf"}))
        self.assertIsNone(rp.versao_valida(None))
        self.assertEqual(rp.versao_valida(VERSAO), VERSAO)

    def test_prompt_avisa_que_e_a_versao_nova(self):
        p = {"sigla_tipo": "PL", "numero": 220, "ano": 2026, "ementa": "Altera a Lei 12.850", "_versao": VERSAO}
        prompt = rp.montar_prompt(p, "Art. 1º ...")
        self.assertIn("Substitutivo aprovado na comissão (CSPCCO) em 17/11/2026", prompt)
        self.assertIn("explique o que ESTA versão faz", prompt)
        self.assertNotIn("Versão do texto", rp.montar_prompt({**p, "_versao": None}, "Art. 1º ..."))

    def test_fila_poe_refeitos_na_frente_e_usa_o_link_novo(self):
        resumos = [{"proposicao_id": 1, "status": "publicado", "titulo": "T", "fonte_url": ORIGINAL},
                   {"proposicao_id": 2, "status": "publicado", "titulo": "T", "fonte_url": "u2"}]
        props = [{"id": 2, "ementa": "Altera a Lei X.", "url": "u2", "texto_atual": None},
                 {"id": 3, "ementa": "Altera a Lei Y.", "url": "u3", "texto_atual": None},
                 {"id": 1, "ementa": "Altera a Lei Z.", "url": ORIGINAL, "texto_atual": VERSAO}]
        orig = rp.ler_paginado
        rp.ler_paginado = lambda tabela, params, extras="": resumos if tabela == "resumos_ia" else [dict(p) for p in props]
        try:
            fila = rp.carregar_candidatas()
        finally:
            rp.ler_paginado = orig
        self.assertEqual([p["id"] for p in fila], [1, 3])
        self.assertTrue(fila[0]["_ja_publicado"])
        self.assertEqual(rp.url_inteiro_teor(fila[0]), VERSAO["url"])

    def test_sucesso_grava_a_versao_e_falha_so_conta_tentativa(self):
        gravados = []
        orig = (rp.gravar, rp.texto_integral, rp.chamar_modelo)
        rp.gravar = lambda r: gravados.append(r)
        rp.texto_integral = lambda u: "Art. 1º " + "texto " * 100
        bom = json.dumps({"titulo": "Cria medida cautelar para investigados por crime organizado",
                          "resumo": "Juízes poderiam afastar investigados de cargos públicos durante a investigação de organização criminosa.",
                          "hoje": "", "proposta": "O juiz poderia determinar o afastamento do cargo durante a investigação.",
                          "pontos": ["Afastamento do cargo durante a investigação", "Vale para organizações criminosas"],
                          "areas": ["Segurança pública", "Servidores"]})
        p = {"id": 1, "ementa": "Altera a Lei 12.850", "_versao": VERSAO, "_ja_publicado": True, "_refazer_falhas": 1}
        try:
            rp.chamar_modelo = lambda prompt: (bom, {})
            st, info = rp.processar(dict(p))
            rp.chamar_modelo = lambda prompt: ("sem json", {})
            st2, _ = rp.processar(dict(p))
        finally:
            rp.gravar, rp.texto_integral, rp.chamar_modelo = orig
        self.assertEqual((st, st2), ("publicado", "erro"))
        self.assertEqual(gravados[0]["fonte_url"], VERSAO["url"])
        self.assertEqual((gravados[0]["texto_versao"], gravados[0]["texto_orgao"], gravados[0]["refazer_falhas"]), ("SBT-A", "CSPCCO", 0))
        self.assertEqual(gravados[1], {"proposicao_id": 1, "refazer_url": VERSAO["url"], "refazer_falhas": 2},
                         "falha ao refazer não mexe no resumo publicado")

    def test_resumo_do_texto_original_nao_envia_colunas_novas(self):
        gravados = []
        orig = (rp.gravar, rp.url_inteiro_teor, rp.texto_integral, rp.chamar_modelo)
        rp.gravar = lambda r: gravados.append(r)
        rp.url_inteiro_teor = lambda p: ORIGINAL
        rp.texto_integral = lambda u: "Art. 1º " + "texto " * 100
        rp.chamar_modelo = lambda prompt: (json.dumps({"titulo": "Cria uma regra nova para todo mundo seguir",
            "resumo": "As pessoas passariam a seguir uma regra nova em todo o país, com prazo de adaptação.",
            "hoje": "", "proposta": "Todos teriam de seguir a regra nova.", "pontos": ["Regra nova", "Prazo de adaptação"],
            "areas": ["Cidadãos"]}), {})
        try:
            rp.processar({"id": 9, "ementa": "Institui X"})
        finally:
            rp.gravar, rp.url_inteiro_teor, rp.texto_integral, rp.chamar_modelo = orig
        self.assertNotIn("texto_versao", gravados[0], "funciona antes da migration")


class Encadeamento(unittest.TestCase):
    def test_prazo_adia_sem_gravar(self):
        gravados = []
        orig = (rp.gravar, rp.INICIO)
        rp.gravar = lambda r: gravados.append(r)
        rp.INICIO = rp.time.time() - rp.PRAZO_MINUTOS * 60 - 1
        try:
            st, _ = rp.processar({"id": 1, "ementa": "E"})
        finally:
            rp.gravar, rp.INICIO = orig
        self.assertEqual(st, "adiado")
        self.assertEqual(gravados, [])

    def test_workflow_se_redispara_com_trava_contra_laco(self):
        wf = open(os.path.join(RAIZ, ".github", "workflows", "resumos-ia.yml"), encoding="utf-8").read()
        self.assertIn("actions: write", wf)
        self.assertIn("gh workflow run resumos-ia.yml", wf)
        self.assertIn("steps.gerar.outputs.continuar == 'sim'", wf)
        src = open(os.path.join(RAIZ, "scripts", "resumir_propostas.py"), encoding="utf-8").read()
        self.assertIn('cont.get("publicado", 0) > 0', src)
