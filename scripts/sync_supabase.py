#!/usr/bin/env python3
"""Sincronização incremental segura da Câmara para o Supabase.
Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nos secrets do GitHub.
"""
import json, os, sys, time, urllib.parse, urllib.request, urllib.error, datetime
BASE='https://dadosabertos.camara.leg.br/api/v2'
DB=os.environ['SUPABASE_URL'].rstrip('/')
KEY=os.environ['SUPABASE_SERVICE_ROLE_KEY']
def read(url,headers=None):
    req=urllib.request.Request(url,headers=headers or {'Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=8) as r:return json.load(r)

def official(url):
    try:return read(url)
    except urllib.error.HTTPError as exc:
        if exc.code in (429,500,502,503,504):
            raise RuntimeError('API da Câmara indisponível (HTTP %s); encerrando lote sem repetir consultas' % exc.code) from exc
        raise
def upsert(rows):
    if not rows:return
    payload=json.dumps(rows,ensure_ascii=False).encode()
    req=urllib.request.Request(DB+'/rest/v1/proposicoes?on_conflict=id',data=payload,method='POST',headers={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'})
    with urllib.request.urlopen(req,timeout=40) as response:response.read()
def update_status(id,detail,authors,stamp):
    stage=detail.get('statusProposicao') or {}
    saved={'statusProposicao':stage,'urlInteiroTeor':detail.get('urlInteiroTeor'),'autores':authors,'autoresConsultados':authors is not None}
    payload=json.dumps({'situacao_codigo':stage.get('codSituacao'),'situacao_descricao':stage.get('descricaoSituacao'),'situacao_atualizada_em':stamp,'atualizado_em':stamp,'dados_oficiais':saved},ensure_ascii=False).encode()
    req=urllib.request.Request(DB+'/rest/v1/proposicoes?id=eq.'+str(id),data=payload,method='PATCH',headers={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json','Prefer':'return=minimal'})
    with urllib.request.urlopen(req,timeout=30) as response:response.read()

def main():
    count=0;checked=0;stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
    for year in [datetime.date.today().year,datetime.date.today().year-1]:
        for kind in ['PL','PLP','PEC','MPV','PDL','PRC']:
            # Janela recente por tipo/ano; execução periódica, sem alegar cobertura integral.
            qs=urllib.parse.urlencode({'ano':year,'siglaTipo':kind,'itens':100,'pagina':1,'ordenarPor':'id','ordem':'DESC'})
            try:items=official(BASE+'/proposicoes?'+qs)['dados']
            except RuntimeError as exc:print(exc,flush=True);sys.exit(2)
            except Exception as exc:print('Falha na lista',kind,year,exc,flush=True);continue
            rows=[]
            for p in items:
                rows.append({'id':p['id'],'sigla_tipo':p.get('siglaTipo',kind),'numero':p.get('numero'),'ano':p.get('ano'),'ementa':p.get('ementa',''),'data_apresentacao':(p.get('dataApresentacao') or '')[:10] or None,'uri_oficial':p.get('uri'),'coletado_em':stamp,'atualizado_em':stamp})
            try:upsert(rows);count+=len(rows)
            except Exception as exc:print('Falha ao gravar',kind,year,exc)
            time.sleep(0.4)
    # Atualizar situações de uma amostra rotativa de registros já existentes.
    for offset in [0]:
        url=DB+'/rest/v1/proposicoes?select=id&order=situacao_atualizada_em.asc.nullsfirst&limit=20&offset='+str(offset)
        try:ids=read(url,{'apikey':KEY,'Authorization':'Bearer '+KEY,'Accept':'application/json'})
        except Exception as exc:print('Falha ao ler IDs',exc);break
        for p in ids:
            try:
                detail=official(BASE+'/proposicoes/'+str(p['id']))['dados']
                stage=detail.get('statusProposicao') or {}
                authors=None
                try:
                    rows=official(BASE+'/proposicoes/'+str(p['id'])+'/autores')['dados']
                    authors=[{'nome':a.get('nome') or a.get('tipo') or 'Autoria institucional','partido':a.get('siglaPartido')} for a in rows[:10]]
                except RuntimeError:raise
                except Exception as exc:print('Autoria pendente',p['id'],str(exc)[:100],flush=True)
                update_status(p['id'],detail,authors,stamp)
                checked+=1
            except RuntimeError as exc:
                print(exc,flush=True)
                sys.exit(2)
            except Exception as exc:print('Falha no detalhe',p['id'],str(exc)[:100])
            time.sleep(0.3)
    print('Listagens processadas:',count,'situações atualizadas:',checked,flush=True)
if __name__=='__main__':main()
