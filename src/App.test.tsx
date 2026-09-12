/* eslint-disable @typescript-eslint/no-confusing-void-expression */
import { beforeEach, describe, expect, it } from 'vitest'
import { product } from './product/definition'
import { execute, fresh } from './workspace/engine'
import { Repository } from './workspace/repository'
import { csv } from './workspace/selectors'
import { decode } from './workspace/validation'
const now='2026-09-12T10:00:00.000Z'
describe(product.name+' workspace',()=>{
 beforeEach(()=>localStorage.clear())
 it('starts as a valid connected workspace',()=>{const state=fresh(product);expect(state.entities.length).toBeGreaterThan(1);expect(()=>product.validate(state.entities)).not.toThrow()})
 it('rejects stale writes and replays identical commands idempotently',()=>{const base=fresh(product),kind=product.kinds.find(item=>item.editors.includes(product.actors[0]!.role))!,command={id:'command-1',expectedRevision:0,actorId:'actor-0',type:'create' as const,kind:kind.key,title:'New verified record',input:Object.fromEntries(kind.fields.map(field=>[field.key,field.type==='reference'?product.seed.find(row=>row.kind===field.reference)!.id:field.initial??(field.type==='number'?1:'Evidence')]))};const next=execute(base,command,product,now);expect(execute(next,command,product,now)).toBe(next);expect(()=>execute(next,{...command,id:'command-2'},product,now)).toThrow(/changed/)})
 it('rejects malformed and cross-product backups',()=>{const state=fresh(product);expect(()=>decode(JSON.stringify({...state,product:'Other'}),product)).toThrow(/another product/);expect(()=>decode('{',product)).toThrow()})
 it('persists commits and blocks unauthorized restore',()=>{const repository=new Repository(product,localStorage);const base=repository.read();expect(base.revision).toBe(0);expect(()=>repository.restore(JSON.stringify(base),0,'actor-1',now)).toThrow(/owner authority/)})
 it('neutralizes formula prefixes in CSV exports',()=>{const state=fresh(product);state.entities[0]!.title='=WEBSERVICE("bad")';expect(csv(state.entities)).toContain("'=WEBSERVICE")})
 it('executes the first available guarded workflow',()=>{const state=fresh(product);const operation=product.operations.find(candidate=>state.entities.some(item=>item.kind===candidate.kind&&candidate.from.includes(item.status))&&(candidate.fields??[]).every(field=>field.type!=='reference'));expect(operation).toBeDefined();const record=state.entities.find(item=>item.kind===operation!.kind&&operation!.from.includes(item.status))!;const actor=product.actors.find(item=>operation!.roles.includes(item.role))!;const input=Object.fromEntries((operation!.fields??[]).map(field=>[field.key,field.initial??(field.type==='number'?1:field.options?.[0]??'Evidence')]));expect(execute(state,{id:'workflow-1',expectedRevision:0,actorId:actor.id,type:'operate',entityId:record.id,operation:operation!.key,input},product,now).revision).toBe(1)})
})
