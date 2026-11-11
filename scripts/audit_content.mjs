/** Read the whole catalogue; use exactly the same title/tag logic as the cards. */
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {auditProposal} from '../src/lib/content-quality.js';
const root=new URL('../',import.meta.url),sandbox={window:{}};
vm.runInNewContext(await fs.readFile(new URL('dados/editorial.js',root),'utf8'),sandbox);
const editorial=sandbox.window.OBM_EDITORIAL||{};
const url=process.env.SUPABASE_URL?.replace(/\/$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('Credenciais da base não configuradas.');
const headers={apikey:key,Authorization:'Bearer '+key};
let records=[];
for(let offset=0;;offset+=1000){
 const q=new URLSearchParams({select:'id,sigla_tipo,numero,ano,ementa,tags',order:'id.asc',limit:'1000',offset:String(offset)});
 const r=await fetch(url+'/rest/v1/proposicoes?'+q,{headers,signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw new Error('Falha ao auditar a base: HTTP '+r.status);
 const batch=await r.json();records.push(...batch);if(batch.length<1000)break;
}
const results=records.map(d=>{
 const p={...d,siglaTipo:d.sigla_tipo};
 const audit=auditProposal(p,editorial[String(d.id)]||{});
 if(JSON.stringify(d.tags||[])!==JSON.stringify(audit.tags))audit.issues.push('tags_persistidas_divergentes');
 return audit;
});
const pending=results.filter(r=>r.issues.length);
const report={generatedAt:new Date().toISOString(),checked:results.length,pending:pending.length,records:results};
await fs.mkdir(new URL('reports/',root),{recursive:true});
await fs.writeFile(new URL('reports/content-quality.json',root),JSON.stringify(report,null,2)+'\n');
let summary='## Checagem dos títulos e assuntos\n\n'+results.length+' propostas verificadas; '+pending.length+' precisam de revisão.\n\n';
summary+='A checagem aplica as regras dos cards e compara as tags com a base. Casos sem classificação segura ficam como assuntos em revisão; não recebem palavras arbitrárias.\n\n';
summary+='| Proposta | Título exibido | Pendências |\n|---|---|---|\n';
for(const p of pending.slice(0,80))summary+='| '+p.referencia+' | '+p.title.replaceAll('|','/')+' | '+p.issues.join(', ')+' |\n';
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
console.log(JSON.stringify({checked:results.length,pending:pending.length}));
if(pending.length)console.log('::warning::Há propostas que precisam de revisão. Consulte o relatório de qualidade editorial.');
// Divergence is an operational regression; unresolved subject/source reviews remain explicit.
if(pending.some(p=>p.issues.includes('tags_persistidas_divergentes')))process.exitCode=1;
