import{describe,expect,it}from'vitest';import type{Entity}from'../../workspace/types';import{checkoutGate}from'./DomainDepthPanel';const e=(id:string,kind:string,status:string,fields:Entity['fields']):Entity=>({id,kind,status,title:id,revision:1,fields});describe('checkoutGate',()=>{it('combines stay, folio, and room blockers',()=>expect(checkoutGate(e('s','stay','reserved',{room:'r'}),[e('f','folio','open',{stay:'s',charges:100,payments:25}),e('r','room','ready',{})]).blockers).toHaveLength(3));it('accepts a settled in-house stay',()=>expect(checkoutGate(e('s','stay','checked-in',{room:'r'}),[e('f','folio','settled',{stay:'s',charges:100,payments:100}),e('r','room','occupied',{})]).ready).toBe(true));});

import { product } from '../../product/definition';
import { execute, fresh } from '../../workspace/engine';
import type { Snapshot, Value } from '../../workspace/types';
function act(state:Snapshot,operation:string,entityId:string,input:Record<string,Value>={},actorId='actor-0'){return execute(state,{id:operation+String(state.revision),type:'operate',operation,entityId,actorId,input,expectedRevision:state.revision},product,'2026-09-12T12:00:00Z');}
function cleaned(){let state=act(fresh(product),'checkin','stay-1');const folio=state.entities.find(item=>item.kind==='folio');if(!folio)throw new Error('Missing folio');state=act(state,'payment',folio.id,{amount:45000});state=act(state,'checkout','stay-1');const task=state.entities.find(item=>item.kind==='task');if(!task)throw new Error('Missing task');return {state:act(state,'clean',task.id,{},'actor-2'),id:task.id};}
it('records failed inspection, retries cleaning and preserves both inspection outcomes',()=>{
 const fixture=cleaned();let state=act(fixture.state,'fail-room-inspection',fixture.id,{note:'Bathroom floor needs another cleaning pass.'});const failed=structuredClone(state.entities.find(item=>item.kind==='inspection-record'));
 expect(state.entities.find(item=>item.id==='room-1')?.status).toBe('dirty');expect(state.entities.find(item=>item.id===fixture.id)?.status).toBe('queued');
 expect(()=>act(state,'inspect',fixture.id)).toThrow('no longer available');
 state=act(state,'clean',fixture.id,{},'actor-2');state=act(state,'inspect',fixture.id);
 expect(state.entities.find(item=>item.id==='room-1')?.status).toBe('ready');expect(state.entities.filter(item=>item.kind==='inspection-record')).toHaveLength(2);expect(state.entities.find(item=>item.id===failed?.id)).toEqual(failed);
});
it('rejects invalid or unauthorized inspection failures without changing room state',()=>{
 const {state,id}=cleaned();const before=structuredClone(state);
 expect(()=>act(state,'fail-room-inspection',id,{note:'short'})).toThrow('cleaning defect');expect(()=>act(state,'fail-room-inspection',id,{note:'Bathroom floor needs another cleaning pass.'},'actor-1')).toThrow('role');expect(state).toEqual(before);
});
