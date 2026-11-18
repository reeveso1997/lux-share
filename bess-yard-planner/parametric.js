/* Feet, SW origin. No catalog dependency.
 * unitCount is N; units is the equipment array.
 * gen(f,n,{rotation,split,variant,west,onReject}) -> layout|null.
 * rotation: 0,90,180,270 degrees CCW.
 * split: first row count; for L families, side-arm count.
 * variants(f,n): family splits in all four rotations.
 * grid(n,{rows,columns,paired,rotation}): row-major grid candidates.
 * all(n): deduplicated oriented physical footprints.
 * Rejection details: gen.lastReason or opts.onReject(message).
 */
(function(root,factory) {
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.BESSP=api;
})(typeof window!=='undefined'?window:null,function() {
  'use strict';
  const U=44.8/12, L=93.3/12, ZONE=3.5, E=1e-8;
  const ACCESS={S:'E',N:'W',W:'S',E:'N'};
  const families=Object.freeze([
    'A','AF','B','BB','C','CS','CF','D','V','L','LF','LFB'
  ]);
  const rect=(x,y,w,h)=>({x,y,w,h});
  const same=(a,b)=>Math.abs(a[0]-b[0])<E&&Math.abs(a[1]-b[1])<E;
  const area=p=>p.reduce((s,a,i)=>{
    const b=p[(i+1)%p.length];
    return s+a[0]*b[1]-b[0]*a[1];
  },0)/2;

  function onSegment(p,a,b) {
    return Math.abs(
      (p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0])
    )<E &&
      p[0]>=Math.min(a[0],b[0])-E &&
      p[0]<=Math.max(a[0],b[0])+E &&
      p[1]>=Math.min(a[1],b[1])-E &&
      p[1]<=Math.max(a[1],b[1])+E;
  }

  function inside(p,polygon) {
    let yes=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const a=polygon[j],b=polygon[i];
      if(onSegment(p,a,b)) return true;
      if((a[1]>p[1])!==(b[1]>p[1]) &&
        p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) yes=!yes;
    }
    return yes;
  }

  function hits(a,b,r) {
    if(Math.abs(a[0]-b[0])<E) {
      return a[0]>r.x+E&&a[0]<r.x+r.w-E &&
        Math.max(a[1],b[1])>r.y+E &&
        Math.min(a[1],b[1])<r.y+r.h-E;
    }
    return a[1]>r.y+E&&a[1]<r.y+r.h-E &&
      Math.max(a[0],b[0])>r.x+E &&
      Math.min(a[0],b[0])<r.x+r.w-E;
  }

  function simplify(points) {
    const out=[];
    for(const p of points) {
      if(out.length&&same(p,out[out.length-1])) continue;
      while(out.length>1&&onSegment(out[out.length-1],out[out.length-2],p)) {
        out.pop();
      }
      out.push(p.slice());
    }
    return out;
  }

  // Orthogonal visibility-grid shortest path. A branch may cross its own pad.
  function route(start,network,fence,obstacles) {
    const xs=[start[0]],ys=[start[1]];
    for(const p of fence.concat(network)) {
      xs.push(p[0]);ys.push(p[1]);
    }
    for(const r of obstacles) {
      xs.push(r.x-.125,r.x,r.x+r.w,r.x+r.w+.125);
      ys.push(r.y-.125,r.y,r.y+r.h,r.y+r.h+.125);
    }
    const unique=a=>a.sort((a,b)=>a-b)
      .filter((v,i,a)=>!i||v-a[i-1]>E);
    const X=unique(xs),Y=unique(ys),nx=X.length,size=nx*Y.length;
    const point=id=>[X[id%nx],Y[Math.floor(id/nx)]];
    const valid=new Uint8Array(size),goal=new Uint8Array(size);
    for(let id=0;id<size;id++) {
      const p=point(id);
      valid[id]=inside(p,fence)&&!obstacles.some(r=>
        p[0]>r.x+E&&p[0]<r.x+r.w-E&&
        p[1]>r.y+E&&p[1]<r.y+r.h-E);
      goal[id]=network.length===1?same(p,network[0]):
        network.slice(1).some((b,i)=>onSegment(p,network[i],b));
    }
    const source=X.findIndex(v=>Math.abs(v-start[0])<E)+
      nx*Y.findIndex(v=>Math.abs(v-start[1])<E);
    const dist=new Float64Array(size).fill(Infinity);
    const prev=new Int32Array(size).fill(-1),heap=[];

    function push(item) {
      let i=heap.length;heap.push(item);
      while(i) {
        const p=(i-1)>>1;
        if(heap[p][0]<=item[0]) break;
        heap[i]=heap[p];i=p;
      }
      heap[i]=item;
    }

    function pop() {
      const first=heap[0],last=heap.pop();
      if(heap.length) {
        let i=0;
        while(2*i+1<heap.length) {
          let c=2*i+1;
          if(c+1<heap.length&&heap[c+1][0]<heap[c][0]) c++;
          if(heap[c][0]>=last[0]) break;
          heap[i]=heap[c];i=c;
        }
        heap[i]=last;
      }
      return first;
    }

    dist[source]=0;push([0,source]);
    while(heap.length) {
      const [cost,id]=pop();
      if(cost>dist[id]+E) continue;
      if(goal[id]) {
        const path=[];
        for(let i=id;i!==-1;i=prev[i]) path.push(point(i));
        return simplify(path.reverse());
      }
      const a=point(id),col=id%nx,row=Math.floor(id/nx),next=[];
      if(col) next.push(id-1);
      if(col+1<nx) next.push(id+1);
      if(row) next.push(id-nx);
      if(row+1<Y.length) next.push(id+nx);
      for(const k of next) {
        if(!valid[k]) continue;
        const b=point(k),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
        if(!inside(mid,fence)||obstacles.some(r=>hits(a,b,r))) continue;
        const d=cost+Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
        if(d+E<dist[k]) {
          dist[k]=d;prev[k]=id;push([d,k]);
        }
      }
    }
    throw new Error('No conduit route from '+JSON.stringify(start));
  }

  const overlap=(a,b)=>
    a.x<b.x+b.w-E&&b.x<a.x+a.w-E&&
    a.y<b.y+b.h-E&&b.y<a.y+a.h-E;
  const unique=a=>[...new Set(a.map(v=>Math.round(v*1e8)/1e8))]
    .sort((a,b)=>a-b);
  const box=(W,D)=>[[0,0],[W,0],[W,D],[0,D]];

  function rectInside(r,p) {
    const X=unique([
      r.x,r.x+r.w,
      ...p.map(a=>a[0]).filter(x=>x>r.x&&x<r.x+r.w)
    ]);
    const Y=unique([
      r.y,r.y+r.h,
      ...p.map(a=>a[1]).filter(y=>y>r.y&&y<r.y+r.h)
    ]);
    for(const x of [r.x,r.x+r.w]) {
      for(const y of [r.y,r.y+r.h]) {
        if(!inside([x,y],p)) return false;
      }
    }
    for(let i=1;i<X.length;i++) {
      for(let j=1;j<Y.length;j++) {
        if(!inside([(X[i-1]+X[i])/2,(Y[j-1]+Y[j])/2],p)) return false;
      }
    }
    return true;
  }

  function unit(x,y,control,id) {
    const v='NS'.includes(control),w=v?U:L,h=v?L:U,t=8/12;
    return {
      id,x,y,w,h,control,access:ACCESS[control],
      stub:{
        S:[x+w-t,y+t],N:[x+t,y+h-t],
        W:[x+t,y+t],E:[x+w-t,y+h-t]
      }[control]
    };
  }

  function zonesOf(units) {
    return units.flatMap(u=>['control','access'].map(kind=>({
      unit:u.id,kind,...{
        S:rect(u.x,u.y-ZONE,u.w,ZONE),
        N:rect(u.x,u.y+u.h,u.w,ZONE),
        W:rect(u.x-ZONE,u.y,ZONE,u.h),
        E:rect(u.x+u.w,u.y,ZONE,u.h)
      }[u[kind]]
    })));
  }

  const move=(u,dx,dy)=>unit(u.x+dx,u.y+dy,u.control,u.id);
  const margin=(u,s)=>u.control===s||u.access===s?4:2;

  function envelope(units,force={}) {
    const loX=Math.min(...units.map(u=>u.x-(force.W||margin(u,'W'))));
    const loY=Math.min(...units.map(u=>u.y-(force.S||margin(u,'S'))));
    const W=Math.max(...units.map(u=>
      u.x+u.w+(force.E||margin(u,'E'))))-loX;
    const D=Math.max(...units.map(u=>
      u.y+u.h+(force.N||margin(u,'N'))))-loY;
    return {
      units:units.map(u=>move(u,-loX,-loY)),W,D,fence:box(W,D)
    };
  }

  function valid(g) {
    const u=g.units,z=zonesOf(u);
    return u.every((a,i)=>
      rectInside(a,g.fence)&&!u.slice(i+1).some(b=>overlap(a,b))) &&
      z.every(a=>rectInside(a,g.fence)&&!u.some(b=>overlap(a,b)));
  }

  function rackAt(side,t,W,D,work=ZONE) {
    const r=side==='E'?rect(W-1,t,1,6):
      side==='W'?rect(0,t,1,6):
      side==='N'?rect(t,D-1,6,1):rect(t,0,6,1);
    const a=side==='E'?rect(r.x-work,t,work,6):
      side==='W'?rect(1,t,work,6):
      side==='N'?rect(t,r.y-work,6,work):rect(t,1,6,work);
    return {rack:{...r,side,inZone:work!==ZONE},rackWork:a};
  }

  // Exact obstacle-contact breakpoints. Existing pockets are considered first.
  // Grow only the selected outer fence; preserve an L's notch.
  function fitRack(base,sides=['E','S','W','N']) {
    let best=null;
    const z=zonesOf(base.units),solids=base.units.concat(z);
    for(const side of sides) {
      const vertical='EW'.includes(side),span=vertical?base.D:base.W;
      if(span<6-E) continue;
      const along=r=>vertical?[r.y,r.y+r.h]:[r.x,r.x+r.w];
      const normal=r=>side==='E'?r.x+r.w-base.W:
        side==='W'?-r.x:side==='N'?r.y+r.h-base.D:-r.y;
      const growth=unique([
        0,...solids.map(r=>normal(r)+1),
        ...base.units.map(r=>normal(r)+4.5)
      ]).filter(v=>v>=-E);
      const starts=unique([
        0,span-6,
        ...solids.flatMap(r=>along(r).flatMap(v=>[v,v-6])),
        ...base.fence.flatMap(p=>[
          p[vertical?1:0],p[vertical?1:0]-6
        ])
      ]).filter(v=>v>=-E&&v+6<=span+E);

      for(const grow of growth) {
        const dx=side==='W'?grow:0,dy=side==='S'?grow:0;
        const W=base.W+(vertical?grow:0);
        const D=base.D+(vertical?0:grow);
        const fence=base.fence.map(([x,y])=>[
          side==='W'?(x===0?0:x+grow):
            side==='E'&&Math.abs(x-base.W)<E?x+grow:x,
          side==='S'?(y===0?0:y+grow):
            side==='N'&&Math.abs(y-base.D)<E?y+grow:y
        ]);
        const sf=area(fence);
        if(best&&sf>=best.sf-E) continue;
        const units=base.units.map(u=>move(u,dx,dy));
        const zones=zonesOf(units);
        for(const t of starts) {
          const r=rackAt(side,t,W,D);
          if(!rectInside(r.rack,fence)||!rectInside(r.rackWork,fence)) {
            continue;
          }
          if(units.some(u=>overlap(u,r.rack)||overlap(u,r.rackWork))||
            zones.some(z=>overlap(z,r.rack))) continue;
          best={...base,W,D,fence,units,zones,sf,...r};
          break;
        }
      }
    }
    return best;
  }

  // S,N access pairs across 4 ft; consecutive pair backs across 1 ft.
  // An odd west single is N, followed by S,N pairs. Nothing is mirrored.
  function pairRow(k,y,west=false) {
    let x=0;
    return Array.from({length:k},(_,i)=>{
      const c=(i+(west?1:0))%2?'N':'S',u=unit(x,y,c,0);
      x+=U+(c==='S'?4:1);
      return u;
    });
  }

  function reason(f,n,o={}) {
    if(!Number.isInteger(n)||n<1||n>10) {
      return 'Unit count must be an integer from 1 to 10.';
    }
    if(!families.includes(f)&&f!=='BB2'&&f!=='grid') {
      return 'Unknown family: '+f;
    }
    if(o.rotation!==undefined&&![0,90,180,270].includes(o.rotation)) {
      return 'Rotation must be 0, 90, 180 or 270 degrees CCW.';
    }
    if(f==='CS'&&n!==4&&n!==6) {
      return 'The catalog permits the CS rack exception only for 4 or 6 units.';
    }
    if(f==='CS'&&o.split!==undefined&&o.split!==n/2) {
      return 'CS requires the catalog equal-row arrangement.';
    }
    if(f==='AF'&&o.west&&n%2===0) {
      return 'A west odd single requires an odd unit count.';
    }
    if(['C','CF','BB','L','LF'].includes(f)&&n<2) {
      return f+' needs two occupied rows or arms.';
    }
    if(f==='LFB'&&(n<6||n%2)) {
      return 'LFB requires complete pairs and at least two top-arm pairs plus one side-arm pair.';
    }
    if((f==='BB2'||o.variant==='BB2')&&n<5) {
      return 'BB2 requires two occupied pair lines and a third singles line.';
    }
    if(o.split!==undefined&&
      (!Number.isInteger(o.split)||o.split<1||o.split>=n)) {
      return 'split must be an integer between 1 and n-1.';
    }
    return null;
  }

  function buildBase(f,n,o) {
    const units=[];
    const add=(x,y,c)=>units.push(unit(x,y,c,units.length+1));
    let g,sides=['E','S','W','N'];

    if(f==='A') {
      for(let i=0;i<n;i++) add(i*(U+4),0,'S');

    } else if(f==='AF') {
      units.push(...pairRow(n,0,!!o.west));
      sides=['S'];
      g=envelope(units,{S:4,N:4});

    } else if(f==='B'||f==='BB'||f==='BB2') {
      const line=(k,y)=>{
        for(let i=0;i<k;i++) {
          add(Math.floor(i/2)*(L+4),y+(i%2)*(U+1),i%2?'E':'W');
        }
      };
      if(f==='B') {
        line(n,0);
      } else if(f==='BB2'||o.variant==='BB2') {
        const cols=o.columns||Math.ceil(n/5);
        if(n<=4*cols||n>5*cols) return null;
        for(let i=0;i<n;i++) {
          const row=Math.floor(i/cols);
          add(
            (i%cols)*(L+4),
            row*U+Math.floor(row/2)*5+(row%2),
            row%2?'E':'W'
          );
        }
      } else {
        const k=o.split||
          Math.min(n-1,2*Math.ceil(Math.floor(n/2)/2)+(n%2));
        if(k>=n) return null;
        line(k,0);
        line(n-k,2*U+5);
      }

    } else if(f==='C'||f==='CS') {
      const k=o.split||Math.ceil(n/2);
      for(let i=0;i<k;i++) add(i*(U+4),L+4,'S');
      for(let i=0;i<n-k;i++) add(2+i*(U+4),0,'N');
      if(f==='CS') {
        g=envelope(units);
        const r=rackAt('E',g.D-2-L+(L-6)/2,g.W,g.D,3);
        return {...g,...r,zones:zonesOf(g.units),sf:g.W*g.D};
      }

    } else if(f==='CF') {
      const k=o.split||Math.ceil(n/2),choices=[];
      for(const a of k%2?[false,true]:[false]) {
        for(const b of (n-k)%2?[false,true]:[false]) {
          const rows=[pairRow(k,L+4,a),pairRow(n-k,0,b)];
          const us=rows.flatMap(row=>
            row.map(u=>move(u,margin(row[0],'W'),0)));
          const candidate=fitRack(envelope(us,{N:4,S:4}),['S','W']);
          if(candidate) choices.push(candidate);
        }
      }
      return choices.sort((a,b)=>a.sf-b.sf)[0]||null;

    } else if(f==='D') {
      for(let i=0;i<n;i++) {
        add((i%2)*(L+1),Math.floor(i/2)*(U+4),i%2?'E':'W');
      }
      g=envelope(units,{N:4,S:4,E:4,W:4});

    } else if(f==='V') {
      for(let row=0;units.length<n;row++) {
        const y=-row*(U+1);
        if(row%3===0) {
          add(0,y,'W');
          if(units.length<n) add(L+1,y,'E');
        } else if(row%3===1) {
          add(L+1,y,'W');
        } else {
          add(0,y,'E');
        }
      }

    } else if(['L','LF','LFB'].includes(f)) {
      const sideCount=o.split||(f==='LFB'?
        2*Math.min(2,Math.floor((n-4)/2)):
        Math.min(4,Math.floor(n/2)));
      const topCount=n-sideCount;
      let leg,notch,W,D;

      if(f==='LFB') {
        if(sideCount%2||topCount%2||topCount<4) return null;
        leg=2*U+9;
        notch=sideCount/2*(L+4);
        D=notch+leg;
        W=4+topCount/2*(L+4);
        for(let i=0;i<sideCount/2;i++) {
          add(4,4+i*(L+4),'N');
          add(5+U,4+i*(L+4),'S');
        }
        for(let i=0;i<topCount/2;i++) {
          add(4+i*(L+4),notch+4,'W');
          add(4+i*(L+4),notch+5+U,'E');
        }
        sides=['E'];
      } else {
        const flipped=f==='LF',start=flipped?4:2;
        const pos=k=>Array.from({length:k},(_,i)=>
          start+i*U+(flipped?Math.floor(i/2)*5+i%2:i*4));
        const xs=pos(topCount),ys=pos(sideCount);
        leg=L+(flipped?8:6);
        notch=ys[sideCount-1]+U+(flipped?0:4);
        D=notch+4+L+(flipped?4:2);
        W=xs[topCount-1]+U+4;
        xs.forEach((x,i)=>add(x,notch+4,flipped&&i%2===0?'N':'S'));
        ys.forEach((y,i)=>add(start,y,flipped&&i%2===0?'W':'E'));
        sides=flipped?['E']:['W'];
      }
      if(W<=leg+E) return null;
      g={
        units,W,D,
        fence:[[0,0],[leg,0],[leg,notch],[W,notch],[W,D],[0,D]]
      };
    }
    g=g||envelope(units);
    if(!valid(g)) return null;
    return fitRack(g,sides);
  }

  function pickGate(g) {
    const candidates=[];
    for(let i=0;i<g.fence.length;i++) {
      const a=g.fence[i],b=g.fence[(i+1)%g.fence.length];
      const vertical=Math.abs(a[0]-b[0])<E;
      const side=vertical?(b[1]>a[1]?'E':'W'):
        (b[0]>a[0]?'S':'N');
      const axis=vertical?1:0;
      const lo=Math.min(a[axis],b[axis]),hi=Math.max(a[axis],b[axis]);
      if(hi-lo<12-E) continue;
      const center=vertical?g.rack.y+3:g.rack.x+3;
      for(const from of unique([
        lo,hi-12,Math.max(lo,Math.min(hi-12,center-6))
      ])) {
        const p=vertical?[a[0],from]:[from,a[1]];
        const q=vertical?[a[0],from+12]:[from+12,a[1]];
        const r=g.rack;
        const onRack=vertical?
          (Math.abs(a[0]-r.x)<E||Math.abs(a[0]-r.x-r.w)<E):
          (Math.abs(a[1]-r.y)<E||Math.abs(a[1]-r.y-r.h)<E);
        const rlo=vertical?r.y:r.x,rhi=rlo+(vertical?r.h:r.w);
        if(onRack&&from<rhi-E&&from+12>rlo+E) continue;
        const dist=
          Math.abs((p[0]+q[0])/2-(r.x+r.w/2))+
          Math.abs((p[1]+q[1])/2-(r.y+r.h/2));
        candidates.push({side,from,len:12,dist});
      }
    }
    candidates.sort((a,b)=>a.dist-b.dist);
    if(!candidates.length) return null;
    const {side,from,len}=candidates[0];
    return {side,from,len};
  }

  function wire(g) {
    const u=g.units,r=g.rack,f=g.family,obstacles=u.concat(r);
    const xmin=Math.min(...u.map(a=>a.x));
    const xmax=Math.max(...u.map(a=>a.x+a.w));
    const ymin=Math.min(...u.map(a=>a.y));
    const ymax=Math.max(...u.map(a=>a.y+a.h));
    let main;
    if(f==='D'||(f==='V'&&u.length>1)) {
      const x=xmin+L+.5;
      main=[[x,ymin+.3],[x,ymax-.3]];
    } else if(g.fence.length===6) {
      const leg=g.fence[1][0],notch=g.fence[2][1];
      main=[
        [leg-2,ymin+.3],[leg-2,notch+2],[xmax-.3,notch+2]
      ];
    } else {
      const y=f==='C'||f==='CS'?ymin+L+2:
        f==='CF'?ymin+L+2:
        f==='B'?ymin+U+.5:
        f==='BB'?ymin+2*U+3:ymin-2;
      main=[[xmin+.3,y],[xmax-.3,y]];
    }
    main=main.filter(p=>inside(p,g.fence)&&!obstacles.some(r=>
      p[0]>r.x+E&&p[0]<r.x+r.w-E&&
      p[1]>r.y+E&&p[1]<r.y+r.h-E));
    if(!main.length) main=[[xmin-.25,ymin-.25]];
    const port=r.side==='S'?[r.x+3,r.y+1]:
      r.side==='N'?[r.x+3,r.y]:
      r.side==='E'?[r.x,r.y+3]:[r.x+1,r.y+3];
    let trunk=[port];
    for(const p of main) {
      trunk=trunk.concat(
        route(trunk[trunk.length-1],[p],g.fence,obstacles).slice(1)
      );
    }
    g.trunk=simplify(trunk);
    g.branches=u.map(a=>({
      unit:a.id,
      path:route(
        a.stub,g.trunk,g.fence,u.filter(b=>b!==a).concat(r)
      ).reverse()
    }));
    return g;
  }

  function finish(g,f,n,code,rotation=0) {
    g.units=g.units.map((u,i)=>unit(u.x,u.y,u.control,i+1));
    g.zones=zonesOf(g.units);
    if(!valid(g)||
      !rectInside(g.rack,g.fence)||
      !rectInside(g.rackWork,g.fence)||
      g.units.some(u=>overlap(u,g.rack)||overlap(u,g.rackWork))||
      (!g.rack.inZone&&g.zones.some(z=>overlap(z,g.rack)))) return null;
    const gate=pickGate(g);
    if(!gate) return null;
    const out={
      code,family:f,unitCount:n,W:g.W,D:g.D,sf:area(g.fence),
      fence:g.fence,units:g.units,zones:g.zones,
      rack:g.rack,rackWork:g.rackWork,gate,trunk:[],branches:[],
      notes:f==='CS'?
        'Catalog exception: 3 ft rack work; rack overlaps access zone. Engineer/inspector acceptance required.':
        'Rule-generated planning layout; 42 in zones, 4 ft access gaps, 1 ft backs, 2 ft back-to-fence. Engineer sets final design.'
    };
    return rotate(wire(out),rotation);
  }

  function rotate(g,degrees=0) {
    if(![0,90,180,270].includes(degrees)) {
      throw new RangeError('Invalid rotation');
    }
    let a=JSON.parse(JSON.stringify(g));
    for(let q=0;q<degrees/90;q++) {
      const D=a.D,point=p=>[D-p[1],p[0]];
      const side=s=>({S:'E',E:'N',N:'W',W:'S'})[s];
      const rr=r=>({...r,x:D-r.y-r.h,y:r.x,w:r.h,h:r.w});
      const gate=a.gate,oldSpan='NS'.includes(gate.side)?a.W:a.D;
      a.gate={
        side:side(gate.side),
        from:Math.max(0,'EW'.includes(gate.side)?
          oldSpan-gate.from-12:gate.from),
        len:12
      };
      a.units=a.units.map(u=>({
        ...rr(u),control:side(u.control),
        access:side(u.access),stub:point(u.stub)
      }));
      a.zones=a.zones.map(rr);
      a.rack={...rr(a.rack),side:side(a.rack.side)};
      a.rackWork=rr(a.rackWork);
      a.fence=a.fence.map(point);
      a.trunk=a.trunk.map(point);
      a.branches=a.branches.map(b=>({...b,path:b.path.map(point)}));
      [a.W,a.D]=[a.D,a.W];
    }
    if(degrees) a.code+='-R'+degrees;
    return a;
  }

  function gen(f,n,o={}) {
    const reject=msg=>{
      gen.lastReason=msg;
      if(o.onReject) o.onReject(msg);
      return null;
    };
    const why=reason(f,n,o);
    if(why) return reject(why);
    if(f==='grid') return grid(n,o);
    const g=buildBase(f,n,o);
    if(!g) return reject('No legal '+f+' geometry for this count/split.');
    const code=n+'-'+(o.variant==='BB2'?'BB2':f);
    const out=finish(g,f==='BB2'?'BB':f,n,code,o.rotation||0);
    if(!out) {
      return reject(
        'Equipment clearance or unobstructed 12 ft gate requirement failed.'
      );
    }
    gen.lastReason=null;
    return out;
  }

  // Equal W/D alone would erase orientations and CF/BB alternatives.
  // IDs, family labels, gate location and conduit paths are not footprint keys.
  function footprint(g) {
    const r=v=>Math.round(v*1e6)/1e6;
    const rectKey=a=>[a.x,a.y,a.w,a.h].map(r).join(',');
    return [
      g.unitCount,
      g.fence.map(p=>p.map(r).join(',')).sort().join(';'),
      g.units.map(u=>rectKey(u)+u.control).sort().join(';'),
      rectKey(g.rack),g.rack.side,g.rack.inZone
    ].join('|');
  }

  function dedupe(a) {
    const seen=new Set();
    return a.filter(g=>{
      const k=footprint(g);
      if(seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function variants(f,n) {
    if(reason(f,n)) return [];
    let opts=[{}];
    if(['C','CF','BB','L','LF','LFB'].includes(f)) {
      opts=[{},...Array.from({length:n-1},(_,i)=>({split:i+1}))];
    }
    if(f==='AF'&&n%2) opts.push({west:true});
    if(f==='BB') {
      for(let c=1;c<=n;c++) {
        if(n>4*c&&n<=5*c) opts.push({variant:'BB2',columns:c});
      }
    }
    const out=[];
    for(const [i,o] of opts.entries()) {
      const g=gen(f,n,o);
      if(!g) continue;
      if(i&&o.variant!=='BB2') g.code+='-V'+i;
      for(const d of [0,90,180,270]) out.push(rotate(g,d));
    }
    return dedupe(out);
  }

  function grid(n,o={}) {
    if(!Number.isInteger(n)||n<1||n>10) {
      throw new RangeError('Unit count must be 1..10');
    }
    if(o.rotation!==undefined&&![0,90,180,270].includes(o.rotation)) {
      throw new RangeError('Invalid rotation');
    }
    const out=[];
    for(let cols=1;cols<=n;cols++) {
      const rows=Math.ceil(n/cols);
      if(o.rows!==undefined&&o.rows!==rows||
        o.columns!==undefined&&o.columns!==cols) continue;
      for(const paired of [false,true]) {
        if(o.paired!==undefined&&o.paired!==paired) continue;
        const us=[];
        // Paired W/E rows: 1 ft backs, then 4 ft access.
        // Unpaired W rows: 4 ft between access and back faces.
        for(let i=0;i<n;i++) {
          const row=Math.floor(i/cols);
          const y=paired?
            row*U+Math.floor(row/2)*5+row%2:
            row*(U+4);
          us.push(unit(
            (i%cols)*(L+4),y,paired&&row%2?'E':'W',i+1
          ));
        }
        const base=envelope(us);
        if(!valid(base)) continue;
        const g=fitRack(base);
        if(!g) continue;
        const built=finish(
          g,'grid',n,n+'-grid-'+rows+'x'+cols+'-'+(paired?'BB':'plain')
        );
        if(!built) continue;
        for(const d of [0,90,180,270]) {
          if(o.rotation===undefined||o.rotation===d) {
            out.push(rotate(built,d));
          }
        }
      }
    }
    return dedupe(out);
  }

  function all(maxUnits=10) {
    if(!Number.isInteger(maxUnits)||maxUnits<1||maxUnits>10) {
      throw new RangeError('maxUnits must be 1..10');
    }
    const out=[];
    for(let n=1;n<=maxUnits;n++) {
      for(const f of families) out.push(...variants(f,n));
      out.push(...grid(n));
    }
    return dedupe(out).sort((a,b)=>
      a.unitCount-b.unitCount||a.sf-b.sf||a.code.localeCompare(b.code));
  }

  return {
    UNIT:Object.freeze({W:U,L}),ZONE,families,
    gen,reason,variants,grid,rotate,footprint,all
  };
});
