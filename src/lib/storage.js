import {cleanText,classifyTheme,THEMES} from './text.js';
const KEY='oquemuda:salvos:v3',LEGACY='oquemuda:salvos-reais';
const supported=()=>{try{return typeof localStorage!=='undefined'}catch{return false}};
const seed=()=>Array.isArray(window.OBM_DATA?.items)?window.OBM_DATA.items:[];
function normalizeSaved(raw){
 if(!Array.isArray(raw))return [];
 const indexed=new Map(seed().map(p=>[String(p.id),p]));
 const normalized=raw.map(p=>{
   const item=typeof p==='object'&&p!==null?p:indexed.get(String(p));
   if(!item||!Number.isInteger(Number(item.id)))return null;
   return {id:Number(item.id),numero:Number(item.numero),ano:Number(item.ano),siglaTipo:String(item.siglaTipo||'PL'),
     ementa:cleanText(item.ementa),dataApresentacao:item.dataApresentacao||'',area:THEMES.includes(item.area)&&item.area!=='Todos'?item.area:classifyTheme(item),
     titulo:item.titulo||'',impacto:item.impacto||'',publicos:Array.isArray(item.publicos)?item.publicos.slice(0,3):[]};
 }).filter(Boolean);
 return [...new Map(normalized.map(p=>[p.id,p])).values()];
}
export function getSaved(){
 if(!supported())return [];
 try{
  const stored=localStorage.getItem(KEY);
  if(stored)return normalizeSaved(JSON.parse(stored));
  const old=localStorage.getItem(LEGACY);return old?normalizeSaved(JSON.parse(old)):[];
 }catch{return []}
}
export function isSaved(id){return getSaved().some(p=>p.id===Number(id))}
export function toggleSaved(proposal){
 if(!supported())return false;
 const items=getSaved();const id=Number(proposal.id),pos=items.findIndex(p=>p.id===id);
 if(pos>=0)items.splice(pos,1);else items.push(...normalizeSaved([proposal]));
 try{localStorage.setItem(KEY,JSON.stringify(items))}catch{return pos>=0}
 return pos<0;
}
export function savedCount(){return getSaved().length}
