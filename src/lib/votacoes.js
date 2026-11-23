// "Como votaram": votações da proposta na Câmara (coluna proposicoes.votacoes, gravada por
// scripts/sync_votacoes.py a partir de /proposicoes/{id}/votacoes, /votacoes/{id}/votos e /orientacoes).
// Só as votações nominais têm voto de cada deputado; nas simbólicas a Câmara registra apenas o resultado.
import {safeText,dateBR} from './text.js';
import {orgaoRotulo} from './orgaos.js';

const str=(v,max=400)=>typeof v==='string'&&v.trim()?v.replace(/\s+/g,' ').trim().slice(0,max):'';
const int=v=>Number.isInteger(v)&&v>=0?v:0;
const TIPOS=new Set(['texto','urgencia','requerimento','emenda','outra']);
// Como a Câmara escreve o voto → grupo da ficha.
const GRUPO={'Sim':'sim','Não':'nao','Abstenção':'outros','Obstrução':'outros','Artigo 17':'outros'};
const VOTO_ROTULO={'Artigo 17':'não votou (presidia a sessão)','Obstrução':'obstrução','Abstenção':'abstenção'};
const DEP_URL=id=>'https://www.camara.leg.br/deputados/'+id;

/** Dado gravado pelo robô, validado; null quando ainda não consultado. */
export function normalizeVotacoes(raw){
 if(!Array.isArray(raw))return null;
 return raw.filter(v=>v&&typeof v==='object'&&str(v.descricao)).map(v=>{
  const p=v.placar&&typeof v.placar==='object'?v.placar:null;
  const votos=Array.isArray(v.votos)?v.votos.filter(x=>Array.isArray(x)&&str(x[1],120)&&GRUPO[x[4]]).map(x=>({
   id:Number.isInteger(x[0])?x[0]:null,nome:str(x[1],120),partido:str(x[2],20),uf:/^[A-Z]{2}$/.test(x[3]||'')?x[3]:'',voto:x[4]})):[];
  return {
   id:str(String(v.id??''),40),data:/^\d{4}-\d{2}-\d{2}/.test(v.data||'')?v.data:'',orgao:str(v.orgao,20),
   descricao:str(v.descricao),aprovacao:v.aprovacao===1?true:v.aprovacao===0?false:null,
   tipo:TIPOS.has(v.tipo)?v.tipo:'outra',nominal:v.nominal===true,
   placar:p?{sim:int(p.sim),nao:int(p.nao),abstencao:int(p.abstencao),obstrucao:int(p.obstrucao),art17:int(p.art17),total:int(p.total)}:null,
   votos,
   orientacoes:Array.isArray(v.orientacoes)?v.orientacoes.filter(o=>Array.isArray(o)&&str(o[0],40)&&str(o[1],20)).map(o=>[str(o[0],40),str(o[1],20)]):[]
  };
 });
}

/** O placar já aparece em números; tira o "Sim: 327; Não: 26; Total: 353." do fim da descrição. */
export function semPlacar(texto){
 return String(texto||'').replace(/\s*(Resultado\.?\s*)?(Sim|Não|Abstenç(ão|ões)|Obstrução|Total|Art(igo|\.)\s*17)\s*:\s*\d+[;.]?/gi,'').trim()||String(texto||'');
}

const TIPO_ROTULO={urgencia:'Pedido de urgência',requerimento:'Requerimento',emenda:'Emenda ou destaque',outra:'Votação de procedimento'};
const ORIENTACAO={'Sim':'a favor','Não':'contra','Liberado':'liberou a bancada','Obstrução':'obstrução','Abstenção':'abstenção'};

/** As que contam para "quem foi a favor ou contra": nominais sobre o texto. */
export const principais=list=>(list||[]).filter(v=>v.nominal&&v.tipo==='texto'&&v.votos.length);

