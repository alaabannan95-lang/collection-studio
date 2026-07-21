const state = {
  garmentId: GARMENTS[0].id,
  size: null,
  view: 'front', // front | back
  color: null,
  gsm: null,
  fabric: null,
  wash: null,
  refNo: null,
  date: null, // 'YYYY-MM-DD'
  prints: [], // { id, name, src, img, view, x, y, scale, rotation, opacity, color, method }
  selectedPrintId: null,
  seams: {}, // { partId: finishId } for the current garment's silhouette
  tab: 'color',
  measureOverrides: {}, // { garmentId: { rowIndex: { size: value } } } manual measure edits
};

function seamPartsFor(g) {
  return SEAM_PARTS[g.silhouette] || [];
}

function defaultSeams(g) {
  const out = {};
  seamPartsFor(g).forEach(part => { out[part.id] = { on: part.on !== false, finish: part.finish }; });
  return out;
}

// Reads the live state for one construction point, tolerant of the older
// (bare finish-id string) shape in case a saved design carries it.
function seamStateFor(part) {
  const s = state.seams[part.id];
  if (typeof s === 'string') return { on: true, finish: s };
  if (s && typeof s === 'object') return { on: s.on !== false, finish: s.finish || part.finish };
  return { on: part.on !== false, finish: part.finish };
}

function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function getPrint(id) {
  return state.prints.find(p => p.id === id);
}

function selectedPrint() {
  return getPrint(state.selectedPrintId);
}

function currentGarment() {
  return GARMENTS.find(g => g.id === state.garmentId);
}

// Every garment now offers the full range; XS/XXL and any un-sampled middle
// sizes are graded estimates (see gradeRowValues) that Alaa can override.
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
function availableSizes(g) {
  return SIZES;
}

function init() {
  const g = currentGarment();
  state.measureOverrides = loadMeasureOverrides();
  state.size = 'M';
  state.color = g.colorway.hex;
  state.gsm = g.gsm != null ? g.gsm : null;
  state.fabric = g.fabric || FABRICS[0];
  state.wash = g.wash || WASHES[0];
  state.refNo = g.refNo;
  state.date = todayISO();
  state.seams = defaultSeams(g);
  renderGarmentList();
  renderSizeRow();
  renderViewToggle();
  renderTabs();
  renderColorTab();
  renderPrintTab();
  renderMeasureTab();
  renderSeamsTab();
  renderDesignList();
  renderStage();
  bindGlobalControls();
}

function selectGarment(id) {
  state.garmentId = id;
  const g = currentGarment();
  state.size = SIZES.includes(state.size) ? state.size : 'M';
  state.color = g.colorway.hex;
  state.gsm = g.gsm != null ? g.gsm : null;
  state.fabric = g.fabric || FABRICS[0];
  state.wash = g.wash || WASHES[0];
  state.refNo = g.refNo;
  state.view = 'front';
  state.prints = [];
  state.selectedPrintId = null;
  state.seams = defaultSeams(g);
  renderGarmentList();
  renderSizeRow();
  renderViewToggle();
  renderColorTab();
  renderPrintTab();
  renderMeasureTab();
  renderSeamsTab();
  renderStage();
}

function renderGarmentList() {
  const list = document.getElementById('garmentList');
  list.innerHTML = '';
  GARMENTS.forEach(g => {
    const li = document.createElement('li');
    li.className = 'garment-item' + (g.id === state.garmentId ? ' active' : '');
    li.innerHTML = `<div class="name">${g.name}</div><div class="meta">${g.category} &middot; ${g.season} &middot; Ref ${g.refNo}</div>`;
    li.addEventListener('click', () => selectGarment(g.id));
    list.appendChild(li);
  });
}

function renderSizeRow() {
  const g = currentGarment();
  const row = document.getElementById('sizeRow');
  row.innerHTML = '';
  const sizes = availableSizes(g);
  sizes.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'size-btn' + (s === state.size ? ' active' : '');
    btn.textContent = s;
    btn.addEventListener('click', () => {
      state.size = s;
      renderSizeRow();
      renderMeasureTab();
    });
    row.appendChild(btn);
  });
}

function renderViewToggle() {
  const g = currentGarment();
  const wrap = document.getElementById('viewToggle');
  wrap.innerHTML = '';
  const views = g.printBack ? ['front', 'back'] : ['front', 'back'];
  views.forEach(v => {
    const btn = document.createElement('button');
    btn.textContent = v;
    btn.className = v === state.view ? 'active' : '';
    btn.addEventListener('click', () => {
      state.view = v;
      const viewPrints = state.prints.filter(p => p.view === state.view);
      state.selectedPrintId = viewPrints.length ? viewPrints[viewPrints.length - 1].id : null;
      renderViewToggle();
      renderPrintTab();
      renderStage();
    });
    wrap.appendChild(btn);
  });
}

function renderTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + state.tab));
    });
  });
}

// ---------- Color tab ----------
function renderColorTab() {
  const g = currentGarment();
  const chip = document.getElementById('colorwayChip');
  let printLine = `<div class="colorway-chip"><div class="dot" style="background:${g.print.hex}"></div><div class="txt"><b>${g.print.name}</b>${g.print.pantone || 'locked colorway pending'} &middot; print/logo</div></div>`;
  if (g.printBack) {
    printLine += `<div class="colorway-chip"><div class="dot" style="background:${g.printBack.hex}"></div><div class="txt"><b>${g.printBack.name}</b>${g.printBack.pantone} &middot; back print</div></div>`;
  }
  chip.innerHTML = `
    <div class="dot" style="background:${g.colorway.hex}"></div>
    <div class="txt"><b>${g.colorway.name}</b>${g.colorway.pantone ? g.colorway.pantone : 'locked colorway pending'} &middot; body</div>
  `;
  document.getElementById('printColorwayChips').innerHTML = printLine;

  renderSwatchGrid(document.getElementById('swatchGrid'), state.color, setColor);

  document.getElementById('colorPicker').value = state.color;
  document.getElementById('colorHex').value = state.color;
}

