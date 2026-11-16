#!/usr/bin/env python3
"""Gera, com IA, o resumo em linguagem simples de cada proposta a partir do texto integral.

Para cada proposta do Supabase ainda sem resumo:
  1. baixa o PDF do inteiro teor (link oficial da Câmara);
  2. extrai o texto (pypdf) e limpa rodapés de assinatura;
  3. pede ao modelo (API da Anthropic) um JSON com resumo, como é hoje, como ficaria,
     pontos práticos e áreas afetadas, só com base no texto;
  4. valida o JSON e grava em public.resumos_ia (status 'publicado').

O site mostra esses textos com o aviso "gerado por IA, sem revisão humana".
Textos revisados pela redação (dados/editorial.js com `validado`) têm prioridade no site.

Variáveis de ambiente:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  obrigatórias
  ANTHROPIC_API_KEY                        obrigatória (sem ela o script sai sem erro)
  MODELO        padrão claude-haiku-5-5
  LIMITE        propostas por execução (padrão 400)
  TRABALHADORES chamadas em paralelo (padrão 4)
  TOKENS_POR_MINUTO  ritmo máximo de tokens de entrada enviados à API (padrão 40000,
                     seguro para contas novas; aumente se o limite da conta for maior)
  SO_IDS        lista de ids separados por vírgula (para testes)
  DRY_RUN=1     só baixa e extrai o texto, sem chamar a IA nem gravar
"""
import concurrent.futures as cf
import threading
import datetime as dt
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

MODELO = os.environ.get("MODELO", "claude-haiku-5-5")
LIMITE = int(os.environ.get("LIMITE", "400"))
TRABALHADORES = int(os.environ.get("TRABALHADORES", "4"))
TOKENS_POR_MINUTO = int(os.environ.get("TOKENS_POR_MINUTO", "40000"))
MAX_TENTATIVAS = 3
MAX_SAIDA = int(os.environ.get("MAX_SAIDA", "8000"))  # o modelo pode raciocinar antes de responder
MAX_CHARS = 60000          # mantém o prompt bem abaixo de 100 mil tokens
UA = "OQueMuda/1.0 (resumos de dados abertos oficiais)"
CAMARA = "https://dadosabertos.camara.leg.br/api/v2/proposicoes/"

# Propostas em que o resumo automático do site já basta (homenagens, rádio/TV, crédito).
PULAR = re.compile(
    r"^(?:Aprova o ato\b|Abre crédito|Inscreve\b|Denomina\b|Declara\b|"
    r"(?:Institui|Cria)\s+(?:o|a)\s+[\"“]?(?:Dia|Semana|Mês|Ano|Data)\b|"
    r"Confere\s.*\btítulo\b|Reconhece\s.*(?:manifesta[çc][ãa]o|capital|patrim[ôo]nio|patron[oa]))",
    re.I | re.S,
)

SISTEMA = """Você escreve para o site "O que muda?", que explica propostas da Câmara dos Deputados em linguagem simples para qualquer cidadão brasileiro.

Regras obrigatórias:
- Use só o que está no texto fornecido. Não invente números, prazos, leis, órgãos, valores nem efeitos.
- A proposta ainda não é lei: no resumo, use o futuro do pretérito ("passariam", "teriam", "poderiam").
- Quando a situação atual só aparece na justificativa do autor, comece "hoje" com "Segundo o autor,".
- Se o texto não permitir saber como é hoje, deixe "hoje" vazio.
- Frases curtas, palavras do dia a dia, sem juridiquês (troque "mediante" por "por meio de", "no âmbito do" por "no", etc.). Explique siglas na primeira vez.
- Não dê opinião, não use adjetivos de valor, não diga se a proposta é boa ou ruim.
- O resumo não pode repetir a ementa nem o título: conte o efeito prático para as pessoas.
- Nunca fale do material que você recebeu ("texto enviado", "trecho fornecido", "documento"). Se algo não estiver detalhado, diga "o texto da proposta não detalha…".
- Use "Segundo o autor" no máximo uma vez em cada campo.
- Não gaste um ponto prático só com a data de entrada em vigor; cite prazo apenas quando for relevante (por exemplo, 180 dias para se adaptar).
- Escreva em português do Brasil.

Seja direto: não explique seu raciocínio. Responda apenas com um objeto JSON, sem texto antes ou depois, neste formato:
{"resumo": "1 ou 2 frases, até 320 caracteres, sobre o que muda na vida das pessoas",
 "hoje": "até 2 frases, até 400 caracteres, ou string vazia",
 "proposta": "até 2 frases, até 400 caracteres, sobre como ficaria se aprovada",
 "pontos": ["de 2 a 5 mudanças práticas concretas, cada uma com até 220 caracteres"],
 "areas": ["de 2 a 4 áreas ou grupos afetados, cada um com até 45 caracteres"]}"""


