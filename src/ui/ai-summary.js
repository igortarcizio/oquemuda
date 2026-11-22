// Resumo gerado por IA a partir do texto integral (tabela resumos_ia, preenchida por
// scripts/resumir_propostas.py). Só substitui o resumo automático; o texto validado
// pela redação continua com prioridade.
import {changeSectionFor,hasValidatedEditorial,AI_NOTICE_HTML} from './components.js?v=editorial-titles-lote-012';
import {hasCuratedTitle} from '../lib/titles.js?v=editorial-titles-lote-012';

const URL_RESUMOS='https://ltihbrlamevhmjjlsphc.supabase.co/rest/v1/resumos_ia';
const KEY='sb_publishable_SoAeylRxXXv38jw34drQFA_nbgItFPE';
const COLS='titulo,resumo,hoje,proposta,pontos,areas,modelo,gerado_em';
// Versão do texto que o resumo descreve (migration 20261119). Sem as colunas, lê sem elas.
const VERSION_COLS=',fonte_url,texto_versao,texto_data,texto_orgao';
let versionColumns=true;
const cache=new Map();   // id -> linha ou null
const pending=new Map(); // id -> Promise
let activeId=null;

export function stopAiSummary(){activeId=null;setAiFooterNotice(false)}

// Aviso de "Resumo gerado por IA" no rodapé da página, só enquanto a ficha aberta usa o resumo da IA.
export function setAiFooterNotice(show,doc=globalThis.document){
  if(!doc)return;
  let note=doc.getElementById('aiFooterNote');
  if(!show){note?.remove();return}
  if(note)return;
  const box=doc.querySelector('footer .footer-inner--source');
  if(!box)return;
  note=doc.createElement('p');
  note.id='aiFooterNote';note.className='source-footer ai-footer-note';note.setAttribute('role','note');
  note.innerHTML=AI_NOTICE_HTML;
  box.appendChild(note);
}

export async function fetchAiSummary(id,{fetchImpl=globalThis.fetch}={}){
  const url=cols=>URL_RESUMOS+'?'+new URLSearchParams({select:cols,proposicao_id:'eq.'+Number(id),limit:'1'}).toString();
  const headers={apikey:KEY,Accept:'application/json'};
  let res=await fetchImpl(url(COLS+(versionColumns?VERSION_COLS:'')),{headers});
  if(res.status===400&&versionColumns){versionColumns=false;res=await fetchImpl(url(COLS),{headers})}
  if(!res.ok)return null;
  const rows=await res.json();
  const row=Array.isArray(rows)?rows[0]:null;
  return row&&typeof row.resumo==='string'&&row.resumo.trim()?row:null;
}

function apply(p){
  const row=cache.get(Number(p.id));
  const section=document.querySelector('.change-section');
  if(!row||!section||section.dataset.ai==='1')return;
  section.outerHTML=changeSectionFor(p,row);
  const fresh=document.querySelector('.change-section');
  if(fresh)fresh.dataset.ai='1';
  setAiFooterNotice(true);
  applyDetailTitle(p,row);
  document.dispatchEvent(new CustomEvent('oquemuda:changesection'));
}

// Título curto da IA: só onde a redação não escreveu um título à mão.
export function aiTitleFor(p,row){
  const t=typeof row?.titulo==='string'?row.titulo.trim():'';
  if(!t||hasCuratedTitle(Number(p?.id))||hasValidatedEditorial(p))return '';
  return t;
}
function applyDetailTitle(p,row){
  const t=aiTitleFor(p,row),h=document.getElementById('detailTitle');
  if(!t||!h)return;
  h.textContent=t;h.classList.remove('long');h.dataset.fonte='ia';
  setTimeout(()=>{if(activeId===Number(p.id))document.title=t+' — O que muda?'},0);
}

// Cards da lista e do carrossel: busca os títulos curtos de uma vez, por página.
const titleCache=new Map(); // id -> titulo ou ''
export async function fetchAiTitles(ids,{fetchImpl=globalThis.fetch}={}){
  const want=[...new Set(ids.map(Number))].filter(id=>Number.isInteger(id)&&id>0&&!titleCache.has(id));
  if(!want.length)return titleCache;
  const q=new URLSearchParams({select:'proposicao_id,titulo',proposicao_id:'in.('+want.join(',')+')',titulo:'not.is.null'});
  try{
    const res=await fetchImpl(URL_RESUMOS+'?'+q.toString(),{headers:{apikey:KEY,Accept:'application/json'}});
    const rows=res.ok?await res.json():[];
    for(const id of want)titleCache.set(id,'');
    for(const r of Array.isArray(rows)?rows:[])if(r?.titulo)titleCache.set(Number(r.proposicao_id),String(r.titulo).trim());
  }catch{}
  return titleCache;
}
async function applyCardTitles(root=document){
  const links=[...root.querySelectorAll('.card:not(.reviewed) h3 a[href^="#/tema/"]:not([data-ai-title]), .related-card h3 a[href^="#/tema/"]:not([data-ai-title])')];
  if(!links.length)return;
  for(const a of links)a.dataset.aiTitle='pending';
  const id=a=>Number(a.getAttribute('href').split('/').pop());
  const cache=await fetchAiTitles(links.map(id));
  for(const a of links){
    const t=cache.get(id(a));
    a.dataset.aiTitle=t?'1':'0';
    if(t&&!hasCuratedTitle(id(a))){a.title=a.textContent;a.textContent=t}
  }
}
let timer=null;
export function watchCardTitles(root=document.querySelector('main')||document.body){
  if(!root||typeof MutationObserver==='undefined')return;
  const run=()=>{clearTimeout(timer);timer=setTimeout(()=>applyCardTitles(root),120)};
  new MutationObserver(run).observe(root,{childList:true,subtree:true});
  run();
}

export function mountAiSummary(p){
  const id=Number(p?.id);
  if(!Number.isInteger(id)||id<=0||hasValidatedEditorial(p))return;
  activeId=id;
  if(cache.has(id)){apply(p);return}
  if(!pending.has(id)){
    pending.set(id,fetchAiSummary(id).catch(()=>null).then(row=>{cache.set(id,row);pending.delete(id)}));
  }
  pending.get(id).then(()=>{if(activeId===id)apply(p)});
}