function renderSwatchGrid(container, activeHex, onPick) {
  container.innerHTML = '';
  BRAND_SWATCHES.forEach(sw => {
    const cell = document.createElement('div');
    const box = document.createElement('div');
    box.className = 'swatch' + (activeHex && activeHex.toLowerCase() === sw.hex.toLowerCase() ? ' active' : '');
    box.style.background = sw.hex;
    box.title = sw.pantone ? `${sw.name} (${sw.pantone})` : `${sw.name} · Brand`;
    box.addEventListener('click', () => onPick(sw.hex));
    const label = document.createElement('div');
    label.className = 'swatch-label';
    label.textContent = sw.name;
    cell.appendChild(box);
    cell.appendChild(label);
    container.appendChild(cell);
  });
}

function setColor(hex) {
  state.color = hex;
  document.getElementById('colorPicker').value = hex;
  document.getElementById('colorHex').value = hex;
  renderColorTab();
  paintStage();
}

function bindGlobalControls() {
  document.getElementById('colorPicker').addEventListener('input', e => setColor(e.target.value));
  document.getElementById('colorHex').addEventListener('change', e => {
    let v = e.target.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v);
    else e.target.value = state.color;
  });
  document.getElementById('resetColorBtn').addEventListener('click', () => setColor(currentGarment().colorway.hex));

  document.getElementById('gsmInput').addEventListener('change', e => {
    const v = e.target.value.trim();
    state.gsm = v === '' ? null : Math.max(0, Math.round(Number(v)));
    e.target.value = state.gsm != null ? state.gsm : '';
  });

  document.getElementById('fabricInput').addEventListener('change', e => {
    state.fabric = e.target.value;
  });

  document.getElementById('washInput').addEventListener('change', e => {
    state.wash = e.target.value;
  });

  document.getElementById('refNoInput').addEventListener('change', e => {
    const v = e.target.value.trim();
    state.refNo = v === '' ? currentGarment().refNo : v;
    e.target.value = state.refNo;
  });

  document.getElementById('dateInput').addEventListener('change', e => {
    state.date = e.target.value || todayISO();
    e.target.value = state.date;
  });

  document.getElementById('printUpload').addEventListener('change', e => {
    const files = [...e.target.files];
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => addPrintLayer(ev.target.result, file.name.replace(/\.[^.]+$/, ''));
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  });
  document.getElementById('useLogoBtn').addEventListener('click', () => {
    fetchAsDataURL(LOGO_PATH).then(src => addPrintLayer(src, 'SOAP logo')).catch(() => alert('Could not load assets/logo.png'));
  });

  // Text-as-print
  populateFontSelect(document.getElementById('printFontSelect'), 'Roboto Condensed');
  const addTextBtn = document.getElementById('addTextBtn');
  if (addTextBtn) addTextBtn.addEventListener('click', () => {
    const input = document.getElementById('printTextInput');
    const font = document.getElementById('printFontSelect').value;
    addTextLayer(input.value, font);
    input.value = '';
  });
  const printTextInput = document.getElementById('printTextInput');
  if (printTextInput) printTextInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addTextBtn.click(); }
  });
  const editTextInput = document.getElementById('editTextInput');
  if (editTextInput) editTextInput.addEventListener('input', e => {
    const p = selectedPrint();
    if (p && p.type === 'text') { p.text = e.target.value; refreshTextLayer(p); }
  });
  const editFontSelect = document.getElementById('editFontSelect');
  if (editFontSelect) editFontSelect.addEventListener('change', e => {
    const p = selectedPrint();
    if (p && p.type === 'text') { p.fontName = e.target.value; refreshTextLayer(p); }
  });
  const editWeightSelect = document.getElementById('editWeightSelect');
  if (editWeightSelect) editWeightSelect.addEventListener('change', e => {
    const p = selectedPrint();
    if (p && p.type === 'text') { p.weight = e.target.value; refreshTextLayer(p); }
  });
  const editItalic = document.getElementById('editItalic');
  if (editItalic) editItalic.addEventListener('change', e => {
    const p = selectedPrint();
    if (p && p.type === 'text') { p.italic = e.target.checked; refreshTextLayer(p); }
  });
  document.getElementById('removePrintBtn').addEventListener('click', () => {
    removePrintLayer(state.selectedPrintId);
  });

  document.querySelectorAll('#methodToggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = selectedPrint();
      if (!p) return;
      p.method = btn.dataset.method;
      renderPrintTab();
    });
  });

  document.getElementById('printColorPicker').addEventListener('input', e => setPrintColor(e.target.value));
  document.getElementById('printColorHex').addEventListener('change', e => {
    let v = e.target.value.trim();
    if (!v) { resetPrintColor(); return; }
    if (!v.startsWith('#')) v = '#' + v;
    const p = selectedPrint();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) setPrintColor(v);
    else e.target.value = p && p.color ? p.color : '';
  });
  document.getElementById('resetPrintColorBtn').addEventListener('click', resetPrintColor);

  ['scale', 'rotation', 'opacity'].forEach(prop => {
    document.getElementById('print' + capitalize(prop)).addEventListener('input', e => {
      const p = selectedPrint();
      if (!p) return;
      p[prop] = parseFloat(e.target.value);
      document.getElementById('print' + capitalize(prop) + 'Val').textContent = formatSliderVal(prop, p[prop]);
      document.getElementById('printPlacementInfo').textContent = placementInfoText(p);
      paintStage();
    });
  });

  document.getElementById('downloadBtn').addEventListener('click', downloadPng);
  document.getElementById('downloadTechpackBtn').addEventListener('click', downloadTechpack);
  initTechpackFolderButton();

  document.getElementById('saveDesignBtn').addEventListener('click', saveCurrentDesign);
  document.getElementById('designNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveCurrentDesign();
  });
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function formatSliderVal(prop, v) {
  if (prop === 'rotation') return Math.round(v) + '°';
  if (prop === 'opacity') return Math.round(v * 100) + '%';
  return v.toFixed(2) + '×';
}

function fetchAsDataURL(path) {
  return fetch(path)
    .then(r => r.blob())
    .then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }));
}