# ---------- utilidades puras (testadas sem rede) ----------

def deve_pular(ementa):
    return bool(PULAR.match((ementa or "").strip()))


RUIDO = [
    re.compile(r"^.*Assinado eletronicamente.*$", re.I | re.M),
    re.compile(r"^.*Para verificar a assinatura.*$", re.I | re.M),
    re.compile(r"^.*https?://infoleg\S*.*$", re.I | re.M),
    re.compile(r"\*CD\d+\*"),
    re.compile(r"^.*Apresentação:\s*\d{2}/\d{2}/\d{4}.*$", re.I | re.M),
    re.compile(r"^\s*(?:Fl\.\s*\d+\s*de\s*\d+|\d+)\s*$", re.M),
    re.compile(r"^.*Praça dos Três Poderes.*$", re.I | re.M),
    re.compile(r"^.*Gabinete\s+\d+.*Anexo.*$", re.I | re.M),
]


def limpar_texto(texto):
    t = texto or ""
    for rx in RUIDO:
        t = rx.sub("", t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n\s*\n+", "\n", t)
    return t.strip()


def recortar(texto, limite=MAX_CHARS):
    """Mantém o articulado inteiro e o começo da justificativa quando o texto é longo."""
    if len(texto) <= limite:
        return texto
    m = re.search(r"\n\s*JUSTIFICA(?:TIVA|ÇÃO|CAO)", texto, re.I)
    if m and m.start() < limite:
        cabeca = texto[: m.start()]
        resto = limite - len(cabeca) - 40
        return cabeca + "\n\n[...]\n" + texto[m.start(): m.start() + max(resto, 3000)]
    return texto[: int(limite * 0.75)] + "\n\n[...]\n" + texto[-int(limite * 0.25):]


def extrair_json(resposta):
    s = (resposta or "").strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s)
    ini, fim = s.find("{"), s.rfind("}")
    if ini < 0 or fim <= ini:
        raise ValueError("resposta sem JSON")
    return json.loads(s[ini: fim + 1])


def _txt(v, maximo, minimo=0, campo=""):
    if not isinstance(v, str):
        raise ValueError(f"{campo}: não é texto")
    v = re.sub(r"\s+", " ", v).strip().strip('"').strip()
    v = re.sub(r"\*\*|__", "", v)
    if len(v) < minimo:
        raise ValueError(f"{campo}: curto demais")
    if len(v) > maximo:
        raise ValueError(f"{campo}: longo demais ({len(v)})")
    return v


def _norm(s):
    return re.sub(r"[^\w]+", " ", (s or "").lower()).strip()


