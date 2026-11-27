import test from 'node:test';
import assert from 'node:assert/strict';
import {momento,etiqueta,eventosDoAno,proximosEventos,hojeBrasilia,diaCurto,faixasDoAno} from '../src/lib/calendario.js';
import {calendarPage,sessionStatus} from '../src/ui/calendario.js';

test('fases do ano legislativo (Constituição, art. 57)',()=>{
 assert.equal(momento('2026-11-27').fase,'sessao');
 assert.equal(momento('2026-11-27').ate,'2026-12-22');
 assert.equal(momento('2026-11-27').dias,26);
 assert.equal(momento('2026-12-22').fase,'sessao');
 assert.equal(momento('2026-12-23').fase,'recesso');
 assert.equal(momento('2026-12-23').ate,'2027-02-01');
 assert.equal(momento('2027-01-15').ate,'2027-02-01');
 assert.equal(momento('2027-02-01').fase,'recesso');
 assert.equal(momento('2027-02-02').fase,'sessao');
 assert.equal(momento('2027-07-17').fase,'sessao');
 assert.equal(momento('2027-07-18').fase,'recesso-julho');
 assert.equal(momento('2027-08-01').fase,'sessao');
});

test('etiqueta curta',()=>{
 assert.equal(etiqueta(momento('2026-11-27')).titulo,'Câmara em sessão até 22/12');
 assert.match(etiqueta(momento('2026-11-27')).detalhe,/26 dias/);
 assert.equal(etiqueta(momento('2027-01-10')).titulo,'Recesso parlamentar até 1º/2');
 assert.equal(etiqueta(momento('2027-03-10')).detalhe,'Votações podem ocorrer');
 assert.equal(diaCurto('2027-02-01'),'1º/2');
});

test('2027: novas posses (EC 111/2021) e nova legislatura',()=>{
 const ev=eventosDoAno(2027).map(e=>e.data+' '+e.titulo);
 assert.ok(ev.includes('2027-01-05 Posse do presidente e do vice-presidente da República'));
 assert.ok(ev.includes('2027-01-06 Posse de governadores e vice-governadores'));
 assert.ok(ev.some(e=>e.startsWith('2027-02-01 Posse de deputados federais e senadores')));
 assert.ok(eventosDoAno(2027).some(e=>e.data==='2027-08-31'&&/Plano Plurianual/.test(e.titulo)));
 assert.ok(!eventosDoAno(2028).some(e=>e.data==='2028-02-01'),'2028 não tem posse nem eleição de Mesa');
 assert.ok(eventosDoAno(2029).some(e=>e.data==='2029-02-01'&&/presidentes da Câmara/.test(e.titulo)));
 assert.ok(!eventosDoAno(2026).some(e=>/Posse/.test(e.titulo)));
});

test('próximas datas a partir de hoje incluem o recesso e as posses',()=>{
 const p=proximosEventos('2026-11-27').map(e=>e.data);
 assert.deepEqual(p.slice(0,5),['2026-12-22','2026-12-23','2027-01-05','2027-01-06','2027-02-01']);
 assert.equal(proximosEventos('2027-01-10')[0].titulo,'Recesso parlamentar','período em curso aparece primeiro');
});

test('faixas cobrem o ano inteiro',()=>{
 const soma=faixasDoAno(2026).reduce((t,f)=>t+f.largura,0);
 assert.ok(Math.abs(soma-1)<1e-9);
});

test('data de Brasília, não UTC',()=>{
 assert.equal(hojeBrasilia(new Date('2026-12-23T01:30:00Z')),'2026-12-22');
});

test('página e etiqueta',()=>{
 const html=calendarPage('2026-11-27');
 assert.match(html,/Câmara em sessão até 22\/12/);
 assert.match(html,/Nova legislatura em 1º de fevereiro de 2027/);
 assert.match(html,/três legislaturas completas/);
 assert.doesNotMatch(calendarPage('2027-03-01'),/Nova legislatura/);
 assert.match(sessionStatus('2027-01-10'),/data-fase="recesso"/);
});