// ---------- Text as a print layer ----------
// Text is rendered to a transparent canvas (black glyphs) and then treated as a
// normal print layer: same drag/scale/rotate/opacity, the print-color picker
// tints it like a single-ink print, and it exports in the tech pack unchanged
// because it rides through as an image data URL.
// Weights offered for text prints. Fonts that carry the weight/italic (the
// brand Roboto / Roboto Condensed carry all of them) render it for real; a
// single-weight display font falls back to what it has.
const TEXT_WEIGHTS = [['100', 'Thin'], ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'SemiBold'], ['700', 'Bold'], ['900', 'Black']];

const _loadedFonts = {};
function ensureFont(name, weight, italic) {
  weight = weight || '400';
  const ital = italic ? 1 : 0;
  const key = `${name}|${weight}|${ital}`;
  if (_loadedFonts[key]) return _loadedFonts[key];
  // Load the exact weight+italic variant on demand (one <link> per variant, so
  // an unavailable variant fails harmlessly instead of blocking the family).
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}:ital,wght@${ital},${weight}&display=swap`;
  document.head.appendChild(link);
  const spec = `${italic ? 'italic ' : ''}${weight} 48px "${name}"`;
  _loadedFonts[key] = (document.fonts && document.fonts.load)
    ? document.fonts.load(spec).then(() => {}).catch(() => {})
    : Promise.resolve();
  return _loadedFonts[key];
}

function renderTextCanvas(text, fontName, weight, italic) {
  const base = 240;                        // hi-res cap height for crisp print
  const pad = Math.round(base * 0.28);
  const lineH = base * 1.28;
  const lines = (text || ' ').split('\n');
  const font = `${italic ? 'italic ' : ''}${weight || '400'} ${base}px "${fontName}", sans-serif`;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = font;
  let maxW = 1;
  lines.forEach(l => { maxW = Math.max(maxW, meas.measureText(l || ' ').width); });
  const c = document.createElement('canvas');
  c.width = Math.ceil(maxW) + pad * 2;
  c.height = Math.ceil(lineH * lines.length) + pad * 2;
  const ctx = c.getContext('2d');
  ctx.font = font;
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, c.width / 2, pad + i * lineH));
  return c;
}

function textLayerName(text) {
  const t = (text || 'Text').replace(/\n/g, ' ');
  return t.length > 22 ? t.slice(0, 22) + '…' : t;
}

async function addTextLayer(text, fontName, weight, italic) {
  const t = (text || '').trim();
  if (!t) return;
  weight = weight || '400'; italic = !!italic;
  await ensureFont(fontName, weight, italic);
  const src = renderTextCanvas(t, fontName, weight, italic).toDataURL('image/png');
  const img = new Image();
  img.onload = () => {
    const g = currentGarment();
    const view = state.view;
    const placement = defaultPrintPlacement(g, view, 18);
    const layer = {
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: textLayerName(t),
      src, img, view,
      x: placement.x, y: placement.y, scale: placement.scale, rotation: 0, opacity: 1,
      color: null, tintedCanvas: null, method: 'screen',
      type: 'text', text: t, fontName, weight, italic,
    };
    state.prints.push(layer);
    state.selectedPrintId = layer.id;
    renderPrintTab();
    paintStage();
  };
  img.src = src;
}

// Re-render a selected text layer in place after its text or font changed,
// keeping placement, scale, rotation, opacity and any chosen print color.
async function refreshTextLayer(layer) {
  if (!layer || layer.type !== 'text') return;
  await ensureFont(layer.fontName, layer.weight, layer.italic);
  layer.src = renderTextCanvas(layer.text || ' ', layer.fontName, layer.weight, layer.italic).toDataURL('image/png');
  layer.name = textLayerName(layer.text);
  const img = new Image();
  img.onload = () => {
    layer.img = img;
    if (layer.color) applyPrintTint(layer);
    renderPrintTab();
    paintStage();
  };
  img.src = layer.src;
}

function populateFontSelect(sel, selected) {
  if (!sel) return;
  sel.innerHTML = PRINT_FONTS.map(f =>
    `<option value="${f.name}"${f.name === selected ? ' selected' : ''}>${f.name}${f.brand ? ' (brand)' : ''}</option>`
  ).join('');
}

function populateWeightSelect(sel, val) {
  if (!sel) return;
  sel.innerHTML = TEXT_WEIGHTS.map(([v, n]) =>
    `<option value="${v}"${v === String(val || '400') ? ' selected' : ''}>${n}</option>`
  ).join('');
}

// ---------- Real-world print placement (calibrated to actual cm) ----------
// Draggable placement is still expressed as a 0-1 fraction within a "zone"
// rectangle, like before, but the zone itself and the default anchor point
// are now derived from CALIBRATION (studio/data.js), which was measured
// directly off each flat-drawing PNG. This is what lets placement be shown
// and exported in real centimetres instead of guessed screen fractions.
function getCalib(g, view) {
  return CALIBRATION[g.assetKey][view];
}

function getPrintZonePx(g, view) {
  const c = getCalib(g, view);
  const w = 30 * c.pxPerCm;
  const h = 45 * c.pxPerCm;
  const x = c.centerX - w / 2;
  const y = c.hspY + 2 * c.pxPerCm;
  return { x, y, w, h };
}

// Default chest-logo spot: 12cm wide, 14cm below the collar, centered over
// the wearer's left chest (8cm right of garment center as viewed from the
// front) -- matches the convention already used in scripts/build_mockup.py.
// No equivalent brand convention exists yet for back placement, so that
// defaults to centered, a bit lower (18cm below collar) -- adjust freely.
function defaultPrintPlacement(g, view, widthCm) {
  const c = getCalib(g, view);
  const zone = getPrintZonePx(g, view);
  const offsetXcm = view === 'front' ? 8 : 0;
  const offsetYcm = view === 'front' ? 14 : 18;
  const cx = c.centerX + offsetXcm * c.pxPerCm;
  const cy = c.hspY + offsetYcm * c.pxPerCm;
  return {
    x: clamp((cx - zone.x) / zone.w, 0, 1),
    y: clamp((cy - zone.y) / zone.h, 0, 1),
    scale: (widthCm * c.pxPerCm) / zone.w,
  };
}

function addPrintLayer(src, name) {
  const img = new Image();
  img.onload = () => {
    const g = currentGarment();
    const view = state.view;
    const placement = defaultPrintPlacement(g, view, 12);
    const layer = {
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || 'Artwork',
      src, img, view,
      x: placement.x, y: placement.y, scale: placement.scale, rotation: 0, opacity: 1,
      color: null, tintedCanvas: null, method: 'embroidery',
    };
    state.prints.push(layer);
    state.selectedPrintId = layer.id;
    renderPrintTab();
    paintStage();
  };
  img.src = src;
}

function removePrintLayer(id) {
  if (!id) return;
  state.prints = state.prints.filter(p => p.id !== id);
  state.selectedPrintId = state.prints.length ? state.prints[state.prints.length - 1].id : null;
  renderPrintTab();
  paintStage();
}

// Recolors a print layer by stamping a flat fill through its own alpha
// channel (source-atop), like a single-ink screen print or embroidery
// thread color, replacing whatever colors the uploaded artwork originally had.
function applyPrintTint(p) {
  if (!p.color) { p.tintedCanvas = null; return; }
  const off = document.createElement('canvas');
  off.width = p.img.naturalWidth;
  off.height = p.img.naturalHeight;
  const octx = off.getContext('2d');
  octx.drawImage(p.img, 0, 0);
  octx.globalCompositeOperation = 'source-atop';
  octx.fillStyle = p.color;
  octx.fillRect(0, 0, off.width, off.height);
  p.tintedCanvas = off;
}

function setPrintColor(hex) {
  const p = selectedPrint();
  if (!p) return;
  p.color = hex;
  applyPrintTint(p);
  renderPrintTab();
  paintStage();
}

function resetPrintColor() {
  const p = selectedPrint();
  if (!p) return;
  p.color = null;
  p.tintedCanvas = null;
  renderPrintTab();
  paintStage();
}

// ---------- Print tab ----------
function renderPrintTab() {
  document.getElementById('layersHeading').textContent = `Layers — ${capitalize(state.view)}`;

  const viewPrints = state.prints.filter(p => p.view === state.view);
  const list = document.getElementById('layerList');
  list.innerHTML = '';
  viewPrints.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'layer-row' + (p.id === state.selectedPrintId ? ' active' : '');
    li.innerHTML = `
      <img class="layer-thumb" src="${p.src}" alt="">
      <span class="layer-name">${p.name || 'Artwork ' + (i + 1)}</span>
      <span class="layer-method">${p.method === 'screen' ? 'SCR' : 'EMB'}</span>
      <button class="layer-del" title="Remove layer">&times;</button>
    `;
    li.addEventListener('click', () => {
      state.selectedPrintId = p.id;
      renderPrintTab();
      paintStage();
    });
    li.querySelector('.layer-del').addEventListener('click', e => {
      e.stopPropagation();
      removePrintLayer(p.id);
    });
    list.appendChild(li);
  });
  document.getElementById('layerEmpty').style.display = viewPrints.length ? 'none' : 'block';

  const sel = selectedPrint();
  const selValid = sel && sel.view === state.view;
  document.getElementById('printControls').style.display = selValid ? 'block' : 'none';
  if (selValid) {
    const teg = document.getElementById('textEditGroup');
    if (teg) {
      if (sel.type === 'text') {
        teg.style.display = 'block';
        const eti = document.getElementById('editTextInput');
        if (eti && document.activeElement !== eti) eti.value = sel.text || '';
        populateFontSelect(document.getElementById('editFontSelect'), sel.fontName);
        populateWeightSelect(document.getElementById('editWeightSelect'), sel.weight || '400');
        const ei = document.getElementById('editItalic'); if (ei) ei.checked = !!sel.italic;
      } else {
        teg.style.display = 'none';
      }
    }
    document.querySelectorAll('#methodToggle button').forEach(b => {
      b.classList.toggle('active', b.dataset.method === (sel.method || 'embroidery'));
    });
    renderSwatchGrid(document.getElementById('printSwatchGrid'), sel.color, setPrintColor);
    document.getElementById('printColorPicker').value = sel.color || '#000000';
    document.getElementById('printColorHex').value = sel.color || '';
    document.getElementById('printScale').value = sel.scale;
    document.getElementById('printScaleVal').textContent = formatSliderVal('scale', sel.scale);
    document.getElementById('printRotation').value = sel.rotation;
    document.getElementById('printRotationVal').textContent = formatSliderVal('rotation', sel.rotation);
    document.getElementById('printOpacity').value = sel.opacity;
    document.getElementById('printOpacityVal').textContent = formatSliderVal('opacity', sel.opacity);
    document.getElementById('printPlacementInfo').textContent = placementInfoText(sel);
  }
}

// Real-world readout for the selected print layer, in the style of the
// existing tech pack Embroidery pages ("Wordmark placement, front and back").
function placementInfoText(p) {
  const g = currentGarment();
  const c = getCalib(g, p.view);
  const zone = getPrintZonePx(g, p.view);
  const wPx = zone.w * p.scale;
  const aspect = p.img.naturalWidth / p.img.naturalHeight;
  const hPx = wPx / aspect;
  const widthCm = wPx / c.pxPerCm;
  const cx = zone.x + zone.w / 2 + (p.x - 0.5) * zone.w;
  const cy = zone.y + zone.h / 2 + (p.y - 0.5) * zone.h;
  // Garment-industry convention: measure from the collar (HSP) to the HIGHEST
  // point of the print (its top edge), not the print's center.
  const topY = cy - hPx / 2;
  const belowCollarCm = (topY - c.hspY) / c.pxPerCm;
  const fromCenterCm = (cx - c.centerX) / c.pxPerCm;
  const side = fromCenterCm >= 0 ? 'right of center' : 'left of center';
  return `${widthCm.toFixed(1)} cm wide · top ${belowCollarCm.toFixed(1)} cm below collar · ${Math.abs(fromCenterCm).toFixed(1)} cm ${side}`;
}

// ---------- Measurements tab ----------
// Per-measure default grade increment (cm per size step) used ONLY when a row
// has a single sampled size, so XS-XXL can still be estimated. When a row has
// two or more sampled sizes, the step is derived from the garment's own grade.
function pomStep(label) {
  const l = (label || '').toLowerCase();
  if (/rib|cuff|waistband|elastic|collar width|neck rib|to stitch/.test(l)) return 0;
  if (/chest|pit to pit|armhole to armhole|bust/.test(l)) return 2.5;
  if (/shoulder/.test(l)) return 0.6;
  if (/sleeve/.test(l)) return 1.0;
  if (/hood/.test(l)) return 0.5;
  if (/pocket/.test(l)) return 0.5;
  if (/neck/.test(l)) return 0.5;
  if (/armhole/.test(l)) return 1.0;
  if (/hem|bottom opening/.test(l)) return 1.5;
  if (/length|hsp|cf|center back|drop/.test(l)) return 1.5;
  return 1.0;
}

// Grade one POM row to all six sizes. Sampled sizes are kept verbatim (may be
// strings like "2 or 2.5"); missing sizes are extrapolated from the nearest
// sampled size using the derived (or default) step. Returns { size: value }.
function gradeRowValues(row) {
  const known = [];
  SIZES.forEach((s, i) => { const v = parseFloat(row[s]); if (!isNaN(v)) known.push({ i, s, v }); });
  const out = {};
  if (!known.length) return out;
  let step;
  if (known.length >= 2) { const a = known[0], b = known[known.length - 1]; step = (b.v - a.v) / (b.i - a.i); }
  else step = pomStep(row.label);
  SIZES.forEach((s, i) => {
    const k = known.find(o => o.i === i);
    if (k) { out[s] = row[s]; return; }
    const near = known.reduce((a, b) => Math.abs(b.i - i) < Math.abs(a.i - i) ? b : a);
    const v = Math.round((near.v + (i - near.i) * step) * 10) / 10;
    out[s] = v > 0 ? v : '';
  });
  return out;
}

// Full XS-XXL size grid (graded values + any manual overrides) for export, so
// the tech pack's size chart always shows exactly what the Measure tab shows.
function buildSizeGrid(g) {
  const ov = state.measureOverrides[g.id] || {};
  const rows = g.pom.map((row, ri) => {
    const graded = gradeRowValues(row);
    const values = {};
    SIZES.forEach(s => {
      const has = ov[ri] && ov[ri][s] != null;
      const v = has ? ov[ri][s] : (graded[s] != null ? graded[s] : '');
      values[s] = v === '' ? '' : String(v);
    });
    return { label: row.label, values };
  });
  return { headers: SIZES.slice(), rows };
}

const MEASURE_KEY = 'soap_studio_measures';
function loadMeasureOverrides() {
  try { return JSON.parse(localStorage.getItem(MEASURE_KEY) || '{}'); } catch (e) { return {}; }
}
function saveMeasureOverrides() {
  try { localStorage.setItem(MEASURE_KEY, JSON.stringify(state.measureOverrides)); } catch (e) {}
}

function renderMeasureTab() {
  const g = currentGarment();
  document.getElementById('dateInput').value = state.date || todayISO();
  document.getElementById('refNoInput').value = state.refNo != null ? state.refNo : '';
  document.getElementById('gsmInput').value = state.gsm != null ? state.gsm : '';
  const fabricSel = document.getElementById('fabricInput');
  fabricSel.innerHTML = FABRICS.map(f => `<option value="${f}">${f}</option>`).join('');
  fabricSel.value = state.fabric || FABRICS[0];
  const washSel = document.getElementById('washInput');
  washSel.innerHTML = WASHES.map(w => `<option value="${w}">${w}</option>`).join('');
  washSel.value = state.wash || WASHES[0];

  const ov = state.measureOverrides[g.id] || {};
  const wrap = document.getElementById('measureTable');
  let html = '<table class="pom"><thead><tr><th>Point of measure</th>';
  SIZES.forEach(s => html += `<th class="num${s === state.size ? ' active-size' : ''}">${s}</th>`);
  html += '</tr></thead><tbody>';
  g.pom.forEach((row, ri) => {
    const graded = gradeRowValues(row);
    html += `<tr><td>${row.label}</td>`;
    SIZES.forEach(s => {
      const has = ov[ri] && ov[ri][s] != null;
      const val = has ? ov[ri][s] : (graded[s] != null ? graded[s] : '');
      const cls = 'num' + (s === state.size ? ' active-size' : '');
      html += `<td class="${cls}"><input class="pom-input" data-row="${ri}" data-size="${s}" value="${val === '' ? '' : String(val)}" spellcheck="false"></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;

  wrap.querySelectorAll('input.pom-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const ri = inp.dataset.row, s = inp.dataset.size, v = inp.value.trim();
      state.measureOverrides[g.id] = state.measureOverrides[g.id] || {};
      state.measureOverrides[g.id][ri] = state.measureOverrides[g.id][ri] || {};
      if (v === '') delete state.measureOverrides[g.id][ri][s];
      else state.measureOverrides[g.id][ri][s] = v;
      saveMeasureOverrides();
    });
  });

  const note = document.getElementById('measureNote');
  note.textContent = (g.note ? g.note + '  ' : '') +
    'Sizes without a sampled measurement are graded estimates — type in any cell to lock your own number (saved on this computer).';
  note.style.display = 'block';
}