const nomeDep=d=>(d.id?'<a href="'+DEP_URL(d.id)+'" target="_blank" rel="noopener noreferrer">'+safeText(d.nome)+'<span class="sr-only"> (abre a página do deputado na Câmara em nova aba)</span></a>':safeText(d.nome))+
 (d.partido||d.uf?' <span class="vote-party">'+safeText([d.partido,d.uf].filter(Boolean).join('-'))+'</span>':'');

const listaDeps=(deps,voto)=>'<ul class="vote-names">'+deps.map(d=>'<li data-partido="'+safeText(d.partido)+'" data-uf="'+safeText(d.uf)+'">'+nomeDep(d)+
 (voto?' <span class="vote-kind">'+safeText(VOTO_ROTULO[d.voto]||d.voto)+'</span>':'')+'</li>').join('')+'</ul>';

const quando=v=>[v.orgao?orgaoRotulo(v.orgao):'',v.data?dateBR(v.data):''].filter(Boolean).join(' · ');

function placarHTML(p,{compact=false}={}){
 const outros=p.abstencao+p.obstrucao+p.art17,base=p.sim+p.nao||1;
 const pct=n=>Math.round(n*1000/base)/10;
 return '<div class="vote-score'+(compact?' compact':'')+'">'+
  '<p class="vote-totals"><span><strong>'+p.sim+'</strong> a favor</span><span><strong>'+p.nao+'</strong> contra</span>'+
  (outros?'<span><strong>'+outros+'</strong> outros</span>':'')+'</p>'+
  (compact?'':'<div class="vote-bar" aria-hidden="true"><span class="vote-bar-sim" style="width:'+pct(p.sim)+'%"></span><span class="vote-bar-nao" style="width:'+pct(p.nao)+'%"></span></div>')+
  '</div>';
}

