// Temas oficiais da Câmara (/referencias/proposicoes/codTema, 32 temas conferidos em
// 19/11/2026) convertidos nos 13 temas do site. Tabela aprovada pelo Lucas em 19/11/2026.
// Usada pelo site (src/) e pelo robô scripts/aplicar_temas.mjs: fonte única da regra.
import {THEMES} from './themes.js';

export const TEMA_OFICIAL=Object.freeze({
 34:'Política e governo',          // Administração Pública
 35:'Cultura e esporte',           // Arte, Cultura e Religião
 37:'Comunicação e tecnologia',    // Comunicações
 39:'Cultura e esporte',           // Esporte e Lazer
 40:'Economia',                    // Economia
 41:'Moradia',                     // Cidades e Desenvolvimento Urbano
 42:'Direitos e cidadania',        // Direito Civil e Processual Civil
 43:'Segurança',                   // Direito Penal e Processual Penal
 44:'Direitos e cidadania',        // Direitos Humanos e Minorias
 46:'Educação',                    // Educação
 48:'Meio ambiente',               // Meio Ambiente e Desenvolvimento Sustentável
 51:'Moradia',                     // Estrutura Fundiária
 52:'Trabalho',                    // Previdência e Assistência Social
 53:'Política e governo',          // Processo Legislativo e Atuação Parlamentar
 54:'Economia',                    // Energia, Recursos Hídricos e Minerais
 55:'Política e governo',          // Relações Internacionais e Comércio Exterior
 56:'Saúde',                       // Saúde
 57:'Segurança',                   // Defesa e Segurança
 58:'Trabalho',                    // Trabalho e Emprego
 60:'Cultura e esporte',           // Turismo
 61:'Mobilidade',                  // Viação, Transporte e Mobilidade
 62:'Comunicação e tecnologia',    // Ciência, Tecnologia e Inovação
 64:'Economia',                    // Agricultura, Pecuária, Pesca e Extrativismo
 66:'Economia',                    // Indústria, Comércio e Serviços
 67:'Consumo',                     // Direito e Defesa do Consumidor
 68:'Política e governo',          // Direito Constitucional
 70:'Economia',                    // Finanças Públicas e Orçamento
 72:'Cultura e esporte',           // Homenagens e Datas Comemorativas
 74:'Política e governo',          // Política, Partidos e Eleições
 76:'Política e governo',          // Direito e Justiça
 85:'Educação',                    // Ciências Exatas e da Terra
 86:'Educação'                     // Ciências Sociais e Humanas
});

// Desempate do tema principal: o mais específico primeiro; os genéricos por último.
export const ESPECIFICIDADE=Object.freeze(['Saúde','Educação','Trabalho','Consumo','Segurança','Mobilidade','Moradia',
 'Meio ambiente','Direitos e cidadania','Comunicação e tecnologia','Cultura e esporte','Economia','Política e governo']);

/**
 * temas: [{cod, tema?, relevancia?}] da Câmara; calculado: tema que as regras do site dão hoje.
 * Devolve {area, areas} ou null quando a Câmara ainda não classificou (tema provisório).
 * Principal: o calculado, se estiver entre os oficiais (evita mudar a cor à toa);
 * senão, o oficial mais específico.
 */
export function temasDoSite(temas,calculado){
 const areas=[];
 for(const t of Array.isArray(temas)?temas:[]){
  const a=TEMA_OFICIAL[Number(t?.cod)];
  if(a&&!areas.includes(a))areas.push(a);
 }
 if(!areas.length)return null;
 areas.sort((a,b)=>ESPECIFICIDADE.indexOf(a)-ESPECIFICIDADE.indexOf(b));
 const area=areas.includes(calculado)?calculado:areas[0];
 return {area,areas};
}

export const isTheme=a=>typeof a==='string'&&THEMES.includes(a);
