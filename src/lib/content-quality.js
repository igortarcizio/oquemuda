import {ref,cleanText} from './text.js';
import {displayTitle,TITLE_MAX} from './titles.js';
import {classifyTags} from './tags.js';
export function auditProposal(p,editorial={}){
 const title=displayTitle(p,editorial),tags=classifyTags(p.ementa),issues=[];
 if(!tags.length)issues.push('assunto_sem_classificacao_confiavel');
 if(/^Proposta (?:sobre |com assunto)/.test(title))issues.push('titulo_precisa_de_revisao');
 if(title.length>TITLE_MAX)issues.push('titulo_longo');
 if(/^(Requer|Solicita)\b/i.test(cleanText(p.ementa))&&!['REQ','RIC'].includes(p.siglaTipo))issues.push('ementa_de_tramitacao_verificar_fonte');
 return {id:p.id,referencia:ref(p),title,tags,issues};
}
