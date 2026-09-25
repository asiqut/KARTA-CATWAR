import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

type Transition = { id:string; row:number; col:number }
type Point = { x:number; y:number }
type Location = { id:string; name:string; x:number; y:number; size:number; background:string|null; transitions:Transition[] }
type Endpoint = { locationId:string; transitionId:string }
type Side = 'left'|'right'|'top'|'bottom'
type Connector = { id:string; from:Endpoint; to:Endpoint; color:string; arrows:'none'|'start'|'end'|'both'; oneWay?:boolean; bends?:Point[]; points?:Point[]; fromPoint?:Point; toPoint?:Point; fromSide?:Side; toSide?:Side }

const COLS=10, ROWS=6, SIZE=440, CW=5000, CH=3500, SCALE=.55, SNAP=32, MAGNET=64
const makeTransitions=(id:string):Transition[]=>Array.from({length:ROWS*COLS},(_,i)=>({id:`${id}-t-${i}`,row:Math.floor(i/COLS),col:i%COLS}))
const initialLocations:Location[]=[
 {id:'loc-1',name:'Локация 1',x:700,y:500,size:SIZE,background:null,transitions:makeTransitions('loc-1')},
 {id:'loc-2',name:'Локация 2',x:1450,y:750,size:SIZE,background:null,transitions:makeTransitions('loc-2')}
]
const initialConnectors:Connector[]=[{id:'conn-1',from:{locationId:'loc-1',transitionId:'loc-1-t-25'},to:{locationId:'loc-2',transitionId:'loc-2-t-34'},color:'#fff',arrows:'none',fromSide:'right',toSide:'left'}]

