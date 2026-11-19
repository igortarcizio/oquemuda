#!/usr/bin/env node
// Gera uma página de prévia por proposta: _site/p/{id}.html.
//
// Para que serve: WhatsApp, X e Facebook não rodam JavaScript e ignoram o que vem depois
// do "#". Sem esta página, todo link compartilhado mostraria a prévia genérica do site.
// Cada página tem título e resumo nas tags og:* e manda o leitor para #/tema/{id}.
//
// Roda só no deploy (.github/workflows/deploy-pages.yml); nada daqui vai para o Git.
// Uso: node scripts/gerar_previas.mjs <pasta de saída> [--sem-banco]
//
// Fonte: Supabase (proposicoes + resumos_ia publicados), com SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY. Sem banco (ou se ele falhar), usa dados/catalogo.js.
// Regras de texto em docs/compartilhamentos.md.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {displayTitle,isReviewed,hasCuratedTitle} from '../src/lib/titles.js';
import {editorialChange,plainSummary} from '../src/lib/changes.js';
import {ref} from '../src/lib/text.js';
import {SITE_URL,shareURL,detailHash} from '../src/lib/share.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const DESCRIPTION_LIMIT=160;
export const OG_IMAGE=SITE_URL+'og.png';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const oneLine=s=>String(s??'').replace(/\s+/g,' ').trim();

/** Corta por palavra inteira, sem deixar pontuação pendurada. */
export function clip(text,limit=DESCRIPTION_LIMIT){
  const t=oneLine(text);
  if(t.length<=limit)return t;
  const cut=t.slice(0,limit),space=cut.lastIndexOf(' ');
  return cut.slice(0,space>limit*0.6?space:limit).replace(/[\s.,;:–—-]+$/,'')+'…';
}

/**
 * Título e resumo da prévia, com as mesmas regras da tela:
 * título = displayTitle, trocado pelo da IA só onde a redação não escreveu um;
 * resumo = redação > IA > resumo automático da ementa. Nunca a situação.
 */
export function previewContent(p,editorial={},ai=null){
  const human=editorialChange(editorial);
  const aiTitle=oneLine(ai?.titulo);
  const title=oneLine(aiTitle&&!hasCuratedTitle(Number(p.id))&&!human?aiTitle:displayTitle(p,editorial))||ref(p);
  const summary=oneLine(human?.resumo)||(isReviewed(editorial)?oneLine(editorial.impacto):'')||oneLine(ai?.resumo)||oneLine(plainSummary(p,title))||oneLine(p.ementa);
  return {title,description:clip(summary)};
}

/** HTML da página de prévia. O redirecionamento é por script: robôs de prévia não seguem. */
export function previewHTML(p,{title,description}){
  const id=Number(p.id);
  if(!Number.isSafeInteger(id)||id<=0)throw new Error('id inválido: '+p.id);
  const url=shareURL(id),target='../'+detailHash(id),docref=ref(p);
  const desc=docref?docref+' · '+description:description;
  return '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n'+
    '<title>'+esc(title)+' — O que muda?</title>\n'+
    '<meta name="description" content="'+esc(desc)+'">\n'+
    '<meta name="robots" content="noindex">\n'+
    '<link rel="canonical" href="'+esc(url)+'">\n'+
    '<meta property="og:type" content="article">\n'+
    '<meta property="og:site_name" content="O que muda?">\n'+
    '<meta property="og:locale" content="pt_BR">\n'+
    '<meta property="og:title" content="'+esc(title)+'">\n'+
    '<meta property="og:description" content="'+esc(desc)+'">\n'+
    '<meta property="og:url" content="'+esc(url)+'">\n'+
    '<meta property="og:image" content="'+esc(OG_IMAGE)+'">\n'+
    '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'+
    '<meta property="og:image:alt" content="O que muda? Entenda as propostas da Câmara dos Deputados">\n'+
    '<meta name="twitter:card" content="summary_large_image">\n'+
    '<meta name="theme-color" content="#F4F0E6">\n'+
    '<link rel="icon" type="image/svg+xml" href="../favicon.svg">\n'+
    '<script>location.replace('+JSON.stringify(target)+')</script>\n'+
    '<style>body{font:16px/1.5 system-ui,sans-serif;background:#F4F0E6;color:#1f2a33;max-width:40rem;margin:3rem auto;padding:0 1.25rem}a{color:inherit}</style>\n'+
    '</head>\n<body>\n<p>'+esc(docref)+'</p>\n<h1>'+esc(title)+'</h1>\n<p>'+esc(description)+'</p>\n'+
    '<p><a href="'+esc(target)+'">Abrir a proposta no O que muda? →</a></p>\n</body>\n</html>\n';
}

