/**
 * Situação amigável baseada APENAS em descrição de situação/tramitação da API oficial.
 * "Apresentação" não significa que uma matéria esteja em debate — classe neutra.
 */
export const STATUS={
 discussion:{label:'Em discussão',tone:'discussion'},
 voting:{label:'Pronto para Votação',tone:'voting'},
 approved:{label:'Aprovado na Câmara',tone:'approved'},
 closed:{label:'Arquivado / Rejeitado',tone:'closed'},
 introduced:{label:'Apresentada',tone:'neutral'},
 unknown:{label:'Situação a confirmar',tone:'neutral'}
};
export function normalizeStatus(status) {
 const stage=String(status?.descricaoSituacao||'').trim();
 const movement=String(status?.descricaoTramitacao||'').trim();
 const t=(stage||movement).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(!t)return {...STATUS.unknown,detail:'A Câmara não informou a situação nesta consulta.'};
 if(/arquivad|rejeitad|prejudicad|retirad|devolvid/.test(t))return {...STATUS.closed,detail:stage||movement};
 // Na Câmara: remessa ao Senado ou à sanção indica conclusão de análise na Casa.
 if(/remetid.{0,28}senado|encaminhad.{0,28}senado|enviad.{0,28}senado|remetid.{0,28}sancao|encaminhad.{0,28}sancao|aprovad.{0,20}plenario|transformad.{0,20}norma/i.test(t))return {...STATUS.approved,detail:stage||movement};
 // A aprovação por uma comissão não permite anunciar "Aprovado na Câmara".
 if(/pauta.{0,25}plenario|ordem do dia|pront.{0,30}(?:votacao|plenario)|incluid.{0,24}pauta|aguardando votacao(?: em plenario)?/.test(t))return {...STATUS.voting,detail:stage||movement};
 if(/apresentac|apresentad|protocol/.test(t))return {...STATUS.introduced,detail:stage||movement};
 if(/aguardando|parecer|relator|comissao|analis|distribui|tramit|discussao|apreciac/.test(t))return {...STATUS.discussion,detail:stage||movement};
 return {...STATUS.unknown,detail:stage||movement};
}
