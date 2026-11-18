/* catalog_ext.js (Claude, 11/18/26): adds generated yards for 1 to 10 units to the Rev 3 catalog.
   Load after layouts.js and parametric.js, before the planner script.
   - The 40 Rev 3 codes keep their verified catalog geometry (layouts.js).
   - Generated designs come from parametric.js (rule-checked: handedness, no overlaps, zones clear of units and rack).
   - Rotated copies (-R90/-R180/-R270) are dropped: the planner rotates any yard itself. */
(function () {
  if (!window.BESS || !window.BESSP || BESS.__ext) return;
  const baseBuild = BESS.build.bind(BESS), catalogCodes = new Set(BESS.codes);
  const gen = new Map();
  for (const l of BESSP.all(10)) {
    if (/-R(90|180|270)$/.test(l.code) || catalogCodes.has(l.code) || gen.has(l.code)) continue;
    gen.set(l.code, l);
  }
  const fmt = n => Math.round(n * 100) / 100;
  const records = [...gen.values()].map(l => {
    const n = l.units.length, minD = Math.min(l.W, l.D);
    return {
      code: l.code, family: l.family, units: n,
      arrangement_words: (l.notes || '').split('.')[0] || (n + ' units, ' + l.family + ' pattern'),
      fence_W_ft: fmt(l.W), fence_D_ft: fmt(l.D), sf: fmt(l.sf), min_depth_ft: fmt(minD),
      fits_18ft_stall: minD <= 18, rack_side: (l.rack && l.rack.side) || '',
      sides_at_4ft: '', sides_at_BACK: '', shared_aisle: '',
      notes: 'Generated design, not in the Rev 3 catalog. Rule-checked by the planner; confirm with engineering. ' + (l.notes || ''),
      generated: true
    };
  });
  BESS.catalog = BESS.catalog.concat(records).sort((a, b) => a.units - b.units || a.sf - b.sf);
  BESS.codes = BESS.catalog.map(r => r.code);
  BESS.build = function (code) {
    if (gen.has(code)) return JSON.parse(JSON.stringify(gen.get(code)));
    return baseBuild(code);
  };
  BESS.isGenerated = code => gen.has(code);
  BESS.__ext = {generated: records.length, total: BESS.codes.length};
  // Units wanted: every count from 1 to 10.
  const sel = document.getElementById('wanted');
  if (sel) {
    const keep = sel.value;
    sel.innerHTML = '<option value="0">Any unit count</option>' +
      Array.from({length: 10}, (_, i) => `<option value="${i + 1}">${i + 1} unit${i ? 's' : ''}</option>`).join('');
    sel.value = keep;
  }
})();
