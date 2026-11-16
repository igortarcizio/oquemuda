// Termômetro dos leitores na ficha da proposta.
// Fica escondido enquanto as funções do banco não existem ou não respondem.
import {VOTE_OPTIONS,MIN_VOTES,fetchVotes,castVote,myVote,rememberVote,summarize,applyVote,voteErrorMessage} from '../data/votes.js';

const ICONS={
  favor:'<path d="M7 10v10H4V10h3Zm2 10h8.2a2 2 0 0 0 2-1.6l1.2-6A2 2 0 0 0 18.4 10H14l.8-3.8A1.8 1.8 0 0 0 13 4l-4 6v10Z"/>',
  neutro:'<path d="M5 12h14"/>',
  contra:'<path d="M7 14V4H4v10h3Zm2-10h8.2a2 2 0 0 1 2 1.6l1.2 6a2 2 0 0 1-2 2.4H14l.8 3.8A1.8 1.8 0 0 1 13 20l-4-6V4Z"/>'
};
const icon=k=>'<svg class="vote-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+ICONS[k]+'</svg>';
const plural=(n,one,many)=>n.toLocaleString('pt-BR')+' '+(n===1?one:many);

const cache=new Map();      // id -> {counts, revealed}
const loading=new Map();    // id -> Promise
let unavailable=false;      // funções ausentes no banco: não insistir nesta visita
let activeId=null;

export function stopVotes(){activeId=null}

export function mountVotes(proposal){
  const root=document.getElementById('readerVotes');
  const id=Number(proposal?.id);
  if(!root||!Number.isInteger(id)||id<=0||unavailable){if(root)root.hidden=true;return}
  activeId=id;
  const known=cache.get(id);
  if(known){render(root,id);return}
  root.hidden=true;
  if(!loading.has(id)){
    loading.set(id,fetchVotes(id).then(counts=>{
      cache.set(id,{counts,revealed:myVote(id)!==null});
    }).catch(error=>{
      if(error?.code==='PGRST202'||error?.code==='404')unavailable=true;
      throw error;
    }).finally(()=>loading.delete(id)));
  }
  loading.get(id).then(()=>{
    const current=document.getElementById('readerVotes');
    if(current&&activeId===id)render(current,id);
  }).catch(()=>{});
}

function render(root,id){
  if(root.dataset.votesId===String(id)){update(root,id);return}
  root.dataset.votesId=String(id);
  root.innerHTML=
    '<p class="eyebrow">TERMÔMETRO DOS LEITORES</p>'+
    '<h2 id="votesHeading">O que você acha desta proposta?</h2>'+
    '<div class="vote-buttons" role="group" aria-labelledby="votesHeading">'+
    VOTE_OPTIONS.map(o=>'<button type="button" class="vote-btn vote-'+o.key+'" data-vote="'+o.value+'" aria-pressed="false">'+icon(o.key)+'<span>'+o.label+'</span></button>').join('')+
    '</div>'+
    '<div class="vote-result"></div>'+
    '<p class="vote-status" role="status"></p>'+
    '<p class="small-note">Um voto por navegador, anônimo, e dá para trocar quando quiser. É a opinião de quem lê o site: não é pesquisa e não representa a população.</p>';
  root.hidden=false;
  update(root,id);
  root.addEventListener('click',e=>{
    const btn=e.target.closest('[data-vote]');
    if(btn){vote(root,id,Number(btn.dataset.vote));return}
    if(e.target.closest('[data-reveal]')){
      const s=cache.get(id);if(!s)return;
      s.revealed=true;update(root,id);
      const st=root.querySelector('.vote-status');if(st)st.textContent=summaryText(s.counts);
    }
  });
}

function update(root,id){
  const s=cache.get(id);if(!s)return;
  const mine=myVote(id);
  for(const b of root.querySelectorAll('[data-vote]')){
    const on=Number(b.dataset.vote)===mine;
    b.setAttribute('aria-pressed',String(on));b.classList.toggle('selected',on);
  }
  root.querySelector('.vote-result').innerHTML=resultHTML(s,mine);
}

export function resultHTML(s,mine){
  if(!s.revealed)return '<button type="button" class="quiet-btn" data-reveal>Ver resultado sem votar</button>';
  const {total,pct,enough}=summarize(s.counts);
  if(!enough){
    return '<p class="vote-few">'+(total?'Poucos votos até agora ('+plural(total,'voto','votos')+').':'Ainda não há votos.')+
      ' O resultado aparece a partir de '+MIN_VOTES+' votos.</p>';
  }
  const rows=VOTE_OPTIONS.map(o=>
    '<li class="vote-row vote-'+o.key+(o.value===mine?' mine':'')+'">'+
    '<span class="vote-label">'+o.label+(o.value===mine?' <span class="vote-you">(seu voto)</span>':'')+'</span>'+
    '<span class="vote-bar" aria-hidden="true"><span style="width:'+pct[o.key]+'%"></span></span>'+
    '<span class="vote-pct">'+pct[o.key]+'%<span class="sr-only"> ('+plural(s.counts[o.key],'voto','votos')+')</span></span></li>').join('');
  return '<ul class="vote-rows" aria-label="Resultado do termômetro">'+rows+'</ul><p class="vote-total">'+plural(total,'voto','votos')+' no total</p>';
}

export function summaryText(counts){
  const {total,pct,enough}=summarize(counts);
  if(!enough)return 'Resultado ainda sem votos suficientes.';
  return 'Resultado: '+VOTE_OPTIONS.map(o=>o.label.toLowerCase()+' '+pct[o.key]+'%').join(', ')+', em '+plural(total,'voto','votos')+'.';
}

async function vote(root,id,value){
  const s=cache.get(id);if(!s)return;
  const previous=myVote(id);
  if(previous===value){s.revealed=true;update(root,id);return}
  const before={counts:s.counts,revealed:s.revealed};
  const status=root.querySelector('.vote-status');
  s.counts=applyVote(s.counts,previous,value);s.revealed=true;
  rememberVote(id,value);update(root,id);
  if(status)status.textContent='Voto registrado: '+VOTE_OPTIONS.find(o=>o.value===value).label+'.';
  try{
    const counts=await castVote(id,value);
    // Só aplica a contagem do servidor se o leitor não trocou de voto no meio do caminho.
    if(myVote(id)===value){s.counts=counts;if(root.isConnected)update(root,id)}
  }catch(error){
    if(myVote(id)!==value)return;
    rememberVote(id,previous);s.counts=before.counts;s.revealed=before.revealed;
    if(root.isConnected){update(root,id);const st=root.querySelector('.vote-status');if(st)st.textContent=voteErrorMessage(error)}
  }
}
