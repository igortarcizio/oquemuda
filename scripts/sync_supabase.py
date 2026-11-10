#!/usr/bin/env python3
"""Sincronização incremental segura da Câmara para o Supabase.
Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nos secrets do GitHub.
"""
import json, os, time, urllib.parse, urllib.request, datetime
BASE='https://dadosabertos.camara.leg.br/api/v2'
DB=os.environ['SUPABASE_URL'].rstrip('/')
KEY=os.environ['SUPABASE_SERVICE_ROLE_KEY']
def read(url,headers=None):
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers=headers or {'Accept':'application/json'})
            with urllib.request.urlopen(req,timeout=25) as r:return json.load(r)
        except Exception:
            if attempt==2:raise
            time.sleep(2*(attempt+1))
def upsert(rows):
    if not rows:return
    payload=json.dumps(rows,ensure_ascii=False).encode()
    req=urllib.request.Request(DB+'/rest/v1/proposicoes?on_conflict=id',data=payload,method='POST',headers={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'})
    with urllib.request.urlopen(req,timeout=40) as response:response.read()
def update_status(id,stage,stamp):
    payload=json.dumps({'situacao_codigo':stage.get('codSituacao'),'situacao_descricao':stage.get('descricaoSituacao'),'situacao_atualizada_em':stamp,'atualizado_em':stamp}).encode()
    req=urllib.request.Request(DB+'/rest/v1/proposicoes?id=eq.'+str(id),data=payload,method='PATCH',headers={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json','Prefer':'return=minimal'})
    with urllib.request.urlopen(req,timeout=30) as response:response.read()

def main():
    count=0;stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
    for year in [datetime.date.today().year,datetime.date.today().year-1]:
        for kind in ['PL','PLP','PEC','MPV','PDL','PRC']:
            # Janela recente por tipo/ano; execução periódica, sem alegar cobertura integral.
            qs=urllib.parse.urlencode({'ano':year,'siglaTipo':kind,'itens':100,'pagina':1,'ordenarPor':'id','ordem':'DESC'})
            try:items=read(BASE+'/proposicoes?'+qs)['dados']
            except Exception as exc:print('Falha na lista',kind,year,exc);continue
            rows=[]
            for p in items:
                rows.append({'id':p['id'],'sigla_tipo':p.get('siglaTipo',kind),'numero':p.get('numero'),'ano':p.get('ano'),'ementa':p.get('ementa',''),'data_apresentacao':(p.get('dataApresentacao') or '')[:10] or None,'uri_oficial':p.get('uri'),'coletado_em':stamp,'atualizado_em':stamp})
            try:upsert(rows);count+=len(rows)
            except Exception as exc:print('Falha ao gravar',kind,year,exc)
            time.sleep(0.4)
    # Atualizar situações de uma amostra rotativa de registros já existentes.
    for offset in [0,100,200]:
        url=DB+'/rest/v1/proposicoes?select=id&order=atualizado_em.asc&limit=100&offset='+str(offset)
        try:ids=read(url,{'apikey':KEY,'Authorization':'Bearer '+KEY,'Accept':'application/json'})
        except Exception as exc:print('Falha ao ler IDs',exc);break
        for p in ids:
            try:
                detail=read(BASE+'/proposicoes/'+str(p['id']))['dados']
                stage=detail.get('statusProposicao') or {}
                if stage.get('codSituacao') is None:continue
                update_status(p['id'],stage,stamp)
            except Exception as exc:print('Falha no detalhe',p['id'],str(exc)[:100])
            time.sleep(0.3)
    print('Listagens processadas:',count)
if __name__=='__main__':main()
