#!/usr/bin/env python3
"""Atualiza amostra de reserva. O acervo completo é consultado ao vivo, com paginação."""
import json, os, re, sys, time, urllib.parse, urllib.request, urllib.error
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'dados' / 'catalogo.js'
BASE = 'https://dadosabertos.camara.leg.br/api/v2/proposicoes'
TYPES = ('PL', 'PLP', 'PEC', 'MPV', 'PDL', 'PRC')
YEARS = (2026, 2025)
def fetch(year, typ):
    params=urllib.parse.urlencode({'ano':year,'siglaTipo':typ,'itens':100,'pagina':1,'ordenarPor':'id','ordem':'DESC'})
    request=urllib.request.Request(BASE+'?'+params,headers={'Accept':'application/json','User-Agent':'OQueMuda/2.1'})
    with urllib.request.urlopen(request, timeout=9) as reply:
        raw=reply.read()
    if raw.lstrip().startswith(b'<'):
        root=ET.fromstring(raw)
        node=root.find('dados')
        return [{child.tag:child.text or '' for child in item} for item in node] if node is not None else []
    return json.loads(raw)['dados']
def load_existing():
    if not OUTPUT.exists(): return {}
    raw=OUTPUT.read_text('utf-8')
    obj=json.loads(raw.split('=',1)[1].strip().rstrip(';'))
    return {int(p['id']):p for p in obj.get('items',[]) if isinstance(p,dict) and 'id' in p}
def classify(s):
    x=s.casefold()
    for name,patterns in (
      ('Educação',('educaç','escola','ensino','professor','estudant')),
      ('Saúde',('saúde','hospital','medicamento','vacina','doença')),
      ('Trabalho',('trabalh','emprego','salário','previdênc')),
      ('Consumo',('consumidor','consumo','comércio','tarifa')),
      ('Tecnologia',('internet','digital','dados pessoais','inteligência artificial')),
      ('Mobilidade',('transporte','trânsito','passageiro','aeroporto'))):
        if any(p in x for p in patterns):return name
    return 'Outros'
def update_party_directory():
    """Cache leve dos partidos registrados pela Câmara na 57ª legislatura."""
    target=ROOT/'dados'/'deputados-partidos.js'
    known={}
    if target.exists():
        try:
            known=json.loads(target.read_text('utf8').split('=',1)[1].strip().rstrip(';'))
        except (ValueError,TypeError):
            known={}
    ok=0
    for page in range(1,11):
        url='https://dadosabertos.camara.leg.br/api/v2/deputados?'+urllib.parse.urlencode({
            'idLegislatura':57,'itens':100,'pagina':page,'ordenarPor':'id','ordem':'ASC'
        })
        for retry in range(2):
            try:
                req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'OQueMuda/2.2'})
                with urllib.request.urlopen(req,timeout=10) as response:
                    body=response.read()
                if body.lstrip().startswith(b'<'):
                    root=ET.fromstring(body)
                    node=root.find('dados')
                    records=[{ch.tag:ch.text for ch in obj} for obj in node] if node is not None else []
                else:
                    records=json.loads(body)['dados']
                if not isinstance(records,list): raise ValueError('Lista de deputados inválida')
                for d in records:
                    ident=str(d.get('id') or '')
                    party=str(d.get('siglaPartido') or '').strip()
                    if ident.isdecimal() and party: known[ident]=party
                ok+=1
                print(f'PARTIDOS página {page}: {len(records)} deputados',flush=True)
                if len(records)<100: page=999
                break
            except Exception as exc:
                print(f'AVISO Deputados página {page} tentativa {retry+1}: {exc}',flush=True)
                if retry==0: time.sleep(1.2)
        if page==999: break
    if ok:
        tmp=target.with_suffix('.tmp')
        tmp.write_text('window.OBM_PARTIDOS_DEPUTADOS = '+json.dumps(known,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')
        tmp.replace(target)
    print(f'Partidos: {ok} páginas consultadas, {len(known)} deputados no cache.',flush=True)

def main():
    items=load_existing()
    ok=0; errors=[]
    for year in YEARS:
      for typ in TYPES:
        try:
          rows=fetch(year,typ)
          if not isinstance(rows,list): raise ValueError('Resposta inesperada')
          for p in rows:
            try:
              e=str(p.get('ementa') or '').strip()
              if not e: continue
              pid=int(p['id'])
              items[pid]={'id':pid,'numero':int(p['numero']),'ano':int(p['ano']),'siglaTipo':p.get('siglaTipo') or typ,'ementa':e,'dataApresentacao':p.get('dataApresentacao') or '', 'area':classify(e),'statusCurto':'Consultar situação'}
            except (KeyError,ValueError,TypeError):continue
          ok+=1
          print(f'OK {typ}/{year}: {len(rows)} registros recentes',flush=True)
        except Exception as err:
          errors.append(f'{typ}/{year}: {type(err).__name__}: {err}')
          print('AVISO:',errors[-1],flush=True)
        time.sleep(.12)
    summary=os.getenv('GITHUB_STEP_SUMMARY')
    message=f'Consultas: {ok}/{len(YEARS)*len(TYPES)}; índice de reserva: {len(items)} entradas. Falhas: {len(errors)}.'
    if summary:
        with open(summary,'a',encoding='utf8') as f:
            f.write('## Atualização de catálogo\n\n'+message+'\n\n'+('**Aviso:** API indisponível para algumas consultas; a versão anterior foi preservada onde necessário.\n' if errors else 'Todas as consultas de reserva responderam.\n'))
    print(message,flush=True)
    if ok==0:
      print('::warning title=API indisponível::Nenhuma consulta respondeu. Site continua consultando a API diretamente pelo navegador. Catálogo em cache preservado.',flush=True)
      return
    # Um snapshot recente, não todo o universo legislativo; o frontend usa paginação ao vivo.
    data={'generatedAt':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'source':'API Dados Abertos da Câmara','coverage':'Reserva parcial recente, não representa a totalidade de proposições','years':list(YEARS),'types':list(TYPES),'total':len(items),'items':sorted(items.values(),key=lambda x:x['id'],reverse=True)}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    tmp=OUTPUT.with_suffix('.tmp')
    tmp.write_text('window.OBM_DATA = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n','utf8')
    tmp.replace(OUTPUT)
    if errors: print(f'::warning title=Atualização parcial::{len(errors)} consultas falharam; registros anteriores preservados.',flush=True)
    update_party_directory()
if __name__=='__main__':main()
