#!/usr/bin/env python3
"""Indexa sem teto artificial as proposições dos tipos configurados, por ano."""
import json, os, sys, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parents[1]
TYPES=('PL','PLP','PEC','MPV','PDL','PRC')
YEARS=[int(y) for y in os.getenv('OBM_YEARS','2026,2025,2024,2023,2022').split(',') if y.strip().isdigit()]
BASE='https://dadosabertos.camara.leg.br/api/v2/proposicoes'
def fetch(params):
    url=BASE+'?'+urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            req=urllib.request.Request(url, headers={'Accept':'application/json','User-Agent':'OQueMuda/2.0 (indexacao cidadania)'})
            with urllib.request.urlopen(req, timeout=35) as f:
                body=f.read()
            if body.lstrip().startswith(b'<'):
                import xml.etree.ElementTree as ET
                root=ET.fromstring(body); dados=root.find('dados')
                return [{c.tag:(c.text or '') for c in e} for e in dados] if dados is not None else []
            obj=json.loads(body)
            return obj['dados']
        except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError,ValueError,KeyError) as e:
            if isinstance(e,urllib.error.HTTPError) and e.code not in (429,500,502,503,504): raise
            if attempt==4: raise
            time.sleep(min(25,2**attempt*2))
    raise RuntimeError('Sem dados')
def classify(e):
    s=e.casefold()
    if any(x in s for x in ('educação','educacao','escolar','estudante','universit','professor','ensino')):return 'Educação'
    if any(x in s for x in ('saúde','saude','sus','hospital','medicamento','tratamento médico','doença','vacina')):return 'Saúde'
    if any(x in s for x in ('trabalho','trabalhador','emprego','salário','salario','previdência','previdencia')):return 'Trabalho'
    if any(x in s for x in ('consumidor','consumo','tarifa','comércio','comercio','compra','venda')):return 'Consumo'
    if any(x in s for x in ('internet','digital','inteligência artificial','inteligencia artificial','aplicativo','dados pessoais')):return 'Tecnologia'
    if any(x in s for x in ('transporte','mobilidade','trânsito','transito','passageiro','rodoviár','aeroporto')):return 'Mobilidade'
    return 'Outros'
def run():
    existing=ROOT/'dados/catalogo.js'
    editor={}
    original=ROOT/'dados/base.js'
    if original.exists():
        try:
            seed=json.loads(original.read_text(encoding='utf8').split('=',1)[1].strip().rstrip(';'))
            editor={int(p['id']):{k:p[k] for k in ('titulo','impacto','publicos') if k in p} for p in seed.get('items',[])}
        except (ValueError,KeyError,TypeError):pass
    accumulated={}
    for year in YEARS:
        for typ in TYPES:
            page=1; count=0
            while True:
                batch=fetch({'ano':year,'siglaTipo':typ,'itens':100,'pagina':page,'ordenarPor':'id','ordem':'DESC'})
                if not isinstance(batch,list):raise ValueError('Resposta sem lista de proposições')
                for p in batch:
                    try:
                        pid=int(p['id']); n=int(p['numero']); ano=int(p['ano']); e=str(p.get('ementa') or '').strip()
                        if not e: continue
                        data={'id':pid,'numero':n,'ano':ano,'siglaTipo':str(p.get('siglaTipo') or typ),'ementa':e,'dataApresentacao':str(p.get('dataApresentacao') or ''),'area':classify(e),'statusCurto':'Consultar situação'}
                        data.update(editor.get(pid,{}))
                        accumulated[pid]=data
                    except (KeyError,TypeError,ValueError):continue
                count+=len(batch)
                print(f'{year} {typ} página {page}: {len(batch)} (total={count})',flush=True)
                if len(batch)<100:break
                page+=1
                time.sleep(.16)
            print(f'{year} {typ} concluído: {count}',flush=True)
    if len(accumulated)<100:raise RuntimeError('Coleta incompleta: menos de 100 proposições; arquivo anterior preservado')
    items=sorted(accumulated.values(),key=lambda p:p['id'],reverse=True)
    data={'generatedAt':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'source':'Câmara dos Deputados / API Dados Abertos','coverage':'Índice de todas as proposições dos tipos PL, PLP, PEC, MPV, PDL e PRC para os anos indicados. Não cobre outros tipos, Senado ou anos fora do índice.','years':sorted(set(YEARS),reverse=True),'types':list(TYPES),'total':len(items),'items':items}
    target=ROOT/'dados/catalogo.js';target.parent.mkdir(exist_ok=True)
    tmp=target.with_suffix('.tmp')
    tmp.write_text('window.OBM_DATA = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')
    tmp.replace(target)
    print(f'INDEXADOS: {len(items)} proposições em {target}',flush=True)
if __name__=='__main__':
    try:run()
    except Exception as e:
        print('ERRO: base anterior não foi substituída:',repr(e),file=sys.stderr)
        sys.exit(1)
