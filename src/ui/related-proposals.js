import {normalizeProposal,SourceError} from '../data/api.js';
import {safeText,ref,dateBR} from '../lib/text.js';
import {proposalTags} from '../lib/tags.js';
import {displayTitle} from '../lib/titles.js?v=editorial-titles-lote-005-regras';

const DB_URL='https://ltihbrlamevhmjjlsphc.supabase.co/rest/v1/proposicoes';
const DB_KEY='sb_publishable_SoAeylRxXXv38jw34drQFA_nbgItFPE';
const SIZE=3, MAX=9, INTERVAL=8000;
let activeController=null, activeTimer=null;

export function rankRelated(source,candidates) {
  const sourceTags=new Set((source.tags||[]).filter(Boolean));
  if(!sourceTags.size)return [];
  const seen=new Set();
  return candidates.filter(p=>{
    if(!p||!Number.isInteger(Number(p.id))||Number(p.id)===Number(source.id)||seen.has(Number(p.id)))return false;
    seen.add(Number(p.id));
    return Array.isArray(p.tags)&&p.tags.some(t=>sourceTags.has(t))&&p.ementa&&p.numero&&p.ano;
  }).map(p=>({
    proposal:p,
    matches:p.tags.filter(t=>sourceTags.has(t)),
  })).sort((a,b)=>b.matches.length-a.matches.length ||
    String(b.proposal.dataApresentacao||'').localeCompare(String(a.proposal.dataApresentacao||'')) ||
    Number(b.proposal.id)-Number(a.proposal.id)).slice(0,MAX);
}

async function fetchRelated(source,signal) {
  const tags=[...new Set((source.tags||[]).filter(t=>typeof t==='string'&&/^[\p{L}0-9+ -]{1,80}$/u.test(t)))];
  if(!tags.length)return [];
  const q=new URLSearchParams({
    select:'id,sigla_tipo,numero,ano,ementa,tags,data_apresentacao',
    tags:'ov.{'+tags.map(t=>'"'+t.replaceAll('"','')+'"').join(',')+'}',
    id:'neq.'+Number(source.id),
    order:'data_apresentacao.desc,id.desc',
    limit:'120'
  });
  const res=await fetch(DB_URL+'?'+q.toString(),{
    headers:{apikey:DB_KEY,Accept:'application/json'},signal
  });
  if(!res.ok)throw new SourceError('Consulta de propostas relacionadas: HTTP '+res.status);
  const rows=await res.json();
  if(!Array.isArray(rows))throw new SourceError('Dados de propostas relacionadas inválidos');
  return rows.map(d=>normalizeProposal({
    id:d.id,siglaTipo:d.sigla_tipo,numero:d.numero,ano:d.ano,
    ementa:d.ementa,tags:d.tags,dataApresentacao:d.data_apresentacao
  },window.OBM_EDITORIAL?.[String(d.id)]||{}));
}

function localRelated(source) {
  const entries=[...(window.OBM_DATA?.items||[])];
  return entries.map(p=>normalizeProposal(p,window.OBM_EDITORIAL?.[String(p.id)]||{}));
}

function makeCard({proposal:p,matches}) {
  const article=document.createElement('article');
  article.className='related-card';
  article.dataset.area=p.area;
  const topic=document.createElement('p');
  topic.className='topic-label';
  topic.textContent=p.area;
  const reference=document.createElement('p');
  reference.className='docref';
  reference.textContent=ref(p)+' · '+dateBR(p.dataApresentacao);
  const heading=document.createElement('h3');
  const link=document.createElement('a');
  link.href='#/tema/'+Number(p.id);
  link.textContent=displayTitle(p,window.OBM_EDITORIAL?.[String(p.id)]||{});
  heading.append(link);
  const tags=document.createElement('div');
  tags.className='related-card-tags';
  tags.setAttribute('aria-label','Tags em comum');
  for(const tag of matches.slice(0,3)){
    const label=document.createElement('span');
    label.className='microtag';
    label.textContent=tag;
    tags.append(label);
  }
  const hint=document.createElement('span');
  hint.className='related-card-hint';
  hint.textContent='Ler proposta →';
  article.append(topic,reference,heading,tags,hint);
  return article;
}

