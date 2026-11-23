/**
 * Situação amigável a partir do código oficial da Câmara (codSituacao).
 * Tabela: /referencias/proposicoes/codSituacao, conferida em 19/11/2026 (99 códigos).
 * Código desconhecido cai no texto da situação/tramitação (regex), como antes.
 * "Apresentação" não significa que uma matéria esteja em debate — classe neutra.
 */
export const STATUS={
 discussion:{label:'Em discussão',tone:'discussion'},
 voting:{label:'Pronta para pauta',tone:'voting'},
 approved:{label:'Aprovado na Câmara',tone:'approved'},
 law:{label:'Virou lei',tone:'law'},
 closed:{label:'Arquivado / Rejeitado',tone:'closed'},
 introduced:{label:'Apresentada',tone:'neutral'},
 joint:{label:'Tramita em conjunto',tone:'discussion'},
 // Rótulo único para qualquer situação ainda não confirmada na fonte oficial.
 unknown:{label:'Em atualização',tone:'pending'}
};
/** Até quantos dias depois da apresentação a falta de situação ainda vale "Apresentada". */
export const RECENT_DAYS=15;
/**
 * Etiqueta para quando o banco ainda não tem situação nenhuma da proposta.
 * Proposta apresentada há poucos dias está, de fato, apresentada: mostrar isso é mais útil
 * (e tão verdadeiro) quanto "Em atualização", que fica para as demais.
 * checked: o robô já consultou a Câmara (situacao_atualizada_em preenchido).
 */
export function missingStatus(dataApresentacao,{checked=false,now=Date.now()}={}){
 const day=String(dataApresentacao||'').slice(0,10);
 const presented=/^\d{4}-\d{2}-\d{2}$/.test(day)?Date.parse(day+'T00:00:00Z'):NaN;
 const age=(now-presented)/86_400_000;
 if(Number.isFinite(age)&&age>=-1&&age<=RECENT_DAYS){
  const [y,m,d]=day.split('-');
  return {...STATUS.introduced,detail:'Apresentada em '+d+'/'+m+'/'+y+'. '+(checked?'A Câmara ainda não registrou outra etapa.':'A situação oficial ainda está sendo consultada.')};
 }
 return {...STATUS.unknown,detail:checked?'A Câmara não informou a situação na consulta.':'A situação ainda não foi obtida da Câmara.'};
}
const JOINT_DETAIL='Tramita junto com outra proposta (apensada) e segue o andamento dela.';
// Só o que muda a etiqueta; o resto ("Aguardando parecer", "Aguardando relator"…) é "Em discussão".
const BY_CODE={
 voting:[924],
 // A Câmara concluiu: foi ao Senado, à sanção ou à promulgação.
 approved:[926,1070,1150,1160,1293,1294,1303,939],
 law:[1140],
 // Encerradas sem virar lei: arquivo, rejeição, retirada, devolução, perda de eficácia, veto total.
 closed:[914,923,930,931,937,940,941,950,1120,1222,1230,1250,1260,1285,1292],
 // Acabaram de chegar: esperam despacho, distribuição ou registro.
 introduced:[905,906,912,917,1010,1080,1110,1200,1201,1210,1220,1221,1290,1291,1381,1382,1383],
 joint:[925,927]
};
const GENERIC_CODES=new Set([1161,1311]); // "Outros" e "<Não Definido>"
const CODE_TONE=new Map(Object.entries(BY_CODE).flatMap(([k,codes])=>codes.map(c=>[c,k])));
/** Códigos usados nos atalhos do box "De olho na Câmara" e nos filtros do banco. */
export const APPROVED_CODES=[...BY_CODE.approved,...BY_CODE.law];
export const CLOSED_CODES=[...BY_CODE.closed];
export const LAW_CODES=[...BY_CODE.law];
export const isLaw=status=>status?.tone==='law';
export function normalizeStatus(status) {
 const raw=status?.codSituacao;
 const code=raw===null||raw===undefined||raw===''?NaN:Number(raw);
 const official=String(status?.descricaoSituacao||'').trim();
 const tone=CODE_TONE.get(code);
 if(tone==='joint')return {...STATUS.joint,detail:JOINT_DETAIL};
 if(tone)return {...STATUS[tone],detail:official||STATUS[tone].label};
 // Código conhecido da tabela oficial e não listado acima: está em andamento na Câmara.
 if(Number.isInteger(code)&&code>=900&&code<=1400&&!GENERIC_CODES.has(code)&&official)return {...STATUS.discussion,detail:official};
 const stage=String(status?.descricaoSituacao||'').trim();
 const movement=String(status?.descricaoTramitacao||'').trim();
 const t=(stage||movement).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(!t)return {...STATUS.unknown,detail:'A Câmara ainda não informou a situação.'};
 if(/transformad.{0,20}(?:em )?norma/.test(t))return {...STATUS.law,detail:stage||movement};
 if(/arquivad|rejeitad|prejudic|retirad|devolvid|perdeu a eficacia|tramitacao finalizada|vetad/.test(t))return {...STATUS.closed,detail:stage||movement};
 // Na Câmara: remessa ao Senado ou à sanção indica conclusão de análise na Casa.
 if(/remetid.{0,28}senado|encaminhad.{0,28}senado|enviad.{0,28}senado|remetid.{0,28}sancao|encaminhad.{0,28}sancao|aprovad.{0,20}plenario/i.test(t))return {...STATUS.approved,detail:stage||movement};
 // A aprovação por uma comissão não permite anunciar "Aprovado na Câmara".
 if(/pauta.{0,25}plenario|ordem do dia|pront.{0,30}(?:votacao|plenario)|incluid.{0,24}pauta|aguardando votacao(?: em plenario)?/.test(t))return {...STATUS.voting,detail:stage||movement};
 if(/apresentac|apresentad|protocol/.test(t))return {...STATUS.introduced,detail:stage||movement};
 if(/aguardando|parecer|relator|comissao|analis|distribui|tramit|discussao|apreciac/.test(t))return {...STATUS.discussion,detail:stage||movement};
 const text=stage||movement;
 return {label:text.length>46?text.slice(0,43)+'…':text,tone:'neutral',detail:text};
}
