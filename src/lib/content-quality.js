import {questionTitle,ref,cleanText} from './text.js';
import {classifyTags} from './tags.js';
export function auditProposal(p,editorial={}){
 const title=questionTitle(p,editorial),tags=classifyTags(p.ementa),issues=[];
 if(!tags.length)issues.push('assunto_sem_classificacao_confiavel');
 if(/^O que diz o texto do /.test(title))issues.push('titulo_precisa_de_revisao');
 if(title.length>110)issues.push('titulo_longo');
 if(/^(Requer|Solicita)\b/i.test(cleanText(p.ementa))&&!['REQ','RIC'].includes(p.siglaTipo))issues.push('ementa_de_tramitacao_verificar_fonte');
 return {id:p.id,referencia:ref(p),title,tags,issues};
}
