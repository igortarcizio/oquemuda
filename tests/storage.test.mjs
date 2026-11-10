import test from 'node:test';
import assert from 'node:assert/strict';
import {getSaved,toggleSaved,isSaved,savedCount} from '../src/lib/storage.js';
const values=new Map();
globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,val)=>values.set(key,String(val)),removeItem:key=>values.delete(key)};
globalThis.window={OBM_DATA:{items:[]}};
test('salvamento fica no LocalStorage e pode ser removido',()=>{
 const p={id:2680010,numero:1,ano:2026,siglaTipo:'PL',ementa:'Uma proposta fictícia para testar o armazenamento.'};
 assert.equal(toggleSaved(p),true);
 assert.equal(isSaved(p.id),true);
 assert.ok(getSaved().some(x=>x.id===p.id));
 assert.equal(savedCount(),1);
 assert.equal(toggleSaved(p),false);
 assert.equal(savedCount(),0);
});
test('migra lista antiga de IDs quando possui dados oficiais no índice',()=>{
 values.clear();
 window.OBM_DATA.items=[{id:2651275,numero:5788,ano:2026,siglaTipo:'PL',ementa:'Rastreamento de doenças pediátricas.'}];
 values.set('oquemuda:salvos-reais','["2651275"]');
 const items=getSaved();
 assert.equal(items.length,1);assert.equal(items[0].numero,5788);
});
