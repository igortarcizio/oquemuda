// Resumo gerado por IA a partir do texto integral (tabela resumos_ia, preenchida por
// scripts/resumir_propostas.py). Só substitui o resumo automático; o texto validado
// pela redação continua com prioridade.
import {changeSectionFor,hasValidatedEditorial} from './components.js?v=resumos-ia-1';

const URL_RESUMOS='https://ltihbrlamevhmjjlsphc.supabase.co/rest/v1/resumos_ia';
const KEY='sb_publishable_SoAeylRxXXv38jw34drQFA_nbgItFPE';
const COLS='resumo,hoje,proposta,pontos,areas,modelo,gerado_em';
const cache=new Map();   // id -> linha ou null
const pending=new Map(); // id -> Promise
let activeId=null;

export function stopAiSummary(){activeId=null}

export async function fetchAiSummary(id,{fetchImpl=globalThis.fetch}={}){
  const q=new URLSearchParams({select:COLS,proposicao_id:'eq.'+Number(id),limit:'1'});
  const res=await fetchImpl(URL_RESUMOS+'?'+q.toString(),{headers:{apikey:KEY,Accept:'application/json'}});
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
