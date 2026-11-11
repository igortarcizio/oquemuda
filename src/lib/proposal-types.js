// Fontes: Câmara dos Deputados, Entenda o processo legislativo e glossário do Congresso Nacional.
// https://www.camara.leg.br/entenda-o-processo-legislativo/
// https://www.congressonacional.leg.br/legislacao-e-publicacoes/glossario-tecnica-legislativa
const TYPES = {
  PL: {title:'Projeto de Lei', description:'Propõe criar ou alterar uma lei ordinária, com regras sobre temas como saúde, educação e trabalho. Em geral, passa pela Câmara e pelo Senado e segue para sanção ou veto presidencial.'},
  PLP: {title:'Projeto de Lei Complementar', description:'Trata de matérias que a Constituição reserva à lei complementar. Para ser aprovado, exige o voto favorável da maioria absoluta dos integrantes de cada Casa: 257 deputados e 41 senadores.'},
  PEC: {title:'Proposta de Emenda à Constituição', description:'Propõe alterar a Constituição. Precisa de aprovação em dois turnos na Câmara e no Senado, com três quintos dos votos em cada Casa. Não passa por sanção presidencial.'},
  MPV: {title:'Medida Provisória', description:'É editada pelo presidente da República em casos de relevância e urgência e tem força de lei desde a publicação. Precisa da aprovação do Congresso em até 120 dias para se tornar lei em definitivo.'},
  PDL: {title:'Projeto de Decreto Legislativo', description:'Trata de competências exclusivas do Congresso, como aprovar acordos internacionais ou sustar atos do Executivo que ultrapassem seu poder de regulamentar. Não passa por sanção presidencial.'},
  PRC: {title:'Projeto de Resolução da Câmara', description:'Trata de assuntos de competência da própria Câmara, como mudanças no Regimento Interno e regras de funcionamento da Casa. Não passa pelo Senado nem por sanção presidencial.'}
};
export function proposalTypeInfo(type) {
  return Object.hasOwn(TYPES, type) ? TYPES[type] : null;
}
