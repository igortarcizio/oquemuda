#!/usr/bin/env python3
"""Atualiza uma seleção temática de proposições reais da API da Câmara.

Gera dados/base.js para uso em GitHub Pages sem problemas de CORS.
A atualização só é publicada quando as consultas retornam dados válidos.
Não cria interpretações jurídicas a partir de ementas.
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://dadosabertos.camara.leg.br/api/v2/'
EDITORIAL = json.loads((ROOT/'dados/editorial.json').read_text(encoding='utf-8'))
AREAS = ['Trabalho', 'Consumo', 'Saúde', 'Educação', 'Tecnologia', 'Mobilidade']
SEARCH_TERMS = {
 'Trabalho': 'trabalho',
 'Consumo': 'consumidor',
 'Saúde': 'saude',
 'Educação': 'educacao',
 'Tecnologia': 'internet',
 'Mobilidade': 'transporte',
}
MAX_TOTAL = 135
TIMEOUT = 18


def text_node(elem, tag):
    v = elem.find(tag)
    return (v.text or '').strip() if v is not None else ''


def extract_xml(raw):
    root = ET.fromstring(raw)
    dados = root.find('dados')
    if dados is None:
        return {'dados': []}
    if list(dados) and all(v.tag == 'proposicao_' for v in dados):
        return {'dados': [{n.tag:(n.text or '') for n in entry} for entry in dados]}
    obj = {}
    for node in dados:
        if len(node):
            obj[node.tag] = {x.tag:(x.text or '') for x in node}
        else:
            obj[node.tag] = node.text or ''
    return {'dados': obj}


def parse_response(raw, content_type=''):
    if 'xml' in content_type or raw.lstrip().startswith(b'<'):
        return extract_xml(raw)
    return json.loads(raw.decode('utf-8'))


def get_json(path, params=None, attempts=3):
    url=BASE + path
    if params:
        url += '?' + urllib.parse.urlencode(params)
    for i in range(attempts):
        try:
            req=urllib.request.Request(url, headers={'Accept':'application/json','User-Agent':'OQueMuda/1.0 (+public-data-project)'})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                raw=resp.read()
                data=parse_response(raw,resp.headers.get('Content-Type',''))
            if not isinstance(data,dict) or 'dados' not in data:
                raise ValueError(f'Resposta inválida em {path}')
            return data['dados']
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError, ET.ParseError) as e:
            logging.warning('%s (tentativa %s/%s): %s', path,i+1,attempts,e)
            if isinstance(e, urllib.error.HTTPError) and e.code not in (429,500,502,503,504):
                break
            if i<attempts-1:
                time.sleep(2*(i+1))
    return None


def normalize_record(p):
    try:
        ident=int(p['id']); numero=int(p['numero']);ano=int(p['ano'])
    except (KeyError,TypeError,ValueError):
        return None
    ementa=str(p.get('ementa') or '').strip()
    if not ementa:return None
    return {'id':ident,'siglaTipo':str(p.get('siglaTipo') or 'PL'), 'numero':numero,'ano':ano,'ementa':ementa,'dataApresentacao':str(p.get('dataApresentacao') or '')}


def classify(p,source_area):
    e = p['ementa'].casefold()
    if any(t in e for t in ['educação','educacao','escolar','estudantil','universitár','professor']):return 'Educação'
    if any(t in e for t in ['saúde','saude','sus','hospital','medicamento','tratamento médico','diabetes']):return 'Saúde'
    if any(t in e for t in ['trabalho','trabalhador','emprego','previdência','previdencia','motorista de aplicativo','entregador']):return 'Trabalho'
    if any(t in e for t in ['consumidor','código de defesa do consumidor','tarifa social','fraud','consórcio','consorcio']):return 'Consumo'
    if any(t in e for t in ['internet','inteligência artificial','inteligencia artificial','digital','plataforma']):return 'Tecnologia'
    if any(t in e for t in ['transporte','mobilidade','passagem aérea','passageiro','rodoviário','rodoviario']):return 'Mobilidade'
    return source_area if source_area in AREAS else 'Outros'


def get_short_status(detail):
    status = detail.get('statusProposicao') or {}
    if not isinstance(status,dict):status={}
    txt=' '.join(str(status.get(k) or '') for k in ('descricaoSituacao','descricaoTramitacao')).lower()
    if 'arquivad' in txt:return 'Arquivada'
    if ('transformad' in txt and 'norma' in txt) or 'convertida em norma' in txt:return 'Convertida em norma'
    if 'retirad' in txt:return 'Retirada'
    if 'apresentação de proposição' in txt:return 'Apresentada'
    if any(k in txt for k in ['aguardando','tramitação','relator','comiss','apreciação','votaç']):return 'Em tramitação'
    return 'Situação no portal'


def update_data():
    found={}
    counts={}
    # Recent PL + thematic samples per year. Queries are purposely bounded and NOT exhaustive.
    searches=[('Outros',{'siglaTipo':'PL','ano':'2026','itens':'45','pagina':'1','ordem':'DESC','ordenarPor':'id'})]
    for year in ('2026','2025'):
        for area,kw in SEARCH_TERMS.items():
            searches.append((area,{'siglaTipo':'PL','ano':year,'keywords':kw,'itens':'25','pagina':'1','ordem':'DESC','ordenarPor':'id'}))
    good=0
    for area,params in searches:
        records = get_json('proposicoes',params)
        if not isinstance(records,list):
            continue
        good+=1
        counts[f"{area}:{params.get('ano')}"]=len(records)
        for raw in records:
            p=normalize_record(raw)
            if not p:continue
            if p['id'] in found:continue
            p['area']=classify(p,area)
            found[p['id']]=p
        logging.info('%s / %s: %s itens',area,params.get('ano'),len(records))
    if good<3 or len(found)<8:
        raise RuntimeError('API insuficiente: não sobrescrever a base publicada com dados incompletos.')
    # Prefer diversity and newness; keep curation if IDs found in official API. Preserve editorial from known verified IDs.
    diverse=[]; max_per_area=24; per={a:0 for a in AREAS+['Outros']}
    for p in sorted(found.values(),key=lambda x:x['id'], reverse=True):
        area=p['area'];if_allowed=per.get(area,0)<max_per_area
        if if_allowed:
            diverse.append(p);per[area]=per.get(area,0)+1
        if len(diverse)>=MAX_TOTAL:break
    for p in diverse:
        edit=EDITORIAL.get(str(p['id']),{})
        p.update(edit)
    # Details enhance trust; failures leave individual status explicitly unconfirmed.
    for index,p in enumerate(diverse):
        detail=get_json(f"proposicoes/{p['id']}", attempts=2)
        if isinstance(detail,dict):
            status=detail.get('statusProposicao') or {}
            p['statusOficial']=status.get('descricaoSituacao') or status.get('descricaoTramitacao') or ''
            p['ultimaTramitacao']=status.get('descricaoTramitacao') or ''
            p['statusCurto']=get_short_status(detail)
            url=detail.get('urlInteiroTeor') or ''
            if isinstance(url,str) and url.startswith('https://www.camara.leg.br/'):
                p['urlInteiroTeor']=url
        else:
            p['statusCurto']='Apresentada'  # date of submission has been checked via listing
        if index%25==0:logging.info('detalhamento %s/%s',index+1,len(diverse))
    now=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    result={'generatedAt':now,'source':'API de Dados Abertos da Câmara dos Deputados','coverage':'Seleção de PLs de 2025 e 2026, atualizada de forma periódica; não é levantamento exaustivo','total':len(diverse),'items':diverse}
    out=ROOT/'dados/base.js'
    out.write_text('window.OBM_DATA = '+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
    logging.info('Gravados %s registros oficiais em %s',len(diverse),out)
    return len(diverse)


if __name__=='__main__':
    logging.basicConfig(level=logging.INFO,format='%(levelname)s %(message)s')
    try:
        n=update_data()
    except Exception as e:
        logging.error('Atualização abortada: %s',e)
        sys.exit(1)
    print(f'{n} projetos no índice atualizado')
