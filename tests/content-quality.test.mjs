import test from 'node:test';
import assert from 'node:assert/strict';
import {questionTitle} from '../src/lib/text.js';
import {classifyTags,proposalTags} from '../src/lib/tags.js';
import {auditProposal} from '../src/lib/content-quality.js';
const proposal=ementa=>({id:1,siglaTipo:'PL',numero:5820,ano:2026,ementa});
test('bandeiras eleitorais: título identifica a proibição proposta',()=>{
 const p=proposal('Altera a Lei nº 9.504, de 30 de setembro de 1997 (Lei das Eleições), para vedar a propaganda eleitoral mediante bandeira de vento (wind banner).');
 assert.equal(questionTitle(p),'Propaganda eleitoral com bandeiras de vento pode ser proibida?');
 assert.deepEqual(classifyTags(p.ementa),['Publicidade','Eleições']);
});
test('condomínios: tags específicas, sem ramos do direito incidentais',()=>{
 const p=proposal('Dispõe sobre a proteção da integridade física, da segurança pessoal e do exercício do direito à moradia em condomínios edilícios; altera a Lei nº 10.406 (Código Civil) e o Decreto-Lei nº 2.848 (Código Penal), para disciplinar o afastamento judicial de ocupantes responsáveis por violência grave.');
 assert.match(questionTitle(p),/Moradores violentos/);
 assert.deepEqual(proposalTags({...p,tags:['Civil','Penal']}),['Moradia','Condomínios','Violência']);
});
test('requerimento é identificado como pedido e não como mudança já proposta',()=>{
 const p=proposal('Requer a inclusão na ordem do dia do Recurso ao Projeto de Lei que revoga a Lei de Alienação Parental.');
 assert.deepEqual(classifyTags(p.ementa),['Parentalidade']);
 assert.match(questionTitle(p),/pedido votar a revogação/);
 assert.ok(auditProposal(p).issues.includes('ementa_de_tramitacao_verificar_fonte'));
});
test('vocábulos soltos não viram tags; fonte insuficiente vai para revisão',()=>{
 const p=proposal('Requer a inclusão na ordem do dia.');
 assert.deepEqual(classifyTags(p.ementa),[]);
 assert.ok(auditProposal(p).issues.includes('assunto_sem_classificacao_confiavel'));
 assert.deepEqual(classifyTags('Altera a Lei nº 123.'),[]);
});