def validar(dados, ementa=""):
    if not isinstance(dados, dict):
        raise ValueError("JSON não é objeto")
    out = {
        "resumo": _txt(dados.get("resumo"), 420, 50, "resumo"),
        "hoje": _txt(dados.get("hoje") or "", 520, 0, "hoje"),
        "proposta": _txt(dados.get("proposta"), 520, 30, "proposta"),
    }
    pontos = dados.get("pontos")
    areas = dados.get("areas")
    if not isinstance(pontos, list) or not 2 <= len(pontos) <= 5:
        raise ValueError("pontos: precisa de 2 a 5 itens")
    if not isinstance(areas, list) or not 1 <= len(areas) <= 5:
        raise ValueError("areas: precisa de 1 a 5 itens")
    out["pontos"] = [_txt(p, 300, 12, "ponto") for p in pontos]
    out["areas"] = [_txt(a, 60, 3, "area") for a in areas][:4]
    if ementa and _norm(out["resumo"]) and _norm(out["resumo"]) in _norm(ementa):
        raise ValueError("resumo copia a ementa")
    return out


def montar_prompt(p, texto):
    return (
        f"Proposta: {p.get('sigla_tipo')} {p.get('numero')}/{p.get('ano')}\n"
        f"Ementa oficial: {p.get('ementa')}\n\n"
        f"Texto integral (pode estar recortado):\n<texto>\n{texto}\n</texto>"
    )


class ChaveInvalida(Exception):
    """A API recusou a chave (expirada, revogada ou sem crédito): a execução inteira para."""


PARAR = threading.Event()


# ---------- rede ----------

