/* LUX Rev 3. Feet; SW origin; implicit closing fence edge; CCW vertices.
 * Source JSON actually contains 40 records. Preserve its order and all records.
 * `units` is the array; `unitCount` resolves the duplicate key in the API sketch.
 * Geometry uses exact 44.8/12, not the rounded public UNIT.W display constant.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BESS = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const UNIT = Object.freeze({W: 3.7333, L: 7.775, H: 6.3375});
  const ZONE = 3.5, U = 44.8 / 12, L = UNIT.L, E = 1e-8;
  const ACCESS = {S: 'E', N: 'W', W: 'S', E: 'N'};
  const catalog = [
    {"code":"4-CS","family":"CS","units":4,"arrangement_words":"2 north + 2 south; south row shifted 2 ft E","fence_W_ft":17.47,"fence_D_ft":23.55,"sf":411.34,"min_depth_ft":17.47,"fits_18ft_stall":true,"rack_side":"E in zone","sides_at_4ft":"N row E; S row W; shared center aisle","sides_at_BACK":"N, S; other ends","shared_aisle":"y","notes":"Shared 4 ft center working space. Rack inside BESS-2 side zone per LUX layout choice. Leaves 3'-0\" rack to unit: under Viridi 42 in and NEC 110.26 3'-6\" (480 V facing grounded equipment). Engineer / inspector to accept, or add 6 in east (see 4-C)."},
    {"code":"4-C","family":"C","units":4,"arrangement_words":"2 north + 2 south; south row shifted 2 ft E","fence_W_ft":17.97,"fence_D_ft":23.55,"sf":423.12,"min_depth_ft":17.97,"fits_18ft_stall":true,"rack_side":"E","sides_at_4ft":"N row E; S row W; shared center aisle","sides_at_BACK":"N, S; other ends","shared_aisle":"y","notes":"Shared 4 ft center working space."},
    {"code":"4-CF","family":"CF","units":4,"arrangement_words":"2 north + 2 south; shared 4 ft center aisle","fence_W_ft":15.47,"fence_D_ft":28.05,"sf":433.84,"min_depth_ft":15.47,"fits_18ft_stall":true,"rack_side":"S","sides_at_4ft":"control-end fronts and backs; access sides","sides_at_BACK":"other long faces","shared_aisle":"y","notes":"Outer long backs at 2 ft; an odd single needs 4 ft on its access side. Base N/S offsets 4 ft. Shared 4 ft access and center aisles. Rack adds 0'-6\" at S."},
    {"code":"4-AF","family":"AF","units":4,"arrangement_words":"4 vertical units; shared 4 ft access gaps, 1 ft between backs; outer long backs at 2 ft","fence_W_ft":27.93,"fence_D_ft":16.28,"sf":454.62,"min_depth_ft":16.28,"fits_18ft_stall":true,"rack_side":"S","sides_at_4ft":"control-end fronts and backs; access sides","sides_at_BACK":"other long faces","shared_aisle":"y","notes":"Controls alternate S/N. Base N/S offsets 4 ft; rack on south fence behind a north-control unit. Rack adds 0'-6\" at S."},
    {"code":"4-A","family":"A","units":4,"arrangement_words":"4 vertical units in one row; controls S, access E","fence_W_ft":33.43,"fence_D_ft":13.78,"sf":460.54,"min_depth_ft":13.78,"fits_18ft_stall":true,"rack_side":"E","sides_at_4ft":"S, E","sides_at_BACK":"N, W","shared_aisle":"n","notes":"Every unit has the same rotation."},
    {"code":"4-B","family":"B","units":4,"arrangement_words":"2 back-to-back pairs along a strip","fence_W_ft":28.05,"fence_D_ft":16.47,"sf":461.89,"min_depth_ft":16.47,"fits_18ft_stall":true,"rack_side":"E","sides_at_4ft":"N, S, E, W","sides_at_BACK":"none","shared_aisle":"n","notes":"North controls E, access N; south controls W, access S."},
    {"code":"4-V","family":"V","units":4,"arrangement_words":"4 units; couple, east only, west only, repeating from north","fence_W_ft":24.55,"fence_D_ft":19.2,"sf":471.36,"min_depth_ft":19.2,"fits_18ft_stall":false,"rack_side":"E","sides_at_4ft":"zone faces","sides_at_BACK":"other faces","shared_aisle":"y","notes":"Pearl pattern; 1 ft row gaps used here, about 6 in in Viridi's image. Zones overlap only in empty cells or outside the unit grid."},
    {"code":"4-D","family":"D","units":4,"arrangement_words":"2 horizontal couples stacked N-S","fence_W_ft":25.05,"fence_D_ft":19.47,"sf":487.64,"min_depth_ft":19.47,"fits_18ft_stall":false,"rack_side":"E","sides_at_4ft":"N, S, E, W","sides_at_BACK":"none","shared_aisle":"n","notes":"Non-control ends meet across the 1 ft couple gap."},
    {"code":"6-CS","family":"CS","units":6,"arrangement_words":"3 north + 3 south; south row shifted 2 ft E","fence_W_ft":25.2,"fence_D_ft":23.55,"sf":593.46,"min_depth_ft":23.55,"fits_18ft_stall":false,"rack_side":"E in zone","sides_at_4ft":"N row E; S row W; shared center aisle","sides_at_BACK":"N, S; other ends","shared_aisle":"y","notes":"Shared 4 ft center working space. Rack inside BESS-3 side zone per LUX layout choice. Leaves 3'-0\" rack to unit: under Viridi 42 in and NEC 110.26 3'-6\" (480 V facing grounded equipment). Engineer / inspector to accept, or add 6 in east (see 6-C)."},
    {"code":"6-C","family":"C","units":6,"arrangement_words":"3 north + 3 south; south row shifted 2 ft E","fence_W_ft":25.7,"fence_D_ft":23.55,"sf":605.24,"min_depth_ft":23.55,"fits_18ft_stall":false,"rack_side":"E","sides_at_4ft":"N row E; S row W; shared center aisle","sides_at_BACK":"N, S; other ends","shared_aisle":"y","notes":"Shared 4 ft center working space."},
    {"code":"6-CF","family":"CF","units":6,"arrangement_words":"3 north + 3 south; shared 4 ft center aisle","fence_W_ft":22.2,"fence_D_ft":28.05,"sf":622.71,"min_depth_ft":22.2,"fits_18ft_stall":false,"rack_side":"S","sides_at_4ft":"control-end fronts and backs; access sides","sides_at_BACK":"other long faces","shared_aisle":"y","notes":"Outer long backs at 2 ft; an odd single needs 4 ft on its access side. Base N/S offsets 4 ft. Shared 4 ft access and center aisles. Rack adds 0'-6\" at S."},
    {"code":"6-V","family":"V","units":6,"arrangement_words":"6 units; couple, east only, west only, repeating from north","fence_W_ft":24.55,"fence_D_ft":26.43,"sf":648.94,"min_depth_ft":24.55,"fits_18ft_stall":false,"rack_side":"S","sides_at_4ft":"zone faces","sides_at_BACK":"other faces","shared_aisle":"y","notes":"Pearl pattern; 1 ft row gaps used here, about 6 in in Viridi's image. Zones overlap only in empty cells or outside the unit grid."},
    {"code":"6-B","family":"B","units":6,"arrangement_words":"3 back-to-back pairs along a strip","fence_W_ft":39.83,"fence_D_ft":16.47,"sf":655.79,"min_depth_ft":16.47,"fits_18ft_stall":true,"rack_side":"E","sides_at_4ft":"N, S, E, W","sides_at_BACK":"none","shared_aisle":"n","notes":"North controls E, access N; south controls W, access S."},
    {"code":"6-AF","family":"AF","units":6,"arrangement_words":"6 vertical units; shared 4 ft access gaps, 1 ft between backs; outer long backs at 2 ft","fence_W_ft":40.4,"fence_D_ft":16.28,"sf":657.51,"min_depth_ft":16.28,"fits_18ft_stall":true,"rack_side":"S","sides_at_4ft":"control-end fronts and backs; access sides","sides_at_BACK":"other long faces","shared_aisle":"y","notes":"Controls alternate S/N. Base N/S offsets 4 ft; rack on south fence behind a north-control unit. Rack adds 0'-6\" at S."},
    {"code":"6-A","family":"A","units":6,"arrangement_words":"6 vertical units in one row; controls S, access E","fence_W_ft":48.9,"fence_D_ft":13.78,"sf":673.6,"min_depth_ft":13.78,"fits_18ft_stall":true,"rack_side":"E","sides_at_4ft":"S, E","sides_at_BACK":"N, W","shared_aisle":"n","notes":"Every unit has the same rotation."},
    {"code":"6-D","family":"D","units":6,"arrangement_words":"3 horizontal couples stacked N-S","fence_W_ft":24.55,"fence_D_ft":27.7,"sf":680.04,"min_depth_ft":24.55,"fits_18ft_stall":false,"rack_side":"S","sides_at_4ft":"N, S, E, W","sides_at_BACK":"none","shared_aisle":"n","notes":"Non-control ends meet across the 1 ft couple gap."},
    {"code":"7-V","family":"V","units":7,"arrangement_words":"7 units; couple, east only, west only, repeating from north","fence_W_ft":24.55,"fence_D_ft":30.67,"sf":752.87,"min_depth_ft":24.55,"fits_18ft_stall":false,"rack_side":"S","sides_at_4ft":"zone faces","sides_at_BACK":"other faces","shared_aisle":"y","notes":"Pearl pattern; 1 ft row gaps used here, about 6 in in Viridi's image. Zones overlap only in empty cells or outside the unit grid."},
    {"code":"8-CF","family":"CF","units":8,"arrangement_words":"4 north + 4 south; shared 4 ft center aisle","fence_W_ft":27.93,"fence_D_ft":28.05,"sf":783.53,"min_depth_ft":27.93,"fits_18ft_stall":false,"rack_side":"S","sides_at_4ft":"control-end fronts and backs; access sides","sides_at_BACK":"other long faces","shared_aisle":"y","notes":"Outer long backs at 2 ft; an odd single needs 4 ft on its access side. Base N/S offsets 4 ft. Shared 4 ft access and center aisles. Rack adds 0'-6\" at S."},
    {"code":"8-C","family":"C","units":8,"arrangement_words":"4 north + 4 south; south row shifted 2 ft E","fence_W_ft":33.43,"fence_D_ft":23.55,"sf":787.36,"min_depth_ft":23.55,"fits_18ft_stall":false,"rack_side":"E","sides_at_4ft":"N row E; S row W; shared center aisle","sides_at_BACK":"N, S; other ends","shared_aisle":"y","notes":"Shared 4 ft center working space."},
    {"code":"8-BB","family":"BB","units":8,"arrangement_words":"2 + 2 back-to-back pairs in two lines","fence_W_ft":27.55,"fence_D_ft":29.43,"sf":810.89,"min_depth_ft":27.55,"fits_18ft_stall":false,"rack_side":"S","sides_at_4ft":"zone faces","sides_at_BACK":"other faces","shared_aisle":"y","notes":"Facing side zones share one 4 ft working aisle."},
    {"code":"8-V","family":"V","units":8,"arrangement_words":"8 units; couple, east only, west only, repeating from north","fence_W_ft":24.55,"fence_D_ft":33.4,"sf":819.97,"min_depth_ft":24.55,"fits_18ft_stall":false,"rack_side":"E","sides_at_4ft":"zone faces","sides_at_BACK":"other faces","shared_aisle":"y","notes":"Pearl pattern; 1 ft row gaps used here, about 6 in in Viridi's image. Zones overlap only in empty cells or outside the unit grid."},
    {"code":"8-B","family":"B","units":8,"arrangement_words":"4 back-to-back pairs along a strip","fence_W_ft":51.6,"fence_D_ft":16.47,"sf":849.68,"min_depth_ft":16.47,"fits_18ft_stall":true,"rack_side":"E","sides_at_4ft":"N, S, E, W","sides_at_BACK":"none","shared_aisle":"n","notes":"North controls E, access N; south controls W, access S."},
    {"code":"8-LFB","family":"LF","units":8,"arrangement_words":"2 horizontal-arm + 2 rotated-arm B pairs","fence_W_ft":28.05,"fence_D_ft":40.02,"sf":849.68,"min_depth_ft":28.05,"fits_18ft_stall":false,"rack_side":"E","sides_at_4ft":"zone faces","sides_at_BACK":"other faces","shared_aisle":"y","notes":"B-line alternative; shared 4 ft corner. Check the actual L polygon."},
    {"code":"8-LF","family":"LF","units":8,"arrangement_words":"4 top-arm + 4 side-arm; paired backs 1 ft apart","fence_W_ft":29.43,"fence_D_ft":40.71,"sf":857.63,"min_depth_ft":29.43,"fits_18ft_stall":false,"rack_side":"E","sides_at_4ft":"control-end fronts and backs; access sides","sides_at_BACK":"other long faces","shared_aisle":"y","notes":"Both arm envelopes are 15 ft 9.3 in deep; shared 4 ft corner working space."},
    {"code":"8-AF","family":"AF","units":8,"arrangement_words":"8 vertical units; shared 4 ft access gaps, 1 ft between backs; outer long backs at 2 ft","fence_W_ft":52.87,"fence_D_ft":16.28,"sf":860.41,"min_depth_ft":16.28,"fits_18ft_stall":true,"rack_side":"S","sides_at_4ft":"control-end fronts and backs; access sides","sides_at_BACK":"other long faces","shared_aisle":"y","notes":"Controls alternate S/N. Base N/S offsets 4 ft; rack on south fence behind a north-control unit. Rack adds 0'-6\" at S."},
    {"code":"8-D","family":"D","units":8,"arrangement_words":"4 horizontal couples stacked N-S","fence_W_ft":24.55,"fence_D_ft":35.43,"sf":869.89,"min_depth_ft":24.55,"fits_18ft_stall":false,"rack_side":"S","sides_at_4ft":"N, S, E, W","sides_at_BACK":"none","shared_aisle":"n","notes":"Non-control ends meet across the 1 ft couple gap."},
    {"code":"8-A","family":"A","units":8,"arrangement_words":"8 vertical units in one row; controls S, access E","fence_W_ft":64.37,"fence_D_ft":13.78,"sf":886.65,"min_depth_ft":13.78,"fits_18ft_stall":true,"rack_side":"E","sides_at_4ft":"S, E","sides_at_BACK":"N, W","shared_aisle":"n","notes":"Every unit has the same rotation."},
    {"code":"8-L","family":"L","units":8,"arrangement_words":"4 top-arm vertical + 4 side-arm horizontal","fence_W_ft":32.93,"fence_D_ft":46.71,"sf":907.31,"min_depth_ft":32.93,"fits_18ft_stall":false,"rack_side":"W","sides_at_4ft":"E ends; both inner arm edges","sides_at_BACK":"W, outer N, outer S","shared_aisle":"n","notes":"Original 8 ft corner gap retained. Area is the actual L polygon."},
    {"code":"10-BB2","family":"BB","units":10,"arrangement_words":"2 + 2 back-to-back pairs, then 2 south-access singles","fence_W_ft":27.55,"fence_D_ft":35.17,"sf":968.84,"min_depth_ft":27.55,"fits_18ft_stall":false,"rack_side":"S","sides_at_4ft":"zone faces","sides_at_BACK":"other faces","shared_aisle":"y","notes":"Bottom-to-top, west-to-east numbering. Top singles share a 4 ft access aisle with the line below; their north backs are 2 ft from the battery envelope. Rack adds 0'-6\" at S."},
    {"code":"10-CF","family":"CF","units":10,"arrangement_words":"5 north + 5 south; shared 4 ft center aisle","fence_W_ft":35.17,"fence_D_ft":27.55,"sf":968.84,"min_depth_ft":27.55,"fits_18ft_stall":false,"rack_side":"W","sides_at_4ft":"control-end fronts and backs; access sides","sides_at_BACK":"other long faces","shared_aisle":"y","notes":"Outer long backs at 2 ft; an odd single needs 4 ft on its access side. Base N/S offsets 4 ft. Shared 4 ft access and center aisles. Rack adds 0'-6\" at W."},
    {"code":"10-C","family":"C","units":10,"arrangement_words":"5 north + 5 south; south row shifted 2 ft E","fence_W_ft":41.17,"fence_D_ft":23.55,"sf":969.48,"min_depth_ft":23.55,"fits_18ft_stall":false,"rack_side":"E","sides_at_4ft":"N row E; S row W; shared center aisle","sides_at_BACK":"N, S; other ends","shared_aisle":"y","notes":"Shared 4 ft center working space."},
    {"code":"10-V","family":"V","units":10,"arrangement_words":"10 units; couple, east only, west only, repeating from north","fence_W_ft":24.55,"fence_D_ft":40.63,"sf":997.55,"min_depth_ft":24.55,"fits_18ft_stall":false,"rack_side":"S","sides_at_4ft":"zone faces","sides_at_BACK":"other faces","shared_aisle":"y","notes":"Pearl pattern; 1 ft row gaps used here, about 6 in in Viridi's image. Zones overlap only in empty cells or outside the unit grid."},
    {"code":"10-B","family":"B","units":10,"arrangement_words":"5 back-to-back pairs along a strip","fence_W_ft":63.38,"fence_D_ft":16.47,"sf":1043.58,"min_depth_ft":16.47,"fits_18ft_stall":true,"rack_side":"E","sides_at_4ft":"N, S, E, W","sides_at_BACK":"none","shared_aisle":"n","notes":"North controls E, access N; south controls W, access S."},
    {"code":"10-LFB","family":"LF","units":10,"arrangement_words":"3 horizontal-arm + 2 rotated-arm B pairs","fence_W_ft":39.83,"fence_D_ft":40.02,"sf":1043.58,"min_depth_ft":39.83,"fits_18ft_stall":false,"rack_side":"E","sides_at_4ft":"zone faces","sides_at_BACK":"other faces","shared_aisle":"y","notes":"B-line alternative; shared 4 ft corner. Check the actual L polygon."},
    {"code":"10-LF","family":"LF","units":10,"arrangement_words":"6 top-arm + 4 side-arm; paired backs 1 ft apart","fence_W_ft":41.9,"fence_D_ft":40.71,"sf":1054.3,"min_depth_ft":40.71,"fits_18ft_stall":false,"rack_side":"E","sides_at_4ft":"control-end fronts and backs; access sides","sides_at_BACK":"other long faces","shared_aisle":"y","notes":"Both arm envelopes are 15 ft 9.3 in deep; shared 4 ft corner working space."},
    {"code":"10-D","family":"D","units":10,"arrangement_words":"5 horizontal couples stacked N-S","fence_W_ft":24.55,"fence_D_ft":43.17,"sf":1059.74,"min_depth_ft":24.55,"fits_18ft_stall":false,"rack_side":"S","sides_at_4ft":"N, S, E, W","sides_at_BACK":"none","shared_aisle":"n","notes":"Non-control ends meet across the 1 ft couple gap."},
    {"code":"10-AF","family":"AF","units":10,"arrangement_words":"10 vertical units; shared 4 ft access gaps, 1 ft between backs; outer long backs at 2 ft","fence_W_ft":65.33,"fence_D_ft":16.28,"sf":1063.3,"min_depth_ft":16.28,"fits_18ft_stall":true,"rack_side":"S","sides_at_4ft":"control-end fronts and backs; access sides","sides_at_BACK":"other long faces","shared_aisle":"y","notes":"Controls alternate S/N. Base N/S offsets 4 ft; rack on south fence behind a north-control unit. Rack adds 0'-6\" at S."},
    {"code":"10-A","family":"A","units":10,"arrangement_words":"10 vertical units in one row; controls S, access E","fence_W_ft":79.83,"fence_D_ft":13.78,"sf":1099.7,"min_depth_ft":13.78,"fits_18ft_stall":true,"rack_side":"E","sides_at_4ft":"S, E","sides_at_BACK":"N, W","shared_aisle":"n","notes":"Every unit has the same rotation."},
    {"code":"10-L","family":"L","units":10,"arrangement_words":"6 top-arm vertical + 4 side-arm horizontal","fence_W_ft":48.4,"fence_D_ft":46.71,"sf":1120.37,"min_depth_ft":46.71,"fits_18ft_stall":false,"rack_side":"W","sides_at_4ft":"E ends; both inner arm edges","sides_at_BACK":"W, outer N, outer S","shared_aisle":"n","notes":"Original 8 ft corner gap retained. Area is the actual L polygon."},
    {"code":"10-BB","family":"BB","units":10,"arrangement_words":"3 + 2 back-to-back pairs in two lines","fence_W_ft":39.33,"fence_D_ft":28.93,"sf":1137.8,"min_depth_ft":28.93,"fits_18ft_stall":false,"rack_side":"E","sides_at_4ft":"zone faces","sides_at_BACK":"other faces","shared_aisle":"y","notes":"Facing side zones share one 4 ft working aisle."}
  ];
  const codes = catalog.map(c => c.code);
  const rect = (x, y, w, h) => ({x, y, w, h});
  const same = (a, b) => Math.abs(a[0]-b[0]) < E && Math.abs(a[1]-b[1]) < E;
  const area = p => p.reduce((s, a, i) => {
    const b = p[(i+1)%p.length]; return s+a[0]*b[1]-b[0]*a[1];
  }, 0) / 2;

  function onSegment(p, a, b) {
    return Math.abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0])) < E &&
      p[0] >= Math.min(a[0],b[0])-E && p[0] <= Math.max(a[0],b[0])+E &&
      p[1] >= Math.min(a[1],b[1])-E && p[1] <= Math.max(a[1],b[1])+E;
  }

  function inside(p, polygon) {
    let yes = false;
    for (let i=0, j=polygon.length-1; i<polygon.length; j=i++) {
      const a=polygon[j], b=polygon[i];
      if (onSegment(p,a,b)) return true;
      if ((a[1]>p[1]) !== (b[1]>p[1]) &&
          p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) yes=!yes;
    }
    return yes;
  }

  function hits(a, b, r) {
    if (Math.abs(a[0]-b[0]) < E) return a[0]>r.x+E && a[0]<r.x+r.w-E &&
      Math.max(a[1],b[1])>r.y+E && Math.min(a[1],b[1])<r.y+r.h-E;
    return a[1]>r.y+E && a[1]<r.y+r.h-E &&
      Math.max(a[0],b[0])>r.x+E && Math.min(a[0],b[0])<r.x+r.w-E;
  }

  function simplify(points) {
    const out=[];
    for (const p of points) {
      if (out.length && same(p,out[out.length-1])) continue;
      while (out.length>1 && onSegment(out[out.length-1],out[out.length-2],p)) out.pop();
      out.push(p.slice());
    }
    return out;
  }

  // Orthogonal visibility-grid shortest path. Other pads and the rack are solid;
  // a branch may traverse its own pad. Coordinates include every fence corner,
  // obstacle edge, clearance lane, source, and trunk projection (no raster grid).
  function route(start, network, fence, obstacles) {
    const xs=[start[0]], ys=[start[1]];
    for (const p of fence.concat(network)) { xs.push(p[0]); ys.push(p[1]); }
    for (const r of obstacles) {
      xs.push(r.x-.125,r.x,r.x+r.w,r.x+r.w+.125);
      ys.push(r.y-.125,r.y,r.y+r.h,r.y+r.h+.125);
    }
    const unique = a => a.sort((a,b)=>a-b).filter((v,i,a)=>!i || v-a[i-1]>E);
    const X=unique(xs), Y=unique(ys), nx=X.length, size=nx*Y.length;
    const point = id => [X[id%nx],Y[Math.floor(id/nx)]];
    const valid = new Uint8Array(size), goal = new Uint8Array(size);

    for (let id=0; id<size; id++) {
      const p=point(id);
      valid[id]=inside(p,fence) && !obstacles.some(r=>
        p[0]>r.x+E && p[0]<r.x+r.w-E && p[1]>r.y+E && p[1]<r.y+r.h-E);
      goal[id]=network.length===1 ? same(p,network[0]) :
        network.slice(1).some((b,i)=>onSegment(p,network[i],b));
    }

    const source=X.findIndex(v=>Math.abs(v-start[0])<E)+
      nx*Y.findIndex(v=>Math.abs(v-start[1])<E);
    const dist=new Float64Array(size).fill(Infinity);
    const prev=new Int32Array(size).fill(-1), heap=[];

    function push(item) {
      let i=heap.length; heap.push(item);
      while(i) {
        const p=(i-1)>>1;
        if(heap[p][0]<=item[0]) break;
        heap[i]=heap[p]; i=p;
      }
      heap[i]=item;
    }

    function pop() {
      const first=heap[0], last=heap.pop();
      if(heap.length) {
        let i=0;
        while(2*i+1<heap.length) {
          let c=2*i+1;
          if(c+1<heap.length && heap[c+1][0]<heap[c][0]) c++;
          if(heap[c][0]>=last[0]) break;
          heap[i]=heap[c]; i=c;
        }
        heap[i]=last;
      }
      return first;
    }

    dist[source]=0; push([0,source]);
    while(heap.length) {
      const [cost,id]=pop();
      if(cost>dist[id]+E) continue;
      if(goal[id]) {
        const path=[];
        for(let i=id;i!==-1;i=prev[i]) path.push(point(i));
        return simplify(path.reverse());
      }

      const a=point(id), col=id%nx, row=Math.floor(id/nx);
      const next=[];
      if(col) next.push(id-1);
      if(col+1<nx) next.push(id+1);
      if(row) next.push(id-nx);
      if(row+1<Y.length) next.push(id+nx);

      for(const k of next) {
        if(!valid[k]) continue;
        const b=point(k), mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
        if(!inside(mid,fence) || obstacles.some(r=>hits(a,b,r))) continue;
        const d=cost+Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
        if(d+E<dist[k]) {
          dist[k]=d; prev[k]=id; push([d,k]);
        }
      }
    }
    throw new Error('No conduit route from '+JSON.stringify(start));
  }

  function build(code) {
    const c=catalog.find(c=>c.code===code);
    if(!c) throw new RangeError('Unknown BESS layout: '+code);

    const n=c.units, f=c.family, units=[], zones=[];
    let W,D,leg,notch,rackY=0,rackX,main;
    let side=c.rack_side[0], gateSide='N', gateFrom;

    function add(x,y,control) {
      const vertical=control==='N'||control==='S';
      const w=vertical?U:L, h=vertical?L:U, t=8/12;
      const stub={
        S:[x+w-t,y+t],
        N:[x+t,y+h-t],
        W:[x+t,y+t],
        E:[x+w-t,y+h-t]
      }[control];
      const u={id:units.length+1,x,y,w,h,control,access:ACCESS[control],stub};
      units.push(u);

      function zone(s,kind) {
        const r={
          S:rect(x,y-ZONE,w,ZONE),
          N:rect(x,y+h,w,ZONE),
          W:rect(x-ZONE,y,ZONE,h),
          E:rect(x+w,y,ZONE,h)
        }[s];
        zones.push({unit:u.id,kind,...r});
      }
      zone(control,'control');
      zone(u.access,'access');
    }

    // Alternating 4 ft access gaps / 1 ft back gaps (or the LF reverse).
    function positions(count,start,firstGap) {
      const a=[]; let x=start;
      for(let i=0;i<count;i++) {
        a.push(x);
        x+=U+(i%2 ? 5-firstGap : firstGap);
      }
      return a;
    }

    if(f==='A'||f==='AF') {
      const paired=f==='AF';
      const xs=paired?positions(n,2,4):
        Array.from({length:n},(_,i)=>2+i*(U+4));
      xs.forEach((x,i)=>add(x,paired?4.5:4,paired&&i%2?'N':'S'));
      W=xs[n-1]+U+(paired?2:4.5);
      D=L+(paired?8.5:6);

    } else if(f==='C'||f==='CS') {
      const m=n/2;
      W=2+m*U+(m-1)*4+(f==='CS'?4:4.5);
      D=2*L+8;
      for(let i=0;i<m;i++) add(2+i*(U+4),L+6,'S');
      for(let i=0;i<m;i++) add(4+i*(U+4),2,'N');
      rackY=f==='CS'?L+6+(L-6)/2:L+2;

    } else if(f==='CF') {
      const reverse=n===10;
      const xs=positions(n/2,reverse?4.5:2,reverse?1:4);
      const sy=reverse?4:4.5;
      W=xs[xs.length-1]+U+(reverse||n%4===0?2:4);
      D=sy+2*L+8;
      for(const y of [sy+L+4,sy]) {
        xs.forEach((x,i)=>add(x,y,(i%2===0)!==reverse?'S':'N'));
      }
      if(!reverse) gateSide='W';
      else gateFrom=.25;

    } else if(f==='B'||f==='BB') {
      const bb=f==='BB', extra=code==='10-BB2';
      const sy=bb&&code!=='10-BB'?4.5:4;
      const columns=bb?(code==='10-BB'?3:2):n/2;
      W=8+columns*L+(columns-1)*4+(bb?0:.5);

      if(extra) {
        let y=sy;
        for(let row=0;row<5;row++) {
          for(let col=0;col<2;col++) {
            add(4+col*(L+4),y,row%2?'E':'W');
          }
          y+=U+(row%2?4:1);
        }
        D=sy+5*U+12;
      } else {
        for(let row=0;row<(bb?2:1);row++) {
          const y=sy+row*(2*U+5), cols=bb&&row?2:columns;
          for(let i=0;i<cols;i++) {
            const x=4+i*(L+4);
            add(x,y,'W');
            add(x,y+U+1,'E');
          }
        }
        D=sy+(bb?4*U+6:2*U+1)+4;
      }

      if(bb&&code!=='10-BB') gateSide='W';
      if(code==='10-BB') rackY=4+2*U+1;

    } else if(f==='D') {
      const sy=n===4?4:4.5;
      W=2*L+9+(n===4?.5:0);
      D=sy+(n/2)*U+(n/2-1)*4+4;
      for(let i=0;i<n/2;i++) {
        add(4,sy+i*(U+4),'W');
        add(5+L,sy+i*(U+4),'E');
      }
      if(n!==4) gateSide='W';

    } else if(f==='V') {
      const rows=Math.floor((n-1)*3/4)+1;
      const sy=(n===4||n===8)?2:n===7?4:4.5;
      W=2*L+9;
      D=sy+rows*U+rows-1+4;
      for(let row=0;units.length<n;row++) {
        const y=D-4-U-row*(U+1);
        if(row%3===0) {
          add(4,y,'W');
          add(5+L,y,'E');
        } else if(row%3===1) add(5+L,y,'W');
        else add(4,y,'E');
      }
      if(n!==4) gateSide='W';
      if(n===7) rackX=L-1;

    } else if(f==='L'||f==='LF') {
      if(code.endsWith('LFB')) {
        // INNER LEG=23'-6.6"; top arm depth=16'-5.6".
        leg=8+2*U+1;
        notch=2*(L+4);
        D=notch+leg;
        const cols=(n-4)/2;
        W=8.5+cols*L+(cols-1)*4;

        for(let i=0;i<2;i++) {
          add(5+U,4+i*(L+4),'S');
          add(4,4+i*(L+4),'N');
        }
        for(let i=0;i<cols;i++) {
          add(4+i*(L+4),notch+4,'W');
          add(4+i*(L+4),notch+5+U,'E');
        }
        rackY=notch;
        if(n===8) {
          gateSide='E';
          gateFrom=notch-12.25;
        }
      } else {
        const flipped=f==='LF', m=n-4;
        const xs=flipped?positions(m,4,1):
          positions(m,2,4).map((_,i)=>2+i*(U+4));
        const ys=flipped?positions(4,4,1):
          Array.from({length:4},(_,i)=>2+i*(U+4));

        leg=L+(flipped?8:6);
        notch=ys[3]+U+(flipped?0:4);
        const topY=notch+4;
        D=topY+L+(flipped?4:2);
        W=xs[m-1]+U+(flipped?4.5:4);

        xs.forEach((x,i)=>add(x,topY,flipped&&i%2===0?'N':'S'));
        ys.forEach((y,i)=>add(flipped?4:2,y,flipped&&i%2===0?'W':'E'));
        rackY=flipped?notch:ys[3]+U;
        if(!flipped) {
          gateSide='E';
          gateFrom=notch-12.25;
        }
      }
    } else throw new Error('Unsupported family: '+f);

    const fence=leg?
      [[0,0],[leg,0],[leg,notch],[W,notch],[W,D],[0,D]]:
      [[0,0],[W,0],[W,D],[0,D]];
    const inZone=f==='CS', work=inZone?3:ZONE;
    const rack=side==='S'?
      {...rect(rackX===undefined?W-6:rackX,0,6,1),side,inZone}:
      {...rect(side==='E'?W-1:0,rackY,1,6),side,inZone};
    const rackWork=side==='S'?rect(rack.x,1,6,work):
      side==='E'?rect(rack.x-work,rack.y,work,6):
      rect(1,rack.y,work,6);

    if(gateFrom===undefined) gateFrom=gateSide==='W'?.25:W-12.25;
    const gate={side:gateSide,from:gateFrom,len:12};

    const xmin=Math.min(...units.map(u=>u.x));
    const xmax=Math.max(...units.map(u=>u.x+u.w));
    const ymin=Math.min(...units.map(u=>u.y));
    const ymax=Math.max(...units.map(u=>u.y+u.h));

    if(f==='D'||f==='V') {
      const x=4+L+.5;
      main=[[x,ymin+8/12],[x,ymax-8/12]];
    } else if(code.endsWith('LFB')) {
      const x=4+U+.5, y=notch+4+U+.5;
      main=[[x,4.3],[x,notch+2],[2,notch+2],[2,y],[xmax-.3,y]];
    } else if(leg) {
      const top=units[0].y-2;
      main=[[leg-2,ymin+.3],[leg-2,top],[xmax-.3,top]];
    } else {
      const y=f==='A'?2:f==='AF'?2.5:
        f==='C'||f==='CS'?L+4:
        f==='CF'?ymin+L+2:
        f==='B'?ymin+U+.5:ymin+2*U+3;
      main=[[xmin+.3,y],[xmax-.3,y]];
    }

    const rackPort=side==='S'?[rack.x+3,1]:
      side==='E'?[rack.x,rack.y+3]:[1,rack.y+3];
    const obstacles=units.concat([rack]);
    const connections=[
      route(rackPort,[main[0]],fence,obstacles),
      route(rackPort,[main[main.length-1]],fence,obstacles)
    ];
    const length=p=>p.slice(1).reduce((s,b,i)=>
      s+Math.abs(b[0]-p[i][0])+Math.abs(b[1]-p[i][1]),0);
    const near=length(connections[0])<=length(connections[1])?0:1;
    const trunk=simplify(
      connections[near].concat(near?main.slice().reverse():main)
    );
    const branches=units.map(u=>({
      unit:u.id,
      path:route(
        u.stub,trunk,fence,units.filter(v=>v!==u).concat([rack])
      ).reverse()
    }));

    return {
      code,family:f,unitCount:n,W,D,sf:area(fence),fence,
      units,zones,rack,rackWork,gate,trunk,branches,notes:c.notes
    };
  }

  return {UNIT,ZONE,codes,catalog,build};
});
