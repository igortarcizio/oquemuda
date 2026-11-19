#!/usr/bin/env node
// Aplica os temas oficiais da Câmara às propostas do banco.
// Fonte: arquivos anuais proposicoesTemas-AAAA.csv (Dados Abertos da Câmara).
// Regra: src/lib/temas-oficiais.js (a mesma que o site usa). Grava só o que mudou,
// em lotes, pela função public.aplicar_temas (migration 20261119_temas_oficiais.sql).
// Proposta ainda sem tema oficial fica como está: o site usa o tema calculado (provisório).
//
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (obrigatórias); ANOS (opcional, "2026,2025").
import {pathToFileURL} from 'node:url';
import {appendFileSync} from 'node:fs';
import {classifyTheme} from '../src/lib/text.js';
import {temasDoSite} from '../src/lib/temas-oficiais.js';

const ARQUIVOS='https://dadosabertos.camara.leg.br/arquivos/proposicoesTemas/csv/proposicoesTemas-';
const UA='OQueMuda/1.0 (temas oficiais; dados abertos)';
const LOTE=500;

/** CSV da Câmara: ponto e vírgula, campos entre aspas. */
export function parseCsv(text){
 const rows=[];let row=[],field='',quoted=false;
 const src=String(text||'').replace(/^﻿/,'');
 for(let i=0;i<src.length;i++){
  const ch=src[i];
  if(quoted){
   if(ch==='"'){if(src[i+1]==='"'){field+='"';i++}else quoted=false}
   else field+=ch;
  }else if(ch==='"')quoted=true;
  else if(ch===';'){row.push(field);field=''}
  else if(ch==='\n'||ch==='\r'){
   if(ch==='\r'&&src[i+1]==='\n')i++;
   row.push(field);field='';if(row.some(v=>v!==''))rows.push(row);row=[];
  }else field+=ch;
 }
 row.push(field);if(row.some(v=>v!==''))rows.push(row);
 if(!rows.length)return [];
 const head=rows[0].map(h=>h.trim());
 return rows.slice(1).map(r=>Object.fromEntries(head.map((h,i)=>[h,(r[i]??'').trim()])));
}

/** Map id → [{cod, tema, relevancia}] sem repetir o mesmo tema. */
export function temasPorProposta(registros){
 const out=new Map();
 for(const r of registros){
  const id=Number(String(r.uriProposicao||'').match(/\/proposicoes\/(\d+)/)?.[1]);
  const cod=Number(r.codTema);
  if(!Number.isInteger(id)||!Number.isInteger(cod))continue;
  if(!out.has(id))out.set(id,[]);
  const lista=out.get(id);
  if(!lista.some(t=>t.cod===cod))lista.push({cod,tema:r.tema||'',relevancia:Number(r.relevancia)||0});
 }
 for(const lista of out.values())lista.sort((a,b)=>b.relevancia-a.relevancia||a.cod-b.cod);
 return out;
}

const igual=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);

/** O que gravar: só propostas com tema oficial e que mudaram. Nunca apaga. */
export function planejar(linhasDoBanco,temas){
 const updates=[];let semTema=0;
 for(const p of linhasDoBanco){
  const lista=temas.get(Number(p.id));
  if(!lista){semTema++;continue}
  const calculado=classifyTheme({ementa:p.ementa,tags:p.tags,siglaTipo:p.sigla_tipo});
  const site=temasDoSite(lista,calculado);
  if(!site)continue;
  const temasOficiais=lista.map(t=>({cod:t.cod,tema:t.tema}));
  if(p.area===site.area&&igual(p.areas,site.areas)&&igual(p.temas_oficiais,temasOficiais))continue;
  updates.push({id:Number(p.id),area:site.area,areas:site.areas,temas_oficiais:temasOficiais});
 }
 return {updates,semTema};
}

async function texto(url,tentativas=3){
 let ultimo;
 for(let i=0;i<tentativas;i++){
  try{
   const r=await fetch(url,{headers:{'User-Agent':UA,Accept:'text/csv,*/*'}});
   if(r.ok)return await r.text();
   ultimo=new Error('HTTP '+r.status);
   if(r.status<500&&r.status!==429)break;
  }catch(e){ultimo=e}
  await new Promise(z=>setTimeout(z,3000*(i+1)));
 }
 throw ultimo;
}

async function main(){
 const base=(process.env.SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
 if(!base.startsWith('https://')||!key){console.error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');process.exit(1)}
 const headers={apikey:key,Authorization:'Bearer '+key,Accept:'application/json'};
 const iniciado=new Date().toISOString();
 const hoje=new Date().getUTCFullYear();
 const anos=(process.env.ANOS||`${hoje},${hoje-1}`).split(',').map(Number).filter(Boolean);

 // 1. Temas oficiais dos anos cobertos. Ano que falhar fica de fora (não apaga nada).
 const registros=[],anosOk=[];
 for(const ano of anos){
  try{const r=parseCsv(await texto(ARQUIVOS+ano+'.csv'));registros.push(...r);anosOk.push(ano);console.log(`Temas ${ano}: ${r.length} linhas`)}
  catch(e){console.log(`::warning::Arquivo de temas de ${ano} indisponível (${e.message}); fica para a próxima rodada.`)}
 }
 if(!anosOk.length){console.log('::error::Nenhum arquivo de temas disponível.');process.exit(2)}
 const temas=temasPorProposta(registros);

 // 2. Propostas do banco desses anos.
 const linhas=[];
 for(let off=0;;off+=1000){
  const q=new URLSearchParams({select:'id,ano,sigla_tipo,ementa,tags,area,areas,temas_oficiais',ano:'in.('+anosOk.join(',')+')',order:'id',limit:'1000',offset:String(off)});
  const r=await fetch(base+'/rest/v1/proposicoes?'+q,{headers});
  if(r.status===400){console.log('::error::Colunas de tema ausentes: aplique a migration 20261119_temas_oficiais.sql.');process.exit(2)}
  if(!r.ok)throw new Error('Banco: HTTP '+r.status);
  const page=await r.json();linhas.push(...page);if(page.length<1000)break;
 }

 // 3. Grava só o que mudou.
 const {updates,semTema}=planejar(linhas,temas);
 let gravadas=0;
 for(let i=0;i<updates.length;i+=LOTE){
  const r=await fetch(base+'/rest/v1/rpc/aplicar_temas',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({dados:updates.slice(i,i+LOTE)})});
  if(!r.ok)throw new Error('Gravação: HTTP '+r.status+' '+(await r.text()).slice(0,200));
  gravadas+=Number(await r.json())||0;
 }
 const resumo=`## Temas oficiais\n\nAnos: ${anosOk.join(', ')} · propostas no banco: ${linhas.length} · com tema oficial: ${linhas.length-semTema} · `+
  `ainda sem tema (provisório): ${semTema} · atualizadas agora: ${gravadas}.\n`;
 console.log(resumo);
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,resumo);
 // Registro da execução (tabela sync_runs); falha aqui não derruba o robô.
 try{
  await fetch(base+'/rest/v1/sync_runs',{method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'return=minimal'},
   body:JSON.stringify({robo:'aplicar_temas',iniciado_em:iniciado,ok:anosOk.length===anos.length,fichas:gravadas,listagens:linhas.length,
    erro:anosOk.length===anos.length?null:'Arquivo de temas indisponível para parte dos anos',
    execucao_url:process.env.GITHUB_RUN_ID?`${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null})});
 }catch{}
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main().catch(e=>{console.error(e);process.exit(1)});