def http(url, data=None, headers=None, method=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def supabase():
    base = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return base, {"apikey": key, "Authorization": "Bearer " + key, "Accept": "application/json"}


def carregar_candidatas(ids=None):
    base, h = supabase()
    feitos = {}
    for off in range(0, 200000, 1000):
        q = urllib.parse.urlencode({"select": "proposicao_id,status,tentativas,erro", "limit": 1000, "offset": off})
        rows = json.loads(http(base + "resumos_ia?" + q, headers=h))
        for r in rows:
            feitos[r["proposicao_id"]] = r
        if len(rows) < 1000:
            break
    out = []
    for off in range(0, 200000, 1000):
        params = {"select": "id,sigla_tipo,numero,ano,ementa,data_apresentacao,url:dados_oficiais->>urlInteiroTeor",
                  "order": "data_apresentacao.desc.nullslast,id.desc", "limit": 1000, "offset": off}
        if ids:
            params["id"] = "in.(" + ",".join(str(i) for i in ids) + ")"
        rows = json.loads(http(base + "proposicoes?" + urllib.parse.urlencode(params), headers=h))
        for p in rows:
            f = feitos.get(p["id"])
            if ids:
                out.append(p)
            elif deve_pular(p.get("ementa")):
                continue
            elif f is None or (f["status"] in ("erro", "sem_texto") and refazer(f)):
                p["_tentativas"] = (f or {}).get("tentativas") or 0
                out.append(p)
        if len(rows) < 1000:
            break
    return out


def refazer(f):
    """Erro de geração ou falha temporária da Câmara: tenta de novo até MAX_TENTATIVAS."""
    if (f.get("tentativas") or 1) >= MAX_TENTATIVAS:
        return False
    return f["status"] == "erro" or bool(TEMPORARIA.search(f.get("erro") or ""))


def url_inteiro_teor(p):
    if p.get("url"):
        return p["url"]
    d = json.loads(http(CAMARA + str(p["id"]), headers={"Accept": "application/json", "User-Agent": UA}, timeout=30))
    return (d.get("dados") or {}).get("urlInteiroTeor")


class FalhaTemporaria(Exception):
    """Servidor da Câmara fora do ar ou lento: tentar de novo numa próxima execução."""


TEMPORARIA = re.compile(r"HTTP Error 5\d\d|timed out|Timeout|temporar|Connection reset|Remote end closed", re.I)


def baixar_pdf(url):
    ultimo = None
    for espera in (0, 10, 30):
        if espera:
            time.sleep(espera)
        try:
            return http(url, headers={"User-Agent": UA, "Accept": "application/pdf,*/*"}, timeout=90)
        except urllib.error.HTTPError as e:
            if e.code < 500:
                raise LookupError(f"HTTP {e.code} ao baixar o inteiro teor")
            ultimo = e
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            ultimo = e
    raise FalhaTemporaria(f"Câmara indisponível: {ultimo}")


def texto_integral(url):
    from pypdf import PdfReader
    raw = baixar_pdf(url)
    if not raw.startswith(b"%PDF"):
        raise LookupError("inteiro teor não é PDF")
    leitor = PdfReader(io.BytesIO(raw))
    partes = []
    for pag in leitor.pages[:80]:
        try:
            partes.append(pag.extract_text() or "")
        except Exception:
            continue
    return limpar_texto("\n".join(partes))


class Ritmo:
    """Espaça as chamadas para não passar do limite de tokens por minuto da conta."""
    def __init__(self, tpm):
        self.tpm = max(tpm, 1000)
        self.trava = threading.Lock()
        self.proximo = 0.0

    def esperar(self, tokens):
        with self.trava:
            agora = time.monotonic()
            inicio = max(agora, self.proximo)
            self.proximo = inicio + tokens / self.tpm * 60
        if inicio > agora:
            time.sleep(inicio - agora)


RITMO = Ritmo(TOKENS_POR_MINUTO)


def estimar_tokens(texto):
    return int(len(texto) / 3.2) + 800


def chamar_modelo(prompt):
    corpo = json.dumps({"model": MODELO, "max_tokens": MAX_SAIDA, "system": SISTEMA,
                        "messages": [{"role": "user", "content": prompt}]}).encode()
    h = {"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
         "content-type": "application/json"}
    espera = 0
    for tentativa in range(5):
        if espera:
            time.sleep(espera)
        RITMO.esperar(estimar_tokens(SISTEMA + prompt))
        try:
            r = json.loads(http("https://api.anthropic.com/v1/messages", data=corpo, headers=h, method="POST", timeout=120))
            somar_uso(r.get("usage") or {})
            texto = "".join(b.get("text", "") for b in r.get("content", []) if b.get("type") == "text")
            if r.get("stop_reason") == "max_tokens" and "}" not in texto:
                tipos = sorted({b.get("type") for b in r.get("content", [])})
                raise ValueError(f"resposta cortada no limite de {MAX_SAIDA} tokens (blocos: {tipos})")
            return texto, r.get("usage") or {}
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 529):
                try:
                    espera = float(e.headers.get("retry-after") or 0)
                except ValueError:
                    espera = 0
                espera = max(espera, 10 * (tentativa + 1))
                continue
            corpo_erro = e.read()[:300].decode(errors="ignore")
            if e.code in (401, 403) or (e.code == 400 and "credit balance" in corpo_erro.lower()):
                PARAR.set()
                raise ChaveInvalida(f"API {e.code}: {corpo_erro}")
            raise RuntimeError(f"API {e.code}: {corpo_erro}")
    raise RuntimeError("API indisponível depois de várias tentativas")