// ---------- Seams tab ----------
function renderSeamsTab() {
  const g = currentGarment();
  const wrap = document.getElementById('seamList');
  if (!wrap) return;
  const parts = seamPartsFor(g);
  if (!parts.length) {
    wrap.innerHTML = '<p class="hint">No seam map for this silhouette yet.</p>';
    return;
  }
  wrap.innerHTML = '';
  parts.forEach(part => {
    const st = seamStateFor(part);
    const fin = SEAM_FINISHES.find(f => f.id === st.finish) || SEAM_FINISHES[0];
    const row = document.createElement('div');
    row.className = 'seam-row' + (st.on ? '' : ' off');
    const opts = SEAM_FINISHES.map(f =>
      `<option value="${f.id}"${f.id === st.finish ? ' selected' : ''}>${f.name}</option>`).join('');
    row.innerHTML =
      `<img class="seam-thumb" src="${fin.img}" alt="${fin.name}">` +
      `<div class="seam-body">` +
        `<div class="seam-head">` +
          `<div class="seam-part">${part.label}</div>` +
          `<label class="seam-toggle" title="Show this seam on the tech pack">` +
            `<input type="checkbox" class="seam-onoff" data-part="${part.id}"${st.on ? ' checked' : ''}>` +
            `<span class="seam-track"></span>` +
          `</label>` +
        `</div>` +
        `<select class="seam-select" data-part="${part.id}"${st.on ? '' : ' disabled'}>${opts}</select>` +
        `<div class="seam-desc">${st.on ? fin.desc : 'Off — not shown on the tech pack.'}</div>` +
      `</div>`;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('.seam-onoff').forEach(cb => {
    cb.addEventListener('change', () => {
      const cur = seamStateFor({ id: cb.dataset.part, finish: null });
      state.seams[cb.dataset.part] = { on: cb.checked, finish: cur.finish };
      renderSeamsTab();
    });
  });
  wrap.querySelectorAll('.seam-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const cur = seamStateFor({ id: sel.dataset.part, finish: null });
      state.seams[sel.dataset.part] = { on: cur.on, finish: sel.value };
      renderSeamsTab();
    });
  });
}