let seq=0;
function principalHTML(v){
 const k='vot'+(++seq);
 const sim=v.votos.filter(d=>GRUPO[d.voto]==='sim'),nao=v.votos.filter(d=>GRUPO[d.voto]==='nao'),outros=v.votos.filter(d=>GRUPO[d.voto]==='outros');
 const opts=(vals,todos)=>'<option value="">'+todos+'</option>'+[...new Set(vals.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(x=>'<option>'+safeText(x)+'</option>').join('');
 const orient=v.orientacoes.length?'<details class="vote-group"><summary><span>Como as lideranças orientaram ('+v.orientacoes.length+')</span></summary>'+
  '<p class="small-note">Orientação é a recomendação do líder de cada partido, bloco, governo ou oposição. O deputado pode votar diferente.</p>'+
  '<ul class="vote-orient">'+v.orientacoes.map(([s,o])=>'<li><span>'+safeText(s)+'</span> '+safeText(ORIENTACAO[o]||o.toLowerCase())+'</li>').join('')+'</ul></details>':'';
 const grupo=(titulo,deps,voto)=>deps.length?'<details class="vote-group" data-vote-group><summary><span>'+titulo+' (<span data-vote-count>'+deps.length+'</span>)</span></summary>'+listaDeps(deps,voto)+
  '<p class="small-note" data-vote-empty hidden>Ninguém com esse filtro.</p></details>':'';
 return '<article class="vote-item main" id="'+k+'" data-vote-box>'+
  '<p class="vote-when">'+safeText(quando(v))+' · votação nominal</p>'+
  '<p class="vote-what">'+safeText(semPlacar(v.descricao))+'</p>'+placarHTML(v.placar||{sim:sim.length,nao:nao.length,abstencao:0,obstrucao:0,art17:outros.length,total:v.votos.length})+
  '<div class="vote-filters"><div><label for="'+k+'-uf">Estado</label><select id="'+k+'-uf" data-vote-filter="uf">'+opts(v.votos.map(d=>d.uf),'Todos')+'</select></div>'+
  '<div><label for="'+k+'-partido">Partido</label><select id="'+k+'-partido" data-vote-filter="partido">'+opts(v.votos.map(d=>d.partido),'Todos')+'</select></div></div>'+
  '<p class="sr-only" aria-live="polite" data-vote-status></p>'+
  grupo('Votaram a favor',sim)+grupo('Votaram contra',nao)+grupo('Outros: abstenção, obstrução ou presidência',outros,true)+orient+
  '</article>';
}

function outraHTML(v){
 const nota=v.tipo==='texto'?(v.nominal?'':'Votação simbólica: a Câmara registra só o resultado, sem o voto de cada deputado.')
  :TIPO_ROTULO[v.tipo]+(v.nominal?': não decidiu o conteúdo da proposta, por isso não listamos os votos.':'. Não decidiu o conteúdo da proposta.');
 return '<li class="vote-item"><p class="vote-when">'+safeText(quando(v))+'</p><p class="vote-what">'+safeText(v.nominal?semPlacar(v.descricao):v.descricao)+'</p>'+
  (v.nominal&&v.placar?placarHTML(v.placar,{compact:true}):'')+(nota?'<p class="small-note">'+safeText(nota)+'</p>':'')+'</li>';
}

/** Seção "Como votaram" da ficha; vazia quando a proposta não teve votação registrada. */
export function votacoesHTML(list){
 if(!list?.length)return '';
 const main=principais(list),resto=list.filter(v=>!main.includes(v));
 // Sem nominal do texto: a votação do texto mais recente vira o destaque (simbólica).
 const destaque=main.length?null:resto.find(v=>v.tipo==='texto')||null;
 const outras=resto.filter(v=>v!==destaque);
 const intro=main.length?'<p>Votação nominal registra o voto de cada deputado. Os nomes estão em ordem alfabética.</p>'
  :'<p>A Câmara não registrou voto por deputado nas votações desta proposta: foram simbólicas, quando o presidente pergunta quem é contra e só o resultado fica registrado.</p>';
 return '<section class="detail-section" aria-labelledby="votacoesTitle"><h2 id="votacoesTitle">Como votaram na Câmara</h2>'+intro+
  main.map(principalHTML).join('')+
  (destaque?'<ul class="vote-list">'+outraHTML(destaque)+'</ul>':'')+
  (outras.length?'<details class="vote-group vote-others"><summary><span>'+(main.length||destaque?'Outras votações':'Votações')+' ('+outras.length+')</span></summary><ul class="vote-list">'+outras.map(outraHTML).join('')+'</ul></details>':'')+
  '<p class="small-note">'+(main.length?'Quem presidia a sessão aparece como "não votou": pelo Regimento (artigo 17), só vota para desempatar. Obstrução é quando a bancada se registra para atrasar a votação. ':'')+
  'Fonte: dados abertos da Câmara dos Deputados.</p></section>';
}

/** Filtro por estado/partido dentro de uma votação. Devolve o texto para leitor de tela. */
export function filterVotes(box){
 const uf=box.querySelector('[data-vote-filter="uf"]')?.value||'',partido=box.querySelector('[data-vote-filter="partido"]')?.value||'';
 const partes=[];
 box.querySelectorAll('[data-vote-group]').forEach(g=>{
  let n=0;
  g.querySelectorAll('li[data-uf]').forEach(li=>{const ok=(!uf||li.dataset.uf===uf)&&(!partido||li.dataset.partido===partido);li.hidden=!ok;n+=ok});
  const c=g.querySelector('[data-vote-count]');if(c)c.textContent=n;
  const e=g.querySelector('[data-vote-empty]');if(e)e.hidden=n>0;
  partes.push(g.querySelector('summary')?.textContent.replace(/\s*\(\d+\)$/,'')+': '+n);
 });
 const msg=(uf||partido?'Filtrado: '+[partido,uf].filter(Boolean).join(', ')+'. ':'Sem filtro. ')+partes.join('; ')+'.';
 const st=box.querySelector('[data-vote-status]');if(st)st.textContent=msg;
 return msg;
}
