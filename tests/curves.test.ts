import test from 'node:test';
import assert from 'node:assert/strict';
import {getPathSamples,evaluatePath,evaluateDocument,closestApproach,analyzeDocument,validateDocument,suggestTransition} from '../packages/core/src/index.ts';
import type {ProjectDocument,TimedPath} from '../packages/core/src/index.ts';
import {insertRouteWaypoint,moveRouteWaypoint} from '../packages/core/src/route-edit.ts';

function documentFor(path:TimedPath,other?:TimedPath):ProjectDocument{
  const paths:Record<string,TimedPath>={a:path};if(other)paths.b=other;
  return {id:'curves',title:'Synthetic curves',bpm:120,offsetSeconds:0,totalBeats:8,stage:{width:12,depth:8},cones:[],dancers:Object.keys(paths).map(id=>({id,name:id,color:'#fff',radius:.001})),sections:[{id:'s',title:'Study',startBeat:0,endBeat:8,color:'#fff'}],formations:[{id:'start',title:'Start',beat:0,transitionBeats:0,positions:Object.fromEntries(Object.entries(paths).map(([id,p])=>[id,{x:p.points[0].x,y:p.points[0].y}]))},{id:'end',title:'End',beat:4,transitionBeats:4,positions:Object.fromEntries(Object.entries(paths).map(([id,p])=>[id,{x:p.points[p.points.length-1].x,y:p.points[p.points.length-1].y}]))}],paths:{end:paths}};
}
const bend=():TimedPath=>({locked:false,interpolation:'smooth',points:[{t:0,x:-2,y:2},{t:.5,x:0,y:4},{t:1,x:2,y:2}]});

test('smooth saved geometry bends away from linear corners and replays identically in reverse',()=>{
  const path=bend(),linear={...path,interpolation:'linear' as const};
  assert.notDeepEqual(evaluatePath(path,.25),evaluatePath(linear,.25));
  assert.deepEqual(evaluatePath(path,.5),{x:0,y:4});
  const samples=getPathSamples(path);assert.ok(samples.length>3);assert.equal(getPathSamples(path),samples);
  assert.equal(getPathSamples(linear),linear.points);
  assert.notEqual(getPathSamples({...path}),samples);
  const doc=documentFor(path),snap=JSON.stringify(doc),forward=Array.from({length:81},(_,i)=>evaluateDocument(doc,i/20));
  for(let i=80;i>=0;i--)assert.deepEqual(evaluateDocument(doc,i/20),forward[i]);
  assert.equal(JSON.stringify(doc),snap);assert.deepEqual(validateDocument(doc),[]);
  for(const anchor of path.points)assert.deepEqual(evaluatePath(path,anchor.t),{x:anchor.x,y:anchor.y});
});

test('waits remain exactly stationary with tangent stops on both adjacent moving spans',()=>{
  const path:TimedPath={locked:false,interpolation:'smooth',points:[{t:0,x:-2,y:2},{t:.25,x:0,y:2},{t:.65,x:0,y:2},{t:1,x:2,y:4}]};
  const samples=getPathSamples(path);
  assert.equal(samples.filter(p=>p.t>.25&&p.t<.65).length,0);
  for(const t of [.25,.3,.5,.64,.65])assert.deepEqual(evaluatePath(path,t),{x:0,y:2});
  const stop=samples.findIndex(p=>p.t===.25),start=samples.findIndex(p=>p.t===.65);
  const speed=(a:number,b:number)=>Math.hypot(samples[b].x-samples[a].x,samples[b].y-samples[a].y)/(samples[b].t-samples[a].t);
  assert.ok(speed(stop-1,stop)<speed(stop-2,stop-1));
  assert.ok(speed(start,start+1)<speed(start+1,start+2));
});

