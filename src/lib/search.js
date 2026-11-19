// Interpreta o que a pessoa digitou na busca: referência de proposta ("PL 999/2026",
// "pec 45/19", "projeto de lei 999 de 2026", "999/2026"), sigla solta ("PEC saúde")
// ou palavras da ementa.

const SIGLAS=Object.freeze({pl:'PL',plp:'PLP',pec:'PEC',mpv:'MPV',mp:'MPV',pdl:'PDL',prc:'PRC'});
// Nomes por extenso viram sigla antes da leitura (o mais específico primeiro).
const NAMES=[
 [/projetos? de lei complementar/g,' plp '],
 [/projetos? de decreto legislativo/g,' pdl '],
 [/projetos? de resolucao/g,' prc '],
 [/propostas? de emenda (?:a |da )?constituicao/g,' pec '],
 [/medidas? provisorias?/g,' mpv '],
 [/projetos? de lei/g,' pl ']
];
const STOPWORDS=new Set(['de','da','do','das','dos','e','a','o','as','os','em','no','na','nos','nas','para','por','com','um','uma','ao','aos']);

export const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

function year(raw){
 if(!raw)return null;
 const n=Number(raw);
 return raw.length===2?2000+n:n;
}

/**
 * {ref:{sigla|null, numero, ano|null}|null, sigla:'PL'|null, tokens:[...]}
 * Com ref, a busca é pelo número; sem ref, tokens são as palavras para a ementa.
 */
export function parseSearch(text){
 let t=' '+fold(text).replace(/[º°]/g,' ')+' ';
 for(const [rx,s] of NAMES)t=t.replace(rx,s);
 t=t.replace(/\s+/g,' ').trim();
 // "PL 999/2026", "pl999/26", "PL n. 999 de 2026", "999/2026"
 const full=t.match(/^(?:(plp|pl|pec|mpv|mp|pdl|prc)\s*[-.]?\s*)?(?:n\.?\s*|no\.?\s*|numero\s*)?(\d{1,5})\s*(?:\/|-|\s+de\s+|\s+)\s*(\d{4}|\d{2})$/);
 if(full){
  const ano=year(full[3]);
  if(ano>=1946&&ano<=2100)return {ref:{sigla:full[1]?SIGLAS[full[1]]:null,numero:Number(full[2]),ano},sigla:null,tokens:[]};
 }
 // "PL 999" (sem ano)
 const noYear=t.match(/^(plp|pl|pec|mpv|mp|pdl|prc)\s*[-.]?\s*(?:n\.?\s*)?(\d{1,5})$/);
 if(noYear)return {ref:{sigla:SIGLAS[noYear[1]],numero:Number(noYear[2]),ano:null},sigla:null,tokens:[]};
 // Sigla solta vira filtro de tipo; o resto são palavras.
 let sigla=null;
 const tokens=[];
 for(const w of t.replace(/[*,()"%.\\/]/g,' ').split(/\s+/)){
  if(!w)continue;
  if(SIGLAS[w]&&!sigla){sigla=SIGLAS[w];continue}
  if(w.length>1&&!STOPWORDS.has(w))tokens.push(w);
 }
 return {ref:null,sigla,tokens:tokens.slice(0,8)};
}

/** Rótulo da referência para mensagens: "PL 999/2026", "PL 999", "999/2026". */
export function refLabel(ref){
 if(!ref)return '';
 return (ref.sigla?ref.sigla+' ':'')+ref.numero+(ref.ano?'/'+ref.ano:'');
}

/** Número/ano casam como palavra inteira: "999/2026" não encontra "4999/2026". */
export function matchesToken(haystack,token){
 if(/^[\d/]+$/.test(token))return haystack.split(/[^\d/]+/).includes(token);
 return haystack.includes(token);
}
