// Títulos dos cards.
// Pergunta só quando a proposta foi explicada pela redação (dados/editorial.js).
// Nas demais, um título descritivo gerado por regra a partir da ementa oficial,
// sem interpretar: diz o que o texto faz.

const IRREGULAR={dispor:'Dispõe',propor:'Propõe',compor:'Compõe',impor:'Impõe',proibir:'Proíbe',prever:'Prevê',rever:'Revê',
 ter:'Tem',manter:'Mantém',obter:'Obtém',conter:'Contém',deter:'Detém',vir:'Vem',ver:'Vê',dar:'Dá',ser:'É',ir:'Vai',fazer:'Faz',
 trazer:'Traz',exigir:'Exige',corrigir:'Corrige',dirigir:'Dirige',pedir:'Pede',medir:'Mede',impedir:'Impede',seguir:'Segue',
 conseguir:'Consegue',prosseguir:'Prossegue',servir:'Serve',conferir:'Confere',transferir:'Transfere',inserir:'Insere',referir:'Refere',
 sugerir:'Sugere',investir:'Investe',repetir:'Repete',competir:'Compete',reunir:'Reúne',construir:'Constrói',destruir:'Destrói'};
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
// Verbos comuns em ementas: depois do primeiro verbo, os seguintes da enumeração também são conjugados
// ("reduzir X, instituir Y e simplificar Z" → "Reduz X, institui Y e simplifica Z").
const LEGIS_VERBS=new Set(['instituir','estabelecer','criar','simplificar','assegurar','garantir','prever','dispor','permitir','proibir','vedar',
 'ampliar','reduzir','alterar','incluir','determinar','obrigar','regulamentar','disciplinar','tipificar','aumentar','definir','autorizar',
 'conceder','fixar','exigir','promover','tornar','acrescentar','revogar','atualizar','modificar','explicitar','admitir','prorrogar',
 'excluir','isentar','destinar','agravar','dispensar','padronizar','fortalecer','facultar','punir','estender','limitar','suspender']);

/** Infinitivo → 3ª pessoa do presente ("estabelecer" → "Estabelece"). Null se não for verbo reconhecível. */
export function conjugate(verb){
 const v=String(verb||'').toLowerCase();
 if(IRREGULAR[v])return IRREGULAR[v];
 if(!/(ar|er|ir)$/.test(v))return null;
 if(/ear$/.test(v))return cap(v.replace(/ear$/,'eia'));
 if(/uir$/.test(v))return cap(v.slice(0,-1));
 if(/zir$/.test(v))return cap(v.slice(0,-2));
 if(/[ae]r$/.test(v))return cap(v.slice(0,-1));
 return cap(v.slice(0,-2)+'e');
}

function shorten(s,max=135){
 if(s.length<=max)return s;
 const cut=s.slice(0,max);
 const at=Math.max(cut.lastIndexOf(', '),cut.lastIndexOf(' e '),cut.lastIndexOf('; '));
 if(at>max*.55)return cut.slice(0,at).replace(/[,;\s]+$/,'');
 return cut.slice(0,cut.lastIndexOf(' ')).replace(/[,;:\s]+$/,'')+'…';
}

/** Título descritivo a partir da ementa ("Altera a Lei X para reduzir…" → "Reduz…"). */
export function descriptiveTitle(ementa){
 let s=String(ementa||'').replace(/\s+/g,' ').trim();
 if(!s)return 'Proposta sem ementa informada';
 let m;
 if(/radiodifus/i.test(s)&&(m=s.match(/(?:cidade|munic[ií]pio) de ([^,]+?),\s*(?:Estado|no Estado) (?:de|do|da) ([^.,;]+)/i)))
  return 'Autoriza serviço de rádio em '+m[1].trim()+' ('+m[2].trim()+')';
 if(/^Requer/i.test(s))return 'Pedido de tramitação: '+shorten(s.replace(/^Requer(?:em)?\s+/i,''),110);
 m=s.match(/^(?:Alteram?|Acrescentam?|Modifica|Inclui|Dá nova redação|Revoga)\b[\s\S]*?\s(?:a fim de|para)\s+([a-zà-ú]+)\b([\s\S]*)$/i);
 if(m){const v=conjugate(m[1]);if(v)s=v+m[2].replace(/(,\s+|\s+e\s+)([a-zà-ú]+)\b/g,(x,sep,w)=>LEGIS_VERBS.has(w)?sep+conjugate(w).toLowerCase():x);}
 s=s.replace(/^Dispõe sobre (a|o|as|os) /i,(x,a)=>'Trata d'+a.toLowerCase()+' ').replace(/^Dispõe sobre /i,'Trata de ');
 s=s.replace(/,?\s*e dá outras providências\.?$/i,'').replace(/,?\s+(?:e\s+)?alteram?\s+(?:a|o|as|os)\s+(?:Leis?|Decreto|Constituição)[\s\S]*$/i,'');
 s=s.split(/;\s/)[0].replace(/[.;,:\s]+$/,'');
 return shorten(s);
}

/** Leis que a proposta altera, quando a ementa diz ("Lei das Eleições", "Lei 14.133/2021"). Até duas. */
export function amendedLaws(ementa){
 const text=String(ementa||'');
 if(/^Requer/i.test(text))return '';
 const pre=text.split(/\s(?:para|a fim de)\s/)[0];
 if(!/alter|acrescent|modific|revoga|reda[cç][aã]o/i.test(pre))return '';
 const out=[],rx=/(Lei Complementar|Decreto-Lei|Lei|Decreto)\s+n[ºo°.]*\s*([\d.]+),\s+de\s+\d{1,2}º?\s+de\s+[a-zç]+\s+de\s+(\d{4})(?:\s*\(([^)]+)\))?/gi;let m;
 while((m=rx.exec(pre))&&out.length<2)out.push(m[4]?m[4].trim():m[1]+' '+m[2]+'/'+m[3]);
 if(/Constitui[cç][aã]o Federal/i.test(pre)&&out.length<2)out.push('Constituição Federal');
 return out.join(' e ');
}

/** Proposta explicada pela redação: tem título em forma de pergunta e síntese revisados. */
export function isReviewed(editorial={}){
 return typeof editorial.titulo==='string'&&editorial.titulo.trim().endsWith('?')&&!!String(editorial.impacto||'').trim();
}

/** Título exibido: pergunta revisada ou título descritivo. */
export function displayTitle(p,editorial={}){
 return isReviewed(editorial)?editorial.titulo.trim():descriptiveTitle(p.ementa);
}