def gravar(registro):
    base, h = supabase()
    h = {**h, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"}
    http(base + "resumos_ia?on_conflict=proposicao_id", data=json.dumps(registro).encode(), headers=h, method="POST")


# ---------- processamento ----------

USO = {"input_tokens": 0, "output_tokens": 0}
_TRAVA_USO = threading.Lock()


def somar_uso(uso):
    with _TRAVA_USO:
        for k in USO:
            USO[k] += int(uso.get(k) or 0)


def processar(p, dry=False):
    if PARAR.is_set():
        return "parado", "chave da API recusada"
    pid = p["id"]
    base = {"proposicao_id": pid, "modelo": MODELO, "tentativas": (p.get("_tentativas") or 0) + 1,
            "gerado_em": dt.datetime.now(dt.timezone.utc).isoformat()}
    try:
        url = url_inteiro_teor(p)
        if not url:
            raise LookupError("sem link do inteiro teor")
        texto = texto_integral(url)
        if len(texto) < 300:
            raise LookupError("PDF sem texto legível")
    except (FalhaTemporaria, urllib.error.URLError, TimeoutError) as e:
        reg = {**base, "status": "erro", "erro": ("temporário: " + str(e))[:300]}
        if not dry:
            gravar(reg)
        return "erro", str(e)
    except (LookupError, urllib.error.HTTPError) as e:
        reg = {**base, "status": "sem_texto", "erro": str(e)[:300]}
        if not dry:
            gravar(reg)
        return "sem_texto", str(e)
    texto = recortar(texto)
    if dry:
        return "dry", f"{len(texto)} caracteres"
    ultimo = ""
    for _ in range(2):
        try:
            resposta, _ = chamar_modelo(montar_prompt(p, texto))
            dados = validar(extrair_json(resposta), p.get("ementa") or "")
            gravar({**base, **dados, "status": "publicado", "erro": None, "fonte_url": url,
                    "caracteres_lidos": len(texto)})
            return "publicado", ""
        except (ValueError, json.JSONDecodeError) as e:
            ultimo = str(e)
        except ChaveInvalida:
            return "parado", "chave da API recusada"
        except RuntimeError as e:
            ultimo = str(e)
            break
    gravar({**base, "status": "erro", "erro": ultimo[:300], "fonte_url": url})
    return "erro", ultimo


def main():
    dry = os.environ.get("DRY_RUN") == "1"
    if not dry and not os.environ.get("ANTHROPIC_API_KEY"):
        print("::notice::ANTHROPIC_API_KEY não configurada; nada a fazer.")
        return 0
    ids = [int(x) for x in os.environ.get("SO_IDS", "").split(",") if x.strip()]
    fila = carregar_candidatas(ids or None)
    na_fila = len(fila)
    print(f"Propostas na fila: {na_fila}; processando até {LIMITE} com {MODELO}.", flush=True)
    fila = fila[:LIMITE]
    cont = {}
    inicio = time.time()
    with cf.ThreadPoolExecutor(max_workers=TRABALHADORES) as ex:
        futuros = {ex.submit(processar, p, dry): p for p in fila}
        for i, fut in enumerate(cf.as_completed(futuros), 1):
            p = futuros[fut]
            try:
                st, info = fut.result()
            except Exception as e:  # erro inesperado: registra e segue
                st, info = "falha", repr(e)[:200]
            cont[st] = cont.get(st, 0) + 1
            print(f"[{i}/{len(fila)}] {p['sigla_tipo']} {p['numero']}/{p['ano']} ({p['id']}): {st} {info}", flush=True)
    custo = USO["input_tokens"] / 1e6 * 0.10 + USO["output_tokens"] / 1e6 * 0.50 if "haiku" in MODELO else None
    resumo = (f"## Resumos por IA\n\n{json.dumps(cont, ensure_ascii=False)} em {int(time.time() - inicio)} s. "
              f"Tokens: {USO['input_tokens']:,} de entrada, {USO['output_tokens']:,} de saída"
              + (f" (≈ US$ {custo:.2f})." if custo is not None else ".") + "\n"
              + ("" if ids or dry else
                 f"\n**Fila:** {na_fila:,} propostas sem resumo antes desta execução; "
                 f"restam cerca de {max(na_fila - cont.get('publicado', 0) - cont.get('sem_texto', 0), 0):,}.\n"))
    print(resumo)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(resumo)
    if PARAR.is_set():
        print("::error::A API da Anthropic recusou a chave (expirada, revogada ou sem crédito). "
              "Gere uma chave nova no Console e atualize o secret ANTHROPIC_API_KEY. Nenhuma proposta foi marcada como erro por isso.")
        return 1
    return 1 if cont.get("falha", 0) > len(fila) / 2 else 0


if __name__ == "__main__":
    sys.exit(main())