// ---------- Stage / canvas rendering ----------
// Real flat-drawing line art (studio/assets/<assetKey>_front|back.png),
// extracted from each garment's own tech pack. Recolor technique: draw the
// line art, flatten it to a flat color silhouette clipped to its own alpha
// (source-atop), then redraw the original line art on top with a multiply
// blend so black linework stays black and grey rib/shading darkens the
// chosen color proportionally, and white fill becomes the chosen color.
const IMAGE_CACHE = {};
function loadImage(src) {
  if (!IMAGE_CACHE[src]) {
    const img = new Image();
    const ready = new Promise((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = reject;
    });
    img.src = src;
    IMAGE_CACHE[src] = { img, ready };
  }
  return IMAGE_CACHE[src];
}

function assetPath(g, view) {
  return `assets/${g.assetKey}_${view}.png`;
}

async function renderStage() {
  const g = currentGarment();
  const requestedView = state.view;
  const entry = loadImage(assetPath(g, requestedView));
  const canvas = document.getElementById('stageCanvas');
  try {
    const img = await entry.ready;
    if (currentGarment().id !== g.id || state.view !== requestedView) return; // stale
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas._bodyImg = img;
    paintStage();
  } catch (e) {
    console.error('Could not load', assetPath(g, requestedView), e);
  }
}