function center(l:Location,t:Transition):Point{const w=l.size/COLS,h=l.size/ROWS;return{x:l.x+t.col*w+w/2,y:l.y+t.row*h+h/2}}
function edge(l:Location,t:Transition,s:Side):Point{const c=center(l,t),w=l.size/COLS,h=l.size/ROWS;return s==='left'?{x:c.x-w/2,y:c.y}:s==='right'?{x:c.x+w/2,y:c.y}:s==='top'?{x:c.x,y:c.y-h/2}:{x:c.x,y:c.y+h/2}}
function relation(a:Location,b:Location):Side{const dx=b.x+b.size/2-(a.x+a.size/2),dy=b.y+b.size/2-(a.y+a.size/2);return Math.abs(dx)>=Math.abs(dy)?(dx>=0?'right':'left'):(dy>=0?'bottom':'top')}
function sideFor(l:Location,t:Transition,p:Point,fallback:Side):Side{const c=center(l,t),dx=p.x-c.x,dy=p.y-c.y;if(Math.abs(dx)<1&&Math.abs(dy)<1)return fallback;return Math.abs(dx)>=Math.abs(dy)?(dx>=0?'right':'left'):(dy>=0?'bottom':'top')}
const STUB=48
const ROUTE_CLEARANCE=10
function outward(p:Point,s:Side,d=STUB):Point{if(s==='left')return{x:p.x-d,y:p.y};if(s==='right')return{x:p.x+d,y:p.y};if(s==='top')return{x:p.x,y:p.y-d};return{x:p.x,y:p.y+d}}
function clamp(v:number,a:number,b:number){return Math.max(a,Math.min(b,v))}
function same(a:Point,b:Point,t=5){return Math.hypot(a.x-b.x,a.y-b.y)<=t}
function normalize(p:Point[]):Point[]{const d=p.reduce<Point[]>((a,v)=>!a.length||!same(a[a.length-1],v)?[...a,v]:[...a,v],[]),o:Point[]=[];for(let i=0;i<d.length;i++){const v=d[i];if(!o.length){o.push(v);continue}const a=o[o.length-1];if(Math.abs(a.x-v.x)>5&&Math.abs(a.y-v.y)>5){o.push({x:v.x,y:a.y});o.push(v)}else{o.push(v)}}const r:Point[]=[];for(const v of o){if(!r.length){r.push(v);continue}const a=r[r.length-1];if(same(a,v))continue;if(r.length>1){const b=r[r.length-2],sameV=Math.abs(b.x-a.x)<5&&Math.abs(a.x-v.x)<5,sameH=Math.abs(b.y-a.y)<5&&Math.abs(a.y-v.y)<5;if(sameV||sameH){r[r.length-1]=v;continue}}r.push(v)}return r}
function boundary(l:Location,p:Point):Point{const L=l.x,R=l.x+l.size,T=l.y,B=l.y+l.size,inset=32,q=[{x:L,y:clamp(p.y,T+inset,B-inset),d:Math.abs(p.x-L)},{x:R,y:clamp(p.y,T+inset,B-inset),d:Math.abs(p.x-R)},{x:clamp(p.x,L+inset,R-inset),y:T,d:Math.abs(p.y-T)},{x:clamp(p.x,L+inset,R-inset),y:B,d:Math.abs(p.y-B)}];return q.reduce((a,b)=>b.d<a.d?b:a,q[0])}
function boundaryPointForSide(l:Location,p:Point,s:Side):Point{if(s==='left')return{x:l.x,y:clamp(p.y,l.y+32,l.y+l.size-32)};if(s==='right')return{x:l.x+l.size,y:clamp(p.y,l.y+32,l.y+l.size-32)};if(s==='top')return{x:clamp(p.x,l.x+32,l.x+l.size-32),y:l.y};return{x:clamp(p.x,l.x+32,l.x+l.size-32),y:l.y+l.size}}
function boundarySide(l:Location,p:Point):Side{const L=l.x,R=l.x+l.size,T=l.y,B=l.y+l.size,d={left:Math.abs(p.x-L),right:Math.abs(p.x-R),top:Math.abs(p.y-T),bottom:Math.abs(p.y-B)};return(Object.entries(d) as [Side,number][]).reduce((a,b)=>b[1]<a[1]?b:a)[0]}
function locationExit(l:Location,p:Point,s:Side):Point{if(s==='left')return{x:l.x,y:clamp(p.y,l.y,l.y+l.size)};if(s==='right')return{x:l.x+l.size,y:clamp(p.y,l.y,l.y+l.size)};if(s==='top')return{x:clamp(p.x,l.x,l.x+l.size),y:l.y};return{x:clamp(p.x,l.x,l.x+l.size),y:l.y+l.size}}
function rect(l:Location,c:number){return{left:l.x-c,right:l.x+l.size+c,top:l.y-c,bottom:l.y+l.size+c}}
function pointBlocked(p:Point,r:{left:number;right:number;top:number;bottom:number}){return p.x>r.left+.01&&p.x<r.right-.01&&p.y>r.top+.01&&p.y<r.bottom-.01}
function segmentClear(a:Point,b:Point,locations:Location[],sourceId:string,targetId:string){if(Math.abs(a.x-b.x)>.5&&Math.abs(a.y-b.y)>.5)return false;for(const l of locations){const r=rect(l,l.id===sourceId||l.id===targetId?0:ROUTE_CLEARANCE);if(Math.abs(a.y-b.y)<=.5){const y=a.y,x1=Math.min(a.x,b.x),x2=Math.max(a.x,b.x);if(y>r.top+.01&&y<r.bottom-.01&&x2>r.left+.01&&x1<r.right-.01)return false}else{const x=a.x,y1=Math.min(a.y,b.y),y2=Math.max(a.y,b.y);if(x>r.left+.01&&x<r.right-.01&&y2>r.top+.01&&y1<r.bottom-.01)return false}}return true}
type HeapItem={node:number;dir:number;dist:number;turns:number}
function heapPush(h:HeapItem[],x:HeapItem){h.push(x);let i=h.length-1;while(i){const p=Math.floor((i-1)/2),a=h[p],b=h[i];if(a.dist<b.dist-.01||(Math.abs(a.dist-b.dist)<=.01&&a.turns<=b.turns))break;h[p]=b;h[i]=a;i=p}}
function heapPop(h:HeapItem[]):HeapItem|undefined{if(!h.length)return;const out=h[0],last=h.pop()!;if(h.length){h[0]=last;let i=0;for(;;){const l=i*2+1,r=l+1;if(l>=h.length)break;let m=l;if(r<h.length&&(h[r].dist<h[l].dist-.01||(Math.abs(h[r].dist-h[l].dist)<=.01&&h[r].turns<h[l].turns)))m=r;if(h[i].dist<h[m].dist-.01||(Math.abs(h[i].dist-h[m].dist)<=.01&&h[i].turns<=h[m].turns))break;const t=h[i];h[i]=h[m];h[m]=t;i=m}}return out}
function shortestOutside(start:Point,end:Point,locations:Location[],sourceId:string,targetId:string):Point[]{
 if(same(start,end))return[start,end]
 const xs:number[]=[start.x,end.x]
 const ys:number[]=[start.y,end.y]
 locations.forEach(l=>{
  const clearance=l.id===sourceId||l.id===targetId?0:ROUTE_CLEARANCE
  const r=rect(l,clearance)
  xs.push(r.left,r.right)
  ys.push(r.top,r.bottom)
 })
 const ux=[...new Set(xs.map(v=>Math.round(v*10)/10))].sort((a,b)=>a-b)
 const uy=[...new Set(ys.map(v=>Math.round(v*10)/10))].sort((a,b)=>a-b)
 const nodes:Array<Point>=[]
 const index=new Map<string,number>()
 for(let yi=0;yi<uy.length;yi++)for(let xi=0;xi<ux.length;xi++){
  const p:Point={x:ux[xi],y:uy[yi]}
  let blocked=false
  for(const l of locations){
   const clearance=l.id===sourceId||l.id===targetId?0:ROUTE_CLEARANCE
   if(pointBlocked(p,rect(l,clearance))){blocked=true;break}
  }
  if(blocked)continue
  const id=nodes.length
  nodes.push(p)
  index.set(`${xi}:${yi}`,id)
 }
 const si=index.get(`${ux.indexOf(start.x)}:${uy.indexOf(start.y)}`)
 const ei=index.get(`${ux.indexOf(end.x)}:${uy.indexOf(end.y)}`)
 if(si===undefined||ei===undefined)return[start,end]
 const key=(n:number,d:number)=>`${n}|${d}`
 const dist=new Map<string,number>()
 const turns=new Map<string,number>()
 const prev=new Map<string,string>()
 const heap:HeapItem[]=[]
 dist.set(key(si,-1),0)
 turns.set(key(si,-1),0)
 heapPush(heap,{node:si,dir:-1,dist:0,turns:0})
 const dirs:[number,number][]=[[1,0],[-1,0],[0,1],[0,-1]]
 let finish:string|undefined
 while(heap.length){
  const cur=heapPop(heap)!
  const ck=key(cur.node,cur.dir)
  if(cur.dist>(dist.get(ck)??Infinity)+.01)continue
  if(cur.node===ei){finish=ck;break}
  const p=nodes[cur.node]
  for(let d=0;d<4;d++){
   const [dx,dy]=dirs[d]
   const nx=p.x+dx,ny=p.y+dy
   const xi=ux.indexOf(nx),yi=uy.indexOf(ny)
   if(xi<0||yi<0)continue
   const n=index.get(`${xi}:${yi}`)
   if(n===undefined)continue
   const q=nodes[n]
   if(!segmentClear(p,q,locations,sourceId,targetId))continue
   const nd=cur.dist+Math.abs(q.x-p.x)+Math.abs(q.y-p.y)
   const nt=cur.turns+(cur.dir!==-1&&cur.dir!==d?1:0)
   const nk=key(n,d)
   const od=dist.get(nk)??Infinity
   const ot=turns.get(nk)??Infinity
   if(nd<od-.01||(Math.abs(nd-od)<=.01&&nt<ot)){
    dist.set(nk,nd)
    turns.set(nk,nt)
    prev.set(nk,ck)
    heapPush(heap,{node:n,dir:d,dist:nd,turns:nt})
   }
  }
 }
 if(!finish)return[start,end]
 const out:Point[]=[]
 let k:string|undefined=finish
 while(k){
  out.push(nodes[Number(k.split('|')[0])])
  k=prev.get(k)
 }
 out.reverse()
 return normalize(out)
}
function routeLength(p:Point[]){let n=0;for(let i=1;i<p.length;i++)n+=Math.abs(p[i].x-p[i-1].x)+Math.abs(p[i].y-p[i-1].y);return n}
function normalRoute(fl:Location,ft:Transition,tl:Location,tt:Transition,fs:Side,ts:Side,locations:Location[],fp?:Point,tp?:Point){const a=fp??edge(fl,ft,fs),b=tp??edge(tl,tt,ts),ae=locationExit(fl,a,fs),be=locationExit(tl,b,ts),outside=shortestOutside(ae,be,locations,fl.id,tl.id);return normalize([a,ae,...outside.slice(1,-1),be,b])}
function oneWayRoute(fl:Location,ft:Transition,tl:Location,fs:Side,ts:Side,locations:Location[],fp?:Point,tp?:Point){const a=fp??edge(fl,ft,fs),ae=locationExit(fl,a,fs),b=tp??boundaryPointForSide(tl,ae,ts),outside=shortestOutside(ae,b,locations,fl.id,tl.id);return normalize([a,ae,...outside.slice(1)])}
function bestNormal(fl:Location,ft:Transition,tl:Location,tt:Transition,locations:Location[]){const sides:Side[]=['left','right','top','bottom'];let best:any=null;for(const fs of sides)for(const ts of sides){const pts=normalRoute(fl,ft,tl,tt,fs,ts,locations),len=routeLength(pts);if(!best||len<best.len)best={fs,ts,pts,len}}return best}
function bestOneWay(fl:Location,ft:Transition,tl:Location,locations:Location[]){const sides:Side[]=['left','right','top','bottom'];let best:any=null;for(const fs of sides)for(const ts of sides){const a=edge(fl,ft,fs),ae=locationExit(fl,a,fs),b=boundaryPointForSide(tl,ae,ts),pts=normalize([a,ae,...shortestOutside(ae,b,locations,fl.id,tl.id).slice(1)]),len=routeLength(pts);if(!best||len<best.len)best={fs,ts,b,pts,len}}return best}
function connectorRoute(c:Connector,g:any,locations:Location[]):Point[]{if(c.points&&c.points.length>=2)return normalize(c.points);if(c.bends&&c.bends.length)return normalize([g.a,...c.bends,g.b]);return c.oneWay?oneWayRoute(g.fl,g.ft,g.tl,g.fs,g.ts,locations,c.fromPoint,c.toPoint):normalRoute(g.fl,g.ft,g.tl,g.tt,g.fs,g.ts,locations,c.fromPoint,c.toPoint)}
function path(p:Point[]){return p.map((v,i)=>`${i?'L':'M'} ${v.x} ${v.y}`).join(' ')}
function handle(l:Location,t:Transition|undefined,s:Side):Point{if(!t)return{x:l.x+l.size/2,y:l.y+l.size/2};return edge(l,t,s)}
export function App(){
 const [mode,setMode]=useState<'viewer'|'editor'>('editor'),[locations,setLocations]=useState(initialLocations),[connectors,setConnectors]=useState(initialConnectors)
 const [selected,setSelected]=useState<string|null>(null),[selectedConnector,setSelectedConnector]=useState<string|null>(null),[hovered,setHovered]=useState<Endpoint|null>(null),[hoverLoc,setHoverLoc]=useState<string|null>(null),[start,setStart]=useState<Endpoint|null>(null)
 const [zoom,setZoom]=useState(1),[snap,setSnap]=useState(true),[connectionMode,setConnectionMode]=useState(false),[deleteMode,setDeleteMode]=useState(false),[oneWay,setOneWay]=useState(false),[pan,setPan]=useState(false)
 type MidDrag={id:string;index:number;points:Point[]}
 const drag=useRef<any>(null),panDrag=useRef<any>(null),midDrag=useRef<MidDrag|null>(null),endDrag=useRef<any>(null),shellRef=useRef<HTMLElement|null>(null)
 const map=useMemo(()=>new Map(locations.map(l=>[l.id,l])),[locations])
 const connected=useMemo(()=>{const s=new Set<string>();connectors.forEach(c=>{s.add(`${c.from.locationId}:${c.from.transitionId}`);if(!c.oneWay)s.add(`${c.to.locationId}:${c.to.transitionId}`)});return s},[connectors])
 const orange=useMemo(()=>new Set(connectors.filter(c=>c.oneWay).map(c=>`${c.from.locationId}:${c.from.transitionId}`)),[connectors])
 function addLocation(){const id=`loc-${Date.now()}`;setLocations(v=>[...v,{id,name:`Локация ${v.length+1}`,x:900+v.length*100,y:1100+v.length*100,size:SIZE,background:null,transitions:makeTransitions(id)}]);setSelected(id)}
 function startDrag(e:ReactPointerEvent<SVGElement>,l:Location,allowConnection=false){if(mode!=='editor'||(!allowConnection&&connectionMode)||pan)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:l.id,sx:e.clientX,sy:e.clientY,x:l.x,y:l.y,size:l.size};setSelected(l.id)}
 function moveLocation(e:ReactPointerEvent<SVGElement>){
  if(!drag.current)return;
  const d=drag.current;
  let x=d.x+(e.clientX-d.sx)/(zoom*SCALE),y=d.y+(e.clientY-d.sy)/(zoom*SCALE);
  if(snap){x=Math.round(x/SNAP)*SNAP;y=Math.round(y/SNAP)*SNAP}
  const nx=Math.max(34,Math.min(CW-d.size-34,x)),ny=Math.max(34,Math.min(CH-d.size-34,y));
  setLocations(v=>v.map(l=>l.id===d.id?{...l,x:nx,y:ny}:l));
  setConnectors(v=>v.map(c=>{if(c.from.locationId!==d.id&&c.to.locationId!==d.id)return c;const fl=map.get(c.from.locationId),tl=map.get(c.to.locationId);if(!fl||!tl)return c;const moved={...fl,x:d.id===fl.id?nx:fl.x,y:d.id===fl.id?ny:fl.y},toL=d.id===tl.id?{...tl,x:nx,y:ny}:tl,dx=nx-d.x,dy=ny-d.y;const fromPoint=c.fromPoint&&d.id===c.from.locationId?{x:c.fromPoint.x+dx,y:c.fromPoint.y+dy}:c.fromPoint,toPoint=c.toPoint&&d.id===c.to.locationId?{x:c.toPoint.x+dx,y:c.toPoint.y+dy}:c.toPoint;if(c.points&&c.points.length>=2){const next=c.points.map(p=>({...p}));if(d.id===c.from.locationId){const side=c.fromSide??'right';if(next[0])next[0]={x:next[0].x+dx,y:next[0].y+dy};if(next[1])next[1]=side==='left'||side==='right'?{x:next[1].x,y:next[0].y}:{x:next[0].x,y:next[1].y}}if(d.id===c.to.locationId){const j=next.length-1;if(next[j])next[j]={x:next[j].x+dx,y:next[j].y+dy};if(next[j-1])next[j-1]=c.toSide==='left'||c.toSide==='right'?{x:next[j-1].x,y:next[j].y}:{x:next[j].x,y:next[j-1].y}}return{...c,fromPoint,toPoint,points:normalize(next)}}const ng=geometryWithLocations({...c,fromPoint,toPoint},moved,toL);if(!ng)return c;if(c.oneWay){const best=bestOneWay(moved,ng.ft!,toL,locations);return{...c,fromSide:best.fs,toSide:best.ts,fromPoint:best.pts[0],toPoint:best.b}}const best=bestNormal(moved,ng.ft!,toL,ng.tt!,locations);return{...c,fromSide:best.fs,toSide:best.ts,fromPoint:best.pts[0],toPoint:best.pts[best.pts.length-1]}}));
 }
 function stopDrag(e?:ReactPointerEvent<SVGElement>){if(drag.current&&e&&e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);drag.current=null}
 function beginPan(e:ReactPointerEvent<HTMLElement>){if(!pan||e.button!==0)return;const s=shellRef.current;if(!s)return;e.preventDefault();panDrag.current={sx:e.clientX,sy:e.clientY,l:s.scrollLeft,t:s.scrollTop};s.setPointerCapture(e.pointerId)}
 function movePan(e:ReactPointerEvent<HTMLElement>){const d=panDrag.current,s=shellRef.current;if(!d||!s)return;s.scrollLeft=d.l-(e.clientX-d.sx);s.scrollTop=d.t-(e.clientY-d.sy)}
 function stopPan(e?:ReactPointerEvent<HTMLElement>){const s=shellRef.current;if(s&&e&&s.hasPointerCapture(e.pointerId))s.releasePointerCapture(e.pointerId);panDrag.current=null}
 function toggleConnection(){setConnectionMode(v=>{const n=!v;if(!n){setStart(null);setDeleteMode(false);setOneWay(false)}return n})}
 function beginConnection(ep:Endpoint,e:ReactPointerEvent){if(!connectionMode||deleteMode||oneWay||mode!=='editor')return;e.stopPropagation();setStart(ep);setSelected(ep.locationId)}
 function beginOne(ep:Endpoint,e:ReactPointerEvent){if(!connectionMode||deleteMode||!oneWay||start)return;e.stopPropagation();setStart(ep);setSelected(ep.locationId)}
 function finishConnection(ep:Endpoint,e:ReactPointerEvent){if(!start||!connectionMode||deleteMode||oneWay)return;e.stopPropagation();if(start.locationId===ep.locationId&&start.transitionId===ep.transitionId)return;const fl=map.get(start.locationId),tl=map.get(ep.locationId);const ft=fl?.transitions.find(t=>t.id===start.transitionId),tt=tl?.transitions.find(t=>t.id===ep.transitionId);if(!fl||!tl||!ft||!tt)return;const best=bestNormal(fl,ft,tl,tt,locations);setConnectors(v=>[...v,{id:`conn-${Date.now()}`,from:start,to:ep,color:'#fff',arrows:'none',fromSide:best.fs,toSide:best.ts,fromPoint:best.pts[0],toPoint:best.pts[best.pts.length-1]}]);setStart(null)}
 function finishOne(l:Location,e:ReactPointerEvent<SVGElement>){if(!start||!connectionMode||!oneWay||deleteMode||start.locationId===l.id)return;e.stopPropagation();const fl=map.get(start.locationId),ft=fl?.transitions.find(t=>t.id===start.transitionId);if(!fl||!ft)return;const best=bestOneWay(fl,ft,l,locations);setConnectors(v=>[...v,{id:`conn-${Date.now()}`,from:start,to:{locationId:l.id,transitionId:'__location__'},color:'#FF7000',arrows:'none',oneWay:true,fromSide:best.fs,toSide:best.ts,fromPoint:best.pts[0],toPoint:best.b}]);setStart(null);setHoverLoc(null)}
 function deleteTransition(ep:Endpoint,e:ReactPointerEvent){if(!deleteMode)return;e.stopPropagation();setConnectors(v=>v.filter(c=>!(c.from.locationId===ep.locationId&&c.from.transitionId===ep.transitionId)&&!(c.to.locationId===ep.locationId&&c.to.transitionId===ep.transitionId)));setStart(null)}
 function deleteSelected(){if(!selected)return;setLocations(v=>v.filter(l=>l.id!==selected));setConnectors(v=>v.filter(c=>c.from.locationId!==selected&&c.to.locationId!==selected));setSelected(null);setSelectedConnector(null)}
 function svgPoint(e:ReactPointerEvent<SVGElement>):Point{const svg=e.currentTarget.ownerSVGElement,r=svg?.getBoundingClientRect();return r?{x:(e.clientX-r.left)/(SCALE*zoom),y:(e.clientY-r.top)/(SCALE*zoom)}:{x:0,y:0}}
 function geometryWithLocations(c:Connector,fl:Location,tl:Location,fsOverride?:Side,tsOverride?:Side){const ft=fl.transitions.find(t=>t.id===c.from.transitionId);if(!ft)return null;const tt=tl.transitions.find(t=>t.id===c.to.transitionId);const tc=c.oneWay?{x:tl.x+tl.size/2,y:tl.y+tl.size/2}:tt?center(tl,tt):{x:tl.x+tl.size/2,y:tl.y+tl.size/2};const fs=fsOverride??c.fromSide??sideFor(fl,ft,tc,relation(fl,tl));const ts=tsOverride??c.toSide??(c.oneWay?boundarySide(tl,c.toPoint??boundary(tl,center(fl,ft))):(tt?sideFor(tl,tt,center(fl,ft),relation(tl,fl)):relation(tl,fl)));const a=c.fromPoint??edge(fl,ft,fs),b=c.oneWay?(c.toPoint??boundaryPointForSide(tl,locationExit(fl,a,fs),ts)):(c.toPoint??(tt?edge(tl,tt,ts):a));return{fl,tl,ft,tt,fs,ts,a,b}}
 function geometry(c:Connector){const fl=map.get(c.from.locationId),tl=map.get(c.to.locationId);if(!fl||!tl)return null;return geometryWithLocations(c,fl,tl)}
 function beginMid(e:ReactPointerEvent<SVGCircleElement>,id:string,index:number){if(mode!=='editor'||connectionMode||pan||deleteMode)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);const c=connectors.find(v=>v.id===id),g=c&&geometry(c);if(!c||!g)return;midDrag.current={id,index,points:connectorRoute(c,g,locations)};setSelectedConnector(id)}
 function dragMid(e:ReactPointerEvent<SVGCircleElement>){const d=midDrag.current;if(!d)return;const i=d.index,p=d.points;if(!p[i]||!p[i+1])return;const q=svgPoint(e),next=p.map(v=>({...v})),horizontal=Math.abs(p[i+1].x-p[i].x)>=Math.abs(p[i+1].y-p[i].y),last=p.length-2
  if(i>0&&i<last){if(horizontal){next[i].y=q.y;next[i+1].y=q.y}else{next[i].x=q.x;next[i+1].x=q.x}}
  else if(i===0){if(horizontal){next.splice(1,0,{x:p[0].x,y:q.y});next[2].y=q.y}else{next.splice(1,0,{x:q.x,y:p[0].y});next[2].x=q.x}}
  else {if(horizontal){next.splice(next.length-1,0,{x:p[last].x,y:q.y});next[next.length-2].y=q.y}else{next.splice(next.length-1,0,{x:q.x,y:p[last].y});next[next.length-2].x=q.x}}
  const c=connectors.find(v=>v.id===d.id),g=c&&geometry(c);if(!c||!g)return;const nr=normalize(next);setConnectors(v=>v.map(x=>x.id===d.id?{...x,points:nr,bends:undefined}:x))
 }
 function stopMid(e?:ReactPointerEvent<SVGCircleElement>){if(e&&e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);midDrag.current=null}
 function beginEnd(e:ReactPointerEvent<SVGCircleElement>,id:string,which:'from'|'to'){if(mode!=='editor'||connectionMode||pan||deleteMode)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);endDrag.current={id,which};setSelectedConnector(id)}
 function nearestTransitionPoint(p:Point,excludeLocation?:string){let best:any=null;for(const l of locations)for(const t of l.transitions){const w=l.size/COLS,h=l.size/ROWS,x=l.x+t.col*w,y=l.y+t.row*h;let qx=clamp(p.x,x,x+w),qy=clamp(p.y,y,y+h);if(p.x>x&&p.x<x+w&&p.y>y&&p.y<y+h){const ds=[{x:qx,y},{x:qx,y:y+h},{x,y:qy},{x:x+w,y:qy}];let q=ds[0],bd=Math.hypot(p.x-q.x,p.y-q.y);for(const z of ds){const dd=Math.hypot(p.x-z.x,p.y-z.y);if(dd<bd){bd=dd;q=z}}qx=q.x;qy=q.y}const d=Math.hypot(p.x-qx,p.y-qy);if((!excludeLocation||l.id!==excludeLocation)&&(!best||d<best.d))best={l,t,p:{x:qx,y:qy},d}}return best}
 function nearestLocationBoundary(p:Point,excludeLocation?:string){let best:any=null;for(const l of locations){if(l.id===excludeLocation)continue;const q=boundary(l,p),d=Math.hypot(p.x-q.x,p.y-q.y);if(!best||d<best.d)best={l,p:q,d}}return best}
 function sideFromCellPoint(l:Location,t:Transition,p:Point,fallback:Side):Side{const w=l.size/COLS,h=l.size/ROWS,x=l.x+t.col*w,y=l.y+t.row*h,d={left:Math.abs(p.x-x),right:Math.abs(p.x-(x+w)),top:Math.abs(p.y-y),bottom:Math.abs(p.y-(y+h))};return(Object.entries(d) as [Side,number][]).reduce((a,b)=>b[1]<a[1]?b:a)[0]??fallback}
 function dragEnd(e:ReactPointerEvent<SVGCircleElement>){const d=endDrag.current;if(!d)return;const c=connectors.find(v=>v.id===d.id),g=c&&geometry(c);if(!c||!g)return;const p=svgPoint(e);if(d.which==='from'){const hit=nearestTransitionPoint(p);if(!hit||hit.d>MAGNET*1.8)return;const side=sideFromCellPoint(hit.l,hit.t,hit.p,g.fs);setConnectors(v=>v.map(x=>x.id===d.id?{...x,from:{locationId:hit.l.id,transitionId:hit.t.id},fromSide:side,fromPoint:hit.p,points:undefined,bends:undefined}:x));return}if(c.oneWay){const hit=nearestLocationBoundary(p,g.fl.id);if(!hit||hit.d>MAGNET*2)return;const side=boundarySide(hit.l,hit.p);setConnectors(v=>v.map(x=>x.id===d.id?{...x,to:{locationId:hit.l.id,transitionId:'__location__'},toSide:side,toPoint:hit.p,points:undefined,bends:undefined}:x));return}const hit=nearestTransitionPoint(p);if(!hit||hit.d>MAGNET*1.8)return;const side=sideFromCellPoint(hit.l,hit.t,hit.p,g.ts);setConnectors(v=>v.map(x=>x.id===d.id?{...x,to:{locationId:hit.l.id,transitionId:hit.t.id},toSide:side,toPoint:hit.p,points:undefined,bends:undefined}:x))}
 function stopEnd(e?:ReactPointerEvent<SVGCircleElement>){if(e&&e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);endDrag.current=null}
 function setBackground(file:File|undefined){if(!file||!selected)return;const r=new FileReader();r.onload=()=>setLocations(v=>v.map(l=>l.id===selected?{...l,background:String(r.result)}:l));r.readAsDataURL(file)}
 function removeBackground(){if(selected)setLocations(v=>v.map(l=>l.id===selected?{...l,background:null}:l))}
 const titleFontSize=50,titleHitbox=16
 return <div className="app">
  <header className="topbar"><div className="brand">KARTA-CATWAR</div><div className="mode-switch"><button className={mode==='viewer'?'active':''} onClick={()=>{setMode('viewer');setConnectionMode(false);setDeleteMode(false);setOneWay(false);setStart(null);setSelectedConnector(null)}}>Просмотр</button><button className={mode==='editor'?'active':''} onClick={()=>setMode('editor')}>Редактор</button></div><div className="top-actions"><button onClick={()=>setZoom(v=>Math.max(.4,v-.1))}>−</button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(v=>Math.min(2,v+.1))}>+</button></div></header>
  <aside className="toolbar"><button title="Выбор" className={!pan&&!connectionMode?'active-tool':''} onClick={()=>{setPan(false);setConnectionMode(false);setDeleteMode(false);setOneWay(false);setStart(null);setSelectedConnector(null)}}><img src="/KARTA-CATWAR/icons/cursor.svg" alt=""/></button><button title="Перемещение по холсту" className={pan?'active-tool':''} onClick={()=>{setPan(v=>!v);setStart(null);setSelectedConnector(null)}}><img src="/KARTA-CATWAR/icons/holding-hand.svg" alt=""/></button>{mode==='editor'&&<><button title="Привязка к сетке" className={snap?'active-tool':''} onClick={()=>setSnap(v=>!v)}><img src="/KARTA-CATWAR/icons/grid.svg" alt=""/></button><button title="Режим переходов" className={connectionMode?'active-tool':''} onClick={toggleConnection}><img src="/KARTA-CATWAR/icons/arrow.svg" alt=""/></button><button title="Добавить локацию" onClick={addLocation}><img src="/KARTA-CATWAR/icons/add-location.svg" alt=""/></button><button title="Удалить выбранное" onClick={deleteSelected}><img src="/KARTA-CATWAR/icons/delete-location.svg" alt=""/></button></>}</aside>
  {mode==='editor'&&connectionMode&&<aside className="transition-tools"><button title="Переход в одну сторону" className={oneWay?'active-tool':''} onClick={()=>{setOneWay(v=>!v);setDeleteMode(false);setStart(null)}}><img src="/KARTA-CATWAR/icons/arrow.svg" alt=""/></button><button title="Удаление переходов" className={deleteMode?'active-tool':''} onClick={()=>{setDeleteMode(v=>!v);setOneWay(false);setStart(null)}}><img src="/KARTA-CATWAR/icons/delete-location.svg" alt=""/></button></aside>}
  <main ref={shellRef} className={`canvas-shell ${pan?'pan-mode':''}`} onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={stopPan} onPointerCancel={stopPan}><div className="canvas" onClick={e=>{if(e.target===e.currentTarget&&!pan){setSelected(null);setStart(null);setSelectedConnector(null)}}}><svg className="map" width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`} style={{transform:`scale(${SCALE*zoom})`}}>
   <defs><pattern id="canvas-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="#20252d" strokeWidth="1"/></pattern></defs><rect width={CW} height={CH} fill="url(#canvas-grid)"/>
   {locations.map(l=><g key={l.id} className={`location ${selected===l.id?'selected':''}`} transform={`translate(${l.x} ${l.y})`}>
    <rect width={l.size} height={l.size} className="location-bg" onPointerDown={e=>{if(start&&oneWay)finishOne(l,e);else startDrag(e,l)}} onPointerMove={moveLocation} onPointerUp={stopDrag} onPointerCancel={()=>stopDrag()} onClick={e=>{e.stopPropagation();setSelected(l.id)}} onPointerEnter={()=>setHoverLoc(l.id)} onPointerLeave={()=>setHoverLoc(null)}/>{l.background&&<image href={l.background} x="0" y="0" width={l.size} height={l.size} preserveAspectRatio="xMidYMid slice" pointerEvents="none"/>}
    <rect x={-titleHitbox} y={-titleFontSize-titleHitbox} width={l.size+titleHitbox*2} height={titleFontSize+titleHitbox+20} className="location-title-hitbox" onPointerDown={e=>startDrag(e,l,true)} onPointerMove={moveLocation} onPointerUp={stopDrag} onPointerCancel={()=>stopDrag()} onClick={e=>{e.stopPropagation();setSelected(l.id)}}/><text x={l.size/2} y="-14" textAnchor="middle" className="location-title" style={{fontSize:titleFontSize}} pointerEvents="none">{l.name}</text>
    <g className="transition-grid" pointerEvents={connectionMode&&!(oneWay&&start)?'auto':'none'}>{l.transitions.map(t=>{const w=l.size/COLS,h=l.size/ROWS,ep={locationId:l.id,transitionId:t.id},key=`${l.id}:${t.id}`,st=start?.locationId===l.id&&start.transitionId===t.id,c=connected.has(key),o=orange.has(key);return <g key={t.id} className="transition-cell" onPointerEnter={()=>setHovered(ep)} onPointerLeave={()=>setHovered(null)} onPointerDown={e=>{e.stopPropagation();setSelected(l.id);if(deleteMode)deleteTransition(ep,e);else if(start)finishConnection(ep,e);else if(oneWay)beginOne(ep,e);else beginConnection(ep,e)}} onClick={e=>e.stopPropagation()}><rect x={t.col*w} y={t.row*h} width={w} height={h} style={{fill:st?(oneWay?'#FF7000':'#ffffff38'):o?'#FF7000':c?'#fff':'transparent',stroke:o||(st&&oneWay)?'#FF7000':'rgba(255,255,255,.15)',strokeWidth:2}}/></g>})}</g><rect width={l.size} height={l.size} className="location-frame" pointerEvents="none"/>
   </g>)}
   <g className="connectors-layer">{connectors.map(c=>{const g=geometry(c);if(!g)return null;const pts=connectorRoute(c,g,locations),d=path(pts),edit=mode==='editor'&&selectedConnector===c.id,handles=pts.slice(0,-1).map((p,i)=>({p:{x:(p.x+pts[i+1].x)/2,y:(p.y+pts[i+1].y)/2},i})),sides:Side[]=['left','right','top','bottom'];return <g key={c.id}><path d={d} fill="none" stroke="transparent" strokeWidth="22" pointerEvents="stroke" onPointerDown={e=>{if(connectionMode||pan||deleteMode)return;e.stopPropagation();setSelectedConnector(c.id)}}/>{c.oneWay?<path d={d} fill="none" stroke="#FF7000" strokeWidth="4" strokeDasharray="10 8" strokeLinecap="butt" strokeLinejoin="miter" pointerEvents="none"/>:<><path d={d} fill="none" stroke="#000" strokeWidth="7" strokeLinecap="butt" strokeLinejoin="miter" pointerEvents="none"/><path d={d} fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="butt" strokeLinejoin="miter" pointerEvents="none"/></>}{edit&&<>{handles.map(({p,i})=><circle key={`m${i}`} className="connector-mid-handle" cx={p.x} cy={p.y} r="10" onPointerDown={e=>beginMid(e,c.id,i)} onPointerMove={dragMid} onPointerUp={stopMid} onPointerCancel={()=>stopMid()}/>)}{sides.map(s=>{const p=handle(g.fl,g.ft,s);return <g key={`f${s}`} className="connector-side-handle-group"><circle cx={p.x} cy={p.y} r="26" fill="transparent" pointerEvents="all" onPointerDown={e=>beginEnd(e,c.id,'from')} onPointerMove={dragEnd} onPointerUp={stopEnd} onPointerCancel={()=>stopEnd()}/><circle className={`connector-side-handle ${c.fromSide===s?'active':''}`} cx={p.x} cy={p.y} r="13" pointerEvents="none"/></g>})}{c.oneWay&&<g className="connector-side-handle-group"><circle cx={g.b.x} cy={g.b.y} r="30" fill="transparent" pointerEvents="all" onPointerDown={e=>beginEnd(e,c.id,'to')} onPointerMove={dragEnd} onPointerUp={stopEnd} onPointerCancel={()=>stopEnd()}/><circle className="connector-side-handle active" cx={g.b.x} cy={g.b.y} r="13" pointerEvents="none"/></g>}{!c.oneWay&&g.tt&&sides.map(s=>{const p=handle(g.tl,g.tt,s);return <g key={`t${s}`} className="connector-side-handle-group"><circle cx={p.x} cy={p.y} r="26" fill="transparent" pointerEvents="all" onPointerDown={e=>beginEnd(e,c.id,'to')} onPointerMove={dragEnd} onPointerUp={stopEnd} onPointerCancel={()=>stopEnd()}/><circle className={`connector-side-handle ${c.toSide===s?'active':''}`} cx={p.x} cy={p.y} r="13" pointerEvents="none"/></g>})}</>}</g>})}</g>
   {start&&!deleteMode&&!oneWay&&hovered&&(()=>{const fl=map.get(start.locationId),tl=map.get(hovered.locationId);if(!fl||!tl)return null;const ft=fl.transitions.find(t=>t.id===start.transitionId),tt=tl.transitions.find(t=>t.id===hovered.transitionId);if(!ft||!tt)return null;const best=bestNormal(fl,ft,tl,tt,locations),d=path(best.pts);return <g><path d={d} fill="none" stroke="#000" strokeWidth="7"/><path d={d} fill="none" stroke="#fff" strokeWidth="4"/></g>})()}
   {start&&oneWay&&!deleteMode&&hoverLoc&&(()=>{const fl=map.get(start.locationId),tl=map.get(hoverLoc);if(!fl||!tl||fl.id===tl.id)return null;const ft=fl.transitions.find(t=>t.id===start.transitionId);if(!ft)return null;const best=bestOneWay(fl,ft,tl,locations),d=path(best.pts);return <path d={d} fill="none" stroke="#FF7000" strokeWidth="4" strokeDasharray="10 8"/>})()}
  </svg></div></main>
  {selected&&mode==='editor'&&<section className="inspector"><div className="inspector-title">Локация</div><input value={map.get(selected)?.name??''} onChange={e=>setLocations(v=>v.map(l=>l.id===selected?{...l,name:e.target.value}:l))}/><div className="inspector-field"><label>Фон локации</label><input type="file" accept="image/*" onChange={e=>setBackground(e.target.files?.[0])}/>{map.get(selected)?.background&&<button className="remove-bg" onClick={removeBackground}>Убрать фон</button>}</div><div className="inspector-note">Фон находится под сеткой переходов.</div></section>}
 </div>
}