test('boundary and speed analysis checks canonical curves between valid anchors',()=>{
  const path:TimedPath={locked:false,interpolation:'smooth',points:[{t:0,x:-2,y:1},{t:.3,x:0,y:.35},{t:.7,x:2,y:.35},{t:1,x:3,y:1}]};
  const doc=documentFor(path);doc.dancers[0].radius=.3;
  assert.ok(path.points.every(p=>p.y>=.3));assert.ok(getPathSamples(path).some(p=>p.y<.3));
  assert.ok(analyzeDocument(doc).some(w=>w.type==='boundary'));
  const fast:TimedPath={locked:false,interpolation:'smooth',points:[{t:0,x:-2.1,y:2},{t:1,x:2.1,y:2}]};
  assert.ok(analyzeDocument(documentFor(fast)).some(w=>w.type==='speed'));
  assert.ok(!analyzeDocument(documentFor({...fast,interpolation:'linear'})).some(w=>w.type==='speed'));
});

test('continuous closest approach catches overlap between canonical sample vertices',()=>{
  const path=bend(),samples=getPathSamples(path),t=(samples[4].t+samples[5].t)/2,center=evaluatePath(path,t);
  const obstacle:TimedPath={locked:true,points:[{t:0,...center},{t:1,...center}]};
  assert.ok(samples.every(p=>Math.hypot(p.x-center.x,p.y-center.y)>.002));
  const near=closestApproach(path,obstacle);assert.ok(near.distance<1e-10);assert.ok(Math.abs(near.t-t)<1e-10);
  assert.ok(analyzeDocument(documentFor(path,obstacle)).some(w=>w.type==='clearance'));
});

test('smooth route insertion follows canonical sample time and edits retain interpolation and anchor times',()=>{
  const path=bend(),samples=getPathSamples(path),sample=samples[4],doc=documentFor(path);
  const inserted=insertRouteWaypoint(doc,'end','a',sample)!;
  assert.equal(inserted.index,0);assert.ok(Math.abs(inserted.document.paths.end.a.points[1].t-sample.t)<1e-12);
  assert.notEqual(sample.t,(sample.x+2)/4); // not projection onto original anchor chord
  assert.equal(inserted.document.paths.end.a.interpolation,'smooth');
  const times=inserted.document.paths.end.a.points.map(p=>p.t);
  const moved=moveRouteWaypoint(inserted.document,'end','a',inserted.index,{x:-1,y:3});
  assert.deepEqual(moved.paths.end.a.points.map(p=>p.t),times);assert.equal(moved.paths.end.a.interpolation,'smooth');
  assert.deepEqual(validateDocument(moved),[]);
});

test('recommendations offer checked smooth routes while preserving locked approvals byte for byte',()=>{
  const original=bend();original.locked=true;
  const lockedDoc=documentFor(original),result=suggestTransition(lockedDoc,'end');
  assert.equal(JSON.stringify(result.paths.end.a),JSON.stringify(original));
  const doc=documentFor({...bend(),interpolation:'linear'}),suggested=suggestTransition(doc,'end');
  assert.equal(suggested.paths.end.a.interpolation,'smooth');
  assert.ok(!analyzeDocument(suggested).some(w=>w.type==='boundary'));
  assert.deepEqual(suggested.formations,doc.formations);
});

test('curve sampling is bounded, portable and rejects unsupported interpolation metadata',()=>{
  const path:TimedPath={locked:false,interpolation:'smooth',points:Array.from({length:64},(_,i)=>({t:i/63,x:(i%2)*4,y:2+(i%3)}))};
  const samples=getPathSamples(path);assert.ok(samples.length<=2017);assert.ok(samples.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.t)));
  for(let i=1;i<samples.length;i++)assert.ok(samples[i].t>samples[i-1].t);
  const doc=documentFor(bend());(doc.paths.end.a as any).interpolation='bezier';assert.ok(validateDocument(doc).length);
  const nonfinite=documentFor(bend());nonfinite.paths.end.a.points[1].x=Infinity;assert.ok(validateDocument(nonfinite).length);
  const tiny:TimedPath={locked:false,interpolation:'smooth',points:[{t:0,x:0,y:2},{t:1-Number.EPSILON/2,x:1,y:3},{t:1,x:2,y:2}]};
  const narrow=getPathSamples(tiny);for(let i=1;i<narrow.length;i++)assert.ok(narrow[i].t>narrow[i-1].t);
  assert.ok(Number.isFinite(closestApproach(tiny,bend()).distance));
});