function paintStage() {
  const canvas = document.getElementById('stageCanvas');
  const img = canvas._bodyImg;
  if (!img) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = state.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';

  drawPrintLayers(ctx, canvas);
}

function drawPrintLayers(ctx, canvas) {
  canvas._printRects = [];
  const g = currentGarment();
  const zone = getPrintZonePx(g, state.view);
  const viewPrints = state.prints.filter(p => p.view === state.view);

  viewPrints.forEach(p => {
    const source = p.tintedCanvas || p.img;
    const aspect = p.img.naturalWidth / p.img.naturalHeight;
    const w = zone.w * p.scale;
    const h = w / aspect;
    const cx = zone.x + zone.w / 2 + (p.x - 0.5) * zone.w;
    const cy = zone.y + zone.h / 2 + (p.y - 0.5) * zone.h;

    ctx.save();
    ctx.globalAlpha = p.opacity;
    ctx.translate(cx, cy);
    ctx.rotate(p.rotation * Math.PI / 180);
    ctx.drawImage(source, -w / 2, -h / 2, w, h);
    ctx.restore();

    canvas._printRects.push({ id: p.id, cx, cy, w, h, rotation: p.rotation });
  });

  const sel = canvas._printRects.find(r => r.id === state.selectedPrintId);
  if (sel && viewPrints.length > 1) {
    ctx.save();
    ctx.translate(sel.cx, sel.cy);
    ctx.rotate(sel.rotation * Math.PI / 180);
    ctx.strokeStyle = 'rgba(127,3,4,0.85)';
    ctx.lineWidth = Math.max(2, canvas.width * 0.0025);
    ctx.setLineDash([canvas.width * 0.01, canvas.width * 0.007]);
    ctx.strokeRect(-sel.w / 2, -sel.h / 2, sel.w, sel.h);
    ctx.restore();
  }
}

function toCanvasCoords(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function hitTestPrints(canvas, x, y) {
  const rects = canvas._printRects || [];
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    const dx = x - r.cx, dy = y - r.cy;
    const rad = -r.rotation * Math.PI / 180;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    if (Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2) return r.id;
  }
  return null;
}

