// Títulos curtos da IA já vistos, guardados no navegador. Assim o card já nasce com o
// título curto (ao recarregar a página ou voltar da ficha), em vez de aparecer com o
// título da ementa e trocar logo depois. A busca em segundo plano continua corrigindo.
const KEY='oquemuda:titulos-ia:v1';
const TTL=3*86_400_000; // 3 dias: resumo refeito pela IA aparece no máximo nesse prazo
const MAX=3000;
let mem=null;

function storage(){try{return globalThis.localStorage||null}catch{return null}}
function load(now=Date.now()){
 if(mem)return mem;
 mem=new Map();
 try{
  const saved=JSON.parse(storage()?.getItem(KEY)||'{}');
  for(const [id,v] of Object.entries(saved)){
   if(Array.isArray(v)&&typeof v[0]==='string'&&now-Number(v[1])<TTL)mem.set(Number(id),[v[0],Number(v[1])]);
  }
 }catch{}
 return mem;
}
/** Título curto já conhecido desta proposta, ou ''. */
export function cachedAiTitle(id){return load().get(Number(id))?.[0]||''}
/** Já se sabe se a proposta tem título curto (tem, ou a IA ainda não fez)? */
export function knownAiTitle(id){return load().has(Number(id))}
/** Guarda títulos curtos ([id, titulo]); título vazio registra que a proposta ainda não tem. */
export function rememberAiTitles(entries,now=Date.now()){
 const m=load(now);
 let changed=false;
 for(const [id,t] of entries){
  const title=String(t||'').trim();
  m.set(Number(id),[title,now]);changed=true;
 }
 if(!changed)return;
 if(m.size>MAX)mem=new Map([...m.entries()].sort((a,b)=>b[1][1]-a[1][1]).slice(0,MAX));
 try{storage()?.setItem(KEY,JSON.stringify(Object.fromEntries(mem)))}catch{}
}
/** Só para testes. */
export function resetAiTitles(){mem=null}
