// Nome dos órgãos da Câmara a partir da sigla (/orgaos da API oficial, conferido em 19/11/2026).
// Cobre os órgãos que aparecem na base; sigla desconhecida aparece como veio.
const NOMES=Object.freeze({
 PLEN:'Plenário da Câmara',
 MESA:'Mesa Diretora da Câmara',
 CCJC:'Comissão de Constituição e Justiça e de Cidadania',
 CFT:'Comissão de Finanças e Tributação',
 CSAUDE:'Comissão de Saúde',
 CPASF:'Comissão de Previdência, Assistência Social, Infância, Adolescência e Família',
 CE:'Comissão de Educação',
 CTRAB:'Comissão de Trabalho',
 CDC:'Comissão de Defesa do Consumidor',
 CASP:'Comissão de Administração e Serviço Público',
 CCULT:'Comissão de Cultura',
 CMADS:'Comissão de Meio Ambiente e Desenvolvimento Sustentável',
 CVT:'Comissão de Viação e Transportes',
 CSPCCO:'Comissão de Segurança Pública e Combate ao Crime Organizado',
 CCOM:'Comissão de Comunicação',
 CMULHER:'Comissão de Defesa dos Direitos da Mulher',
 CAPADR:'Comissão de Agricultura, Pecuária, Abastecimento e Desenvolvimento Rural',
 CICS:'Comissão de Indústria, Comércio e Serviços',
 CPOVOS:'Comissão da Amazônia e dos Povos Originários e Tradicionais',
 CDU:'Comissão de Desenvolvimento Urbano',
 CCTI:'Comissão de Ciência, Tecnologia e Inovação',
 CME:'Comissão de Minas e Energia',
 CTUR:'Comissão de Turismo',
 CREDN:'Comissão de Relações Exteriores e de Defesa Nacional',
 CDHMIR:'Comissão de Direitos Humanos, Minorias e Igualdade Racial',
 CPD:'Comissão de Defesa dos Direitos das Pessoas com Deficiência',
 CESPO:'Comissão do Esporte',
 CDE:'Comissão de Desenvolvimento Econômico',
 CINDRE:'Comissão de Integração Nacional e Desenvolvimento Regional',
 CIDOSO:'Comissão de Defesa dos Direitos da Pessoa Idosa',
 CFFC:'Comissão de Fiscalização Financeira e Controle',
 CCP:'Coordenação de Comissões Permanentes',
 CMO:'Comissão Mista de Orçamento',
 CN:'Congresso Nacional',
 GTCL:'Grupo de Trabalho de Consolidação das Leis'
});

/**
 * Nome legível. Comissões especiais têm sigla do projeto (PL308020 = PL 3080/2020) e
 * setores internos da Secretaria-Geral da Mesa vêm como "SIGLA(SGM)".
 */
export function orgaoNome(sigla){
 const s=typeof sigla==='string'?sigla.trim().toUpperCase():'';
 if(!s)return '';
 if(NOMES[s])return NOMES[s];
 const especial=s.match(/^(PL|PLP|PEC|MPV|PDL)(\d{3,5})(\d{2})$/);
 if(especial)return 'Comissão Especial do '+especial[1]+' '+Number(especial[2])+'/20'+especial[3];
 if(s==='SGM'||/\(SGM\)$/.test(s))return 'Secretaria-Geral da Mesa';
 return '';
}

/** "Comissão de Saúde (CSAUDE)", ou só a sigla quando o nome é desconhecido. */
export function orgaoRotulo(sigla){
 const nome=orgaoNome(sigla);
 const s=typeof sigla==='string'?sigla.trim():'';
 return nome&&s&&nome!==s?nome+' ('+s+')':(nome||s);
}