let dragState = null;
function bindStageInteraction() {
  const canvas = document.getElementById('stageCanvas');
  canvas.addEventListener('pointerdown', e => {
    const p = toCanvasCoords(canvas, e);
    const hitId = hitTestPrints(canvas, p.x, p.y);
    if (!hitId) {
      if (state.selectedPrintId !== null) {
        state.selectedPrintId = null;
        renderPrintTab();
        paintStage();
      }
      return;
    }
    if (state.selectedPrintId !== hitId) {
      state.selectedPrintId = hitId;
      renderPrintTab();
    }
    const layer = getPrint(hitId);
    dragState = { startX: p.x, startY: p.y, origX: layer.x, origY: layer.y };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', e => {
    const p = toCanvasCoords(canvas, e);
    if (dragState) {
      const zone = getPrintZonePx(currentGarment(), state.view);
      const layer = selectedPrint();
      if (layer) {
        const dx = p.x - dragState.startX, dy = p.y - dragState.startY;
        const nx = dragState.origX + dx / zone.w;
        const ny = dragState.origY + dy / zone.h;
        // Free placement: the print can go anywhere over the garment, the same
        // for every product. Bounds derive from each garment's own canvas + zone
        // (so the limit no longer varies collection to collection). We allow the
        // center to travel a margin past every image edge so it never hits a wall
        // before the hem/sleeve, but not so far it gets lost off-canvas. The
        // real-cm readout and tech pack export use this same x/y, so they stay
        // accurate at any position.
        const nxFor = cx => 0.5 + (cx - zone.x - zone.w / 2) / zone.w;
        const nyFor = cy => 0.5 + (cy - zone.y - zone.h / 2) / zone.h;
        const mx = canvas.width * 0.25, my = canvas.height * 0.25;
        layer.x = clamp(nx, nxFor(-mx), nxFor(canvas.width + mx));
        layer.y = clamp(ny, nyFor(-my), nyFor(canvas.height + my));
        document.getElementById('printPlacementInfo').textContent = placementInfoText(layer);
        paintStage();
      }
    } else {
      const hot = hitTestPrints(canvas, p.x, p.y);
      canvas.style.cursor = hot ? 'grab' : 'default';
    }
  });
  window.addEventListener('pointerup', () => {
    dragState = null;
    canvas.classList.remove('dragging');
  });
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ---------- Export ----------
function downloadPng() {
  const canvas = document.getElementById('stageCanvas');
  const g = currentGarment();
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${g.id}-${state.view}-${state.size}-${state.color.replace('#', '')}.png`;
    a.click();
  });
}

// ---------- Tech pack export (Python backend, see backend/app.py) ----------
// Local dev hits the Flask server on localhost; the deployed site hits the
// Render.com backend. Returns the PDF as a file download either way.
const TECHPACK_SERVER =
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:5001'
    : 'https://collection-studio-techpack.onrender.com';

// Computes every number the PDF needs for one print layer -- final pixel
// geometry within that view's own image, plus the same real-cm placement
// shown live in the Print tab -- so the backend has no placement math of
// its own that could drift out of sync with the on-screen preview.
function serializePrintForExport(g, p) {
  const c = getCalib(g, p.view);
  const zone = getPrintZonePx(g, p.view);
  const aspect = p.img.naturalWidth / p.img.naturalHeight;
  const w = zone.w * p.scale;
  const h = w / aspect;
  const cx = zone.x + zone.w / 2 + (p.x - 0.5) * zone.w;
  const cy = zone.y + zone.h / 2 + (p.y - 0.5) * zone.h;
  return {
    view: p.view, name: p.name, src: p.src, color: p.color, method: p.method || 'embroidery',
    opacity: p.opacity, rotation: p.rotation,
    cx, cy, w, h,
    widthCm: w / c.pxPerCm,
    heightCm: h / c.pxPerCm,
    // Measured from the collar (HSP) to the print's highest point (top edge),
    // per garment convention -- matches the leader arrow drawn on the PDF.
    belowCollarCm: (cy - h / 2 - c.hspY) / c.pxPerCm,
    fromCenterCm: (cx - c.centerX) / c.pxPerCm,
  };
}

// ---------- Save-to-folder (File System Access API, Chromium only) ----------
// Lets Alaa pick the project's assets/techpack folder once; every later export
// writes straight into it. The chosen folder handle persists in IndexedDB.
// Safari/Firefox have no such API, so those fall back to a normal download.
function fsAccessSupported() {
  return 'showDirectoryPicker' in window;
}

// Timestamped so a new export never overwrites an earlier one: e.g.
// hoodie-S-techpack-2026-07-21-0143.pdf
function techpackStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('soap-studio', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetHandle() {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const r = db.transaction('kv', 'readonly').objectStore('kv').get('techpackDir');
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  } catch (e) {
    return null;
  }
}

async function idbSetHandle(handle) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv', 'readwrite').objectStore('kv').put(handle, 'techpackDir');
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

// queryPermission is safe any time; requestPermission needs live user
// activation, so only pass requestIfNeeded=true from inside a click handler.
async function verifyRWPermission(handle, requestIfNeeded) {
  const opts = { mode: 'readwrite' };
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (requestIfNeeded && (await handle.requestPermission(opts)) === 'granted') return true;
  } catch (e) { /* handle no longer valid */ }
  return false;
}

async function writePdfToDir(dirHandle, filename, blob) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

// The "Set / Change save folder" link under the export button.
function initTechpackFolderButton() {
  const folderBtn = document.getElementById('techpackFolderBtn');
  if (!folderBtn) return;
  if (!fsAccessSupported()) { folderBtn.style.display = 'none'; return; }

  idbGetHandle().then(h => {
    folderBtn.style.display = '';
    folderBtn.textContent = h ? 'Change save folder…' : 'Set save folder…';
  });

  folderBtn.addEventListener('click', async () => {
    const status = document.getElementById('techpackStatus');
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await verifyRWPermission(handle, true);
      await idbSetHandle(handle);
      folderBtn.textContent = 'Change save folder…';
      status.style.color = '';
      status.textContent = `Save folder set to “${handle.name}”. Tech packs will save there automatically.`;
    } catch (e) {
      // AbortError = user closed the picker; ignore silently.
      if (e && e.name !== 'AbortError') {
        status.style.color = 'var(--signal)';
        status.textContent = `Could not set folder — ${e.message}`;
      }
    }
  });
}

async function downloadTechpack() {
  const status = document.getElementById('techpackStatus');
  const btn = document.getElementById('downloadTechpackBtn');
  const g = currentGarment();
  const payload = {
    garment: g,
    calibration: CALIBRATION[g.assetKey],
    brandSwatches: BRAND_SWATCHES,
    size: state.size,
    color: state.color,
    gsm: state.gsm,
    fabric: state.fabric,
    wash: state.wash,
    refNo: state.refNo,
    date: state.date,
    prints: state.prints.map(p => serializePrintForExport(g, p)),
    seamParts: seamPartsFor(g)
      .map(part => ({ ...part, finish: seamStateFor(part).finish, on: seamStateFor(part).on }))
      .filter(part => part.on),
    seamFinishes: SEAM_FINISHES,
    sizeGrid: buildSizeGrid(g),
  };

  btn.disabled = true;
  status.style.color = '';
  status.textContent = 'Generating PDF…';
  try {
    // Resolve the save folder while the click's user activation is still live
    // (showDirectoryPicker / requestPermission need it, and it expires during
    // the fetch below — especially on a cold-starting free backend).
    let dirHandle = null;
    if (fsAccessSupported()) {
      const stored = await idbGetHandle();
      if (stored && await verifyRWPermission(stored, true)) dirHandle = stored;
    }

    const res = await fetch(`${TECHPACK_SERVER}/generate-techpack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Server error (${res.status})`);
    }
    const blob = await res.blob();
    const filename = `${g.id}-${state.size}-techpack-${techpackStamp()}.pdf`;
    // Present when a local backend run filed the PDF into assets/techpack.
    const serverSavedPath = res.headers.get('X-Saved-Path');

    if (dirHandle) {
      await writePdfToDir(dirHandle, filename, blob);
      status.textContent = `Saved to your tech pack folder as ${filename}`;
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      if (serverSavedPath) {
        status.textContent = `Saved to ${serverSavedPath} (and downloaded a copy)`;
      } else {
        status.textContent = fsAccessSupported()
          ? `Downloaded ${filename}. Tip: click “Set save folder” to auto-file exports into assets/techpack.`
          : `Downloaded ${filename}`;
      }
    }
  } catch (e) {
    status.style.color = 'var(--signal)';
    const waking = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
    status.textContent = waking
      ? `Could not reach the tech pack server (free host may be waking up, try again in ~30s) — ${e.message}`
      : `Could not reach the tech pack server. Start it with: python3 backend/app.py — ${e.message}`;
  } finally {
    btn.disabled = false;
  }
}

// ---------- Saved designs (localStorage, this browser only) ----------
const DESIGNS_KEY = 'soap_studio_designs';

function loadDesignsFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(DESIGNS_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function saveDesignsToStorage(list) {
  try {
    localStorage.setItem(DESIGNS_KEY, JSON.stringify(list));
  } catch (e) {
    alert('Could not save: your browser storage is full. Try removing a saved design first (large uploaded artwork takes the most space).');
  }
}

function saveCurrentDesign() {
  const nameInput = document.getElementById('designNameInput');
  const g = currentGarment();
  const name = nameInput.value.trim() || `${g.name} ${new Date().toLocaleDateString()}`;
  const design = {
    id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    savedAt: Date.now(),
    garmentId: state.garmentId,
    size: state.size,
    view: state.view,
    color: state.color,
    gsm: state.gsm,
    fabric: state.fabric,
    wash: state.wash,
    refNo: state.refNo,
    date: state.date,
    seams: state.seams,
    prints: state.prints.map(p => ({
      name: p.name, src: p.src, view: p.view, x: p.x, y: p.y,
      scale: p.scale, rotation: p.rotation, opacity: p.opacity, color: p.color,
      method: p.method || 'embroidery',
      type: p.type || null, text: p.text || null, fontName: p.fontName || null,
      weight: p.weight || null, italic: p.italic || false,
    })),
  };
  const list = loadDesignsFromStorage();
  list.push(design);
  saveDesignsToStorage(list);
  nameInput.value = '';
  renderDesignList();
}

function deleteDesign(id) {
  saveDesignsToStorage(loadDesignsFromStorage().filter(d => d.id !== id));
  renderDesignList();
}

function loadDesignById(id) {
  const design = loadDesignsFromStorage().find(d => d.id === id);
  if (!design) return;

  state.garmentId = design.garmentId;
  const g = currentGarment();
  state.size = SIZES.includes(design.size) ? design.size : 'M';
  state.view = design.view === 'back' ? 'back' : 'front';
  state.color = design.color || g.colorway.hex;
  state.gsm = design.gsm != null ? design.gsm : (g.gsm != null ? g.gsm : null);
  state.fabric = design.fabric || g.fabric || FABRICS[0];
  state.wash = design.wash || g.wash || WASHES[0];
  state.refNo = design.refNo != null ? design.refNo : g.refNo;
  state.date = design.date || todayISO();
  state.seams = design.seams || defaultSeams(g);
  state.prints = [];
  state.selectedPrintId = null;

  renderGarmentList();
  renderSizeRow();
  renderViewToggle();
  renderColorTab();
  renderPrintTab();
  renderMeasureTab();
  renderSeamsTab();
  renderStage();

  (design.prints || []).forEach(pd => {
    const img = new Image();
    img.onload = () => {
      const layer = {
        id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: pd.name, src: pd.src, img, view: pd.view === 'back' ? 'back' : 'front',
        x: pd.x, y: pd.y, scale: pd.scale, rotation: pd.rotation, opacity: pd.opacity,
        color: pd.color || null, tintedCanvas: null, method: pd.method || 'embroidery',
        type: pd.type || null, text: pd.text || null, fontName: pd.fontName || null,
        weight: pd.weight || null, italic: pd.italic || false,
      };
      if (layer.color) applyPrintTint(layer);
      state.prints.push(layer);
      if (layer.view === state.view) state.selectedPrintId = layer.id;
      renderPrintTab();
      paintStage();
    };
    img.src = pd.src;
  });
}

function renderDesignList() {
  const list = loadDesignsFromStorage();
  const ul = document.getElementById('designList');
  ul.innerHTML = '';
  list.slice().reverse().forEach(d => {
    const g = GARMENTS.find(x => x.id === d.garmentId);
    const li = document.createElement('li');
    li.className = 'design-row';
    const dateStr = new Date(d.savedAt).toLocaleDateString();
    li.innerHTML = `
      <div class="design-info">
        <div class="design-name">${d.name}</div>
        <div class="design-meta">${g ? g.name : d.garmentId} &middot; ${d.size} &middot; ${dateStr}</div>
      </div>
      <div class="design-actions">
        <button class="design-load">Load</button>
        <button class="design-del">Delete</button>
      </div>
    `;
    li.querySelector('.design-load').addEventListener('click', () => loadDesignById(d.id));
    li.querySelector('.design-del').addEventListener('click', () => deleteDesign(d.id));
    ul.appendChild(li);
  });
  document.getElementById('designEmpty').style.display = list.length ? 'none' : 'block';
}

bindStageInteraction();
init();