function render(root,ranked) {
  const totalPages=Math.ceil(ranked.length/SIZE);
  let page=0,paused=false;
  const header=document.createElement('div');
  header.className='related-heading';
  const intro=document.createElement('div');
  intro.innerHTML='<p class="eyebrow">CONTINUE EXPLORANDO</p><h2 id="relatedHeading">Propostas relacionadas</h2><p class="related-description">Propostas que compartilham assuntos com esta ficha.</p>';
  const controls=document.createElement('div');
  controls.className='related-controls';
  const prev=document.createElement('button');
  prev.type='button';prev.className='related-arrow';prev.textContent='‹';prev.setAttribute('aria-label','Ver três propostas anteriores');prev.setAttribute('aria-controls','relatedCards');
  const next=document.createElement('button');
  next.type='button';next.className='related-arrow';next.textContent='›';next.setAttribute('aria-label','Ver próximas três propostas');next.setAttribute('aria-controls','relatedCards');
  controls.append(prev,next);header.append(intro,controls);
  const viewport=document.createElement('div');
  viewport.className='related-viewport';
  const cards=document.createElement('div');cards.id='relatedCards';cards.className='related-grid';
  viewport.append(cards);
  const position=document.createElement('p');position.className='related-position';
  position.setAttribute('aria-live','off');
  const announcement=document.createElement('p');
  announcement.className='sr-only';
  announcement.setAttribute('aria-live','polite');
  root.replaceChildren(header,viewport,position,announcement);
  root.hidden=false;
  function show(nextPage,manual=false){
    page=(nextPage+totalPages)%totalPages;
    cards.replaceChildren(...ranked.slice(page*SIZE,(page+1)*SIZE).map(makeCard));
    position.textContent=(page*SIZE+1)+'–'+Math.min((page+1)*SIZE,ranked.length)+' de '+ranked.length+' propostas';
    if(manual)announcement.textContent='Grupo '+(page+1)+' de '+totalPages+' de propostas relacionadas';
  }
  show(0);
  prev.disabled=next.disabled=totalPages<2;
  prev.addEventListener('click',()=>show(page-1,true));
  next.addEventListener('click',()=>show(page+1,true));
  root.addEventListener('mouseenter',()=>{paused=true});
  root.addEventListener('mouseleave',()=>{paused=false});
  root.addEventListener('focusin',()=>{paused=true});
  root.addEventListener('focusout',e=>{if(!root.contains(e.relatedTarget))paused=false});
  if(totalPages>1){
    activeTimer=setInterval(()=>{
      if(!paused&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&root.isConnected)show(page+1);
    },INTERVAL);
  }
}

export async function mountRelated(source) {
  activeController?.abort();
  if(activeTimer!==null){clearInterval(activeTimer);activeTimer=null}
  const root=document.getElementById('relatedProposals');
  if(!root)return;
  root.hidden=true;
  root.replaceChildren();
  if(!source?.id||!Array.isArray(source.tags)||!source.tags.length)return;
  const controller=new AbortController();activeController=controller;
  let candidates;
  try { candidates=await fetchRelated(source,controller.signal); }
  catch {
    if(controller.signal.aborted)return;
    candidates=localRelated(source);
  }
  if(controller.signal.aborted||document.getElementById('relatedProposals')!==root)return;
  const ranked=rankRelated(source,candidates);
  if(!ranked.length)return;
  render(root,ranked);
}

export function stopRelated() {
  activeController?.abort();activeController=null;
  if(activeTimer!==null){clearInterval(activeTimer);activeTimer=null}
}
