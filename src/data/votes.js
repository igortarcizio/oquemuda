// Termômetro dos leitores: voto anônimo "a favor / neutro / contra" por proposta.
// O banco só é acessado por duas funções (contar_votos e registrar_voto); ver
// supabase/migrations/20261116_termometro_leitores.sql e docs/termometro-leitores.md.

const RPC='https://ltihbrlamevhmjjlsphc.supabase.co/rest/v1/rpc/';
const KEY='sb_publishable_SoAeylRxXXv38jw34drQFA_nbgItFPE';
const VOTER_KEY='oquemuda:leitor:v1';
const VOTES_KEY='oquemuda:votos:v1';

export const VOTE_OPTIONS=Object.freeze([
  {value:1,key:'favor',label:'A favor'},
  {value:0,key:'neutro',label:'Neutro'},
  {value:-1,key:'contra',label:'Contra'}
]);
// Abaixo disso o percentual engana mais do que informa.
export const MIN_VOTES=5;

export class VoteError extends Error{
  constructor(message,code=''){super(message);this.name='VoteError';this.code=code}
}

const store=()=>{try{return globalThis.localStorage||null}catch{return null}};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function randomUUID(){
  const c=globalThis.crypto;
  if(c?.randomUUID)return c.randomUUID();
  const b=new Uint8Array(16);
  if(c?.getRandomValues)c.getRandomValues(b);else for(let i=0;i<16;i++)b[i]=Math.floor(Math.random()*256);
  b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;
  const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}

// Identificador aleatório deste navegador. Não é dado pessoal e não sai daqui
// a não ser junto com o voto.
export function voterId(){
  const s=store();
  try{const saved=s?.getItem(VOTER_KEY);if(saved&&UUID.test(saved))return saved}catch{}
  const id=randomUUID();
  try{s?.setItem(VOTER_KEY,id)}catch{}
  return id;
}

function readVotes(){
  try{const raw=store()?.getItem(VOTES_KEY);const data=raw?JSON.parse(raw):{};return data&&typeof data==='object'&&!Array.isArray(data)?data:{}}
  catch{return {}}
}
export function myVote(id){
  const v=readVotes()[String(Number(id))];
  return v===1||v===0||v===-1?v:null;
}
export function rememberVote(id,value){
  const data=readVotes();
  if(value===null)delete data[String(Number(id))];else data[String(Number(id))]=value;
  try{store()?.setItem(VOTES_KEY,JSON.stringify(data))}catch{}
}

export function normalizeCounts(row){
  const r=Array.isArray(row)?row[0]:row;
  const n=x=>{const v=Number(x);return Number.isFinite(v)&&v>=0?Math.floor(v):0};
  return {favor:n(r?.a_favor),neutro:n(r?.neutro),contra:n(r?.contra)};
}

// Percentuais inteiros que somam 100 (maior resto).
export function summarize(counts){
  const total=counts.favor+counts.neutro+counts.contra;
  const pct={favor:0,neutro:0,contra:0};
  if(total){
    const keys=Object.keys(pct);
    const raw=keys.map(k=>({k,v:counts[k]*100/total}));
    raw.forEach(x=>{pct[x.k]=Math.floor(x.v)});
    let rest=100-keys.reduce((s,k)=>s+pct[k],0);
    raw.sort((a,b)=>(b.v%1)-(a.v%1)||counts[b.k]-counts[a.k]);
    for(const x of raw){if(!rest)break;if(counts[x.k]){pct[x.k]++;rest--}}
  }
  return {total,pct,enough:total>=MIN_VOTES};
}

// Aplica a troca de voto localmente, para a tela responder na hora.
export function applyVote(counts,previous,next){
  const out={...counts};
  const key=v=>VOTE_OPTIONS.find(o=>o.value===v)?.key;
  if(previous!==null&&previous!==undefined&&key(previous))out[key(previous)]=Math.max(0,out[key(previous)]-1);
  if(key(next))out[key(next)]++;
  return out;
}

async function rpc(name,body,signal){
  let res;
  try{
    res=await fetch(RPC+name,{method:'POST',signal,
      headers:{apikey:KEY,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(body)});
  }catch(e){
    if(e?.name==='AbortError')throw e;
    throw new VoteError('Sem conexão com o termômetro','network');
  }
  if(!res.ok){
    let info={};try{info=await res.json()}catch{}
    // PGRST202: a função ainda não existe no banco (SQL não aplicado).
    throw new VoteError(info?.message||('HTTP '+res.status),info?.code||String(res.status));
  }
  return normalizeCounts(await res.json());
}

export function fetchVotes(id,{signal}={}){
  return rpc('contar_votos',{p_proposicao:Number(id)},signal);
}
export function castVote(id,value,{signal}={}){
  if(![1,0,-1].includes(value))return Promise.reject(new VoteError('Voto inválido','22023'));
  return rpc('registrar_voto',{p_proposicao:Number(id),p_leitor:voterId(),p_voto:value},signal);
}

export function voteErrorMessage(error){
  if(error?.code==='54000')return 'Muitos votos em pouco tempo. Tente de novo mais tarde.';
  if(error?.code==='P0002')return 'Esta proposta ainda não está na nossa base, então não recebe votos.';
  if(error?.code==='network')return 'Sem conexão. Seu voto não foi registrado.';
  return 'Não foi possível registrar seu voto agora. Tente de novo.';
}