// ---------- Leitura dos dados ----------

function loadGlobal(file,name){
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(join(ROOT,file),'utf8'),ctx,{filename:file});
  return ctx.window[name];
}

const fromCatalog=item=>({id:Number(item.id),siglaTipo:item.siglaTipo,numero:item.numero,ano:item.ano,ementa:item.ementa,tags:item.tags,dataApresentacao:item.dataApresentacao});
const fromRow=d=>({id:Number(d.id),siglaTipo:d.sigla_tipo,numero:d.numero,ano:d.ano,ementa:d.ementa,tags:d.tags,dataApresentacao:d.data_apresentacao});

async function fetchAll(base,key,table,params,{page=1000,fetchImpl=globalThis.fetch}={}){
  const rows=[];
  for(let offset=0;;offset+=page){
    const q=new URLSearchParams({...params,limit:String(page),offset:String(offset)});
    const res=await fetchImpl(base.replace(/\/$/,'')+'/rest/v1/'+table+'?'+q,{headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'}});
    if(!res.ok)throw new Error(table+': HTTP '+res.status);
    const batch=await res.json();
    rows.push(...batch);
    if(batch.length<page)return rows;
  }
}

export async function loadData({useDatabase=true,env=process.env,log=console.log}={}){
  const editorial=loadGlobal('dados/editorial.js','OBM_EDITORIAL')||{};
  const byId=new Map();
  for(const item of loadGlobal('dados/catalogo.js','OBM_DATA')?.items||[]){const p=fromCatalog(item);if(p.id)byId.set(p.id,p)}
  const ai=new Map();
  let source='catálogo local';
  if(useDatabase&&env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY){
    try{
      const rows=await fetchAll(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,'proposicoes',{select:'id,sigla_tipo,numero,ano,ementa,tags,data_apresentacao',order:'id.asc'});
      for(const d of rows){const p=fromRow(d);if(p.id)byId.set(p.id,p)}
      source='Supabase ('+rows.length+') + catálogo local';
    }catch(e){log('Aviso: proposições do banco indisponíveis, usando só o catálogo local. '+e.message)}
    try{
      const rows=await fetchAll(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,'resumos_ia',{select:'proposicao_id,titulo,resumo',status:'eq.publicado',order:'proposicao_id.asc'});
      for(const r of rows)ai.set(Number(r.proposicao_id),r);
    }catch(e){log('Aviso: resumos da IA indisponíveis; prévias usam o resumo automático. '+e.message)}
  }
  return {proposals:[...byId.values()],editorial,ai,source};
}

export async function generate(outDir,opts={}){
  const {proposals,editorial,ai,source}=await loadData(opts);
  mkdirSync(outDir,{recursive:true});
  let written=0;
  for(const p of proposals){
    if(!Number.isSafeInteger(p.id)||p.id<=0||!p.ementa)continue;
    const e=editorial[String(p.id)]||{};
    writeFileSync(join(outDir,p.id+'.html'),previewHTML(p,previewContent(p,e,ai.get(p.id))));
    written++;
  }
  (opts.log||console.log)('Prévias geradas: '+written+' (fonte: '+source+', resumos da IA: '+ai.size+')');
  return written;
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
  const args=process.argv.slice(2);
  const out=args.find(a=>!a.startsWith('--'));
  if(!out){console.error('Uso: node scripts/gerar_previas.mjs <pasta de saída> [--sem-banco]');process.exit(2)}
  generate(resolve(out),{useDatabase:!args.includes('--sem-banco')}).catch(e=>{console.error(e);process.exit(1)});
}
