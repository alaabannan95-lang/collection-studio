/*
 * SOAP Collection Studio, garment + measurement data.
 * Point-of-measure tables sourced from scripts/build_techpack_apparel.py and
 * scripts/build_techpack_jacket.py (which mirror the PDFs in
 * assets/techpack/), and locked colorways from context/business.md.
 * assetKey maps to the real flat-drawing art in studio/assets/
 * (<assetKey>_front.png / _back.png), extracted from each garment's own
 * tech pack via scripts/build_studio_flats.py.
 */

/*
 * Real pixel-to-centimetre calibration per garment/view, measured directly off
 * the flat-drawing PNGs by scripts/calibrate_studio_flats.py:
 *   pxPerCm  - scale factor (chest width in px / chest width in cm, from the
 *              garment's own point-of-measure data)
 *   hspY     - the shoulder/collar reference row in px ("HSP", skips past a
 *              hood tip on hooded garments)
 *   centerX  - horizontal garment centerline in px
 * This lets print placement be expressed and displayed in real centimetres
 * instead of guessed screen fractions, matching the 12cm-wide /
 * 14cm-down-from-collar chest logo convention already used in
 * scripts/build_mockup.py.
 */
const CALIBRATION = {
  'tee-navy': {
    front: { w: 1007, h: 1012, pxPerCm: 11.353, hspY: 75, centerX: 489.5 },
    back:  { w: 1033, h: 1014, pxPerCm: 11.202, hspY: 73, centerX: 516.5 },
  },
  'tee-burgundy': {
    front: { w: 1017, h: 965, pxPerCm: 9.916, hspY: 21, centerX: 500.5 },
    back:  { w: 1032, h: 1011, pxPerCm: 11.042, hspY: 71, centerX: 515.5 },
  },
  'tank': {
    front: { w: 768, h: 1099, pxPerCm: 12.564, hspY: 12, centerX: 383.5 },
    back:  { w: 768, h: 1145, pxPerCm: 12.564, hspY: 57, centerX: 383.5 },
  },
  'longsleeve': {
    front: { w: 1060, h: 1103, pxPerCm: 15.983, hspY: 54, centerX: 548.0 },
    back:  { w: 923, h: 997, pxPerCm: 13.714, hspY: 38, centerX: 442.0 },
  },
  'jacket': {
    front: { w: 1015, h: 1203, pxPerCm: 14.65, hspY: 162, centerX: 506.0 },
    back:  { w: 1016, h: 1249, pxPerCm: 14.553, hspY: 38, centerX: 488.5 },
  },
  'hoodie': {
    front: { w: 941, h: 993, pxPerCm: 12.902, hspY: 148, centerX: 469.5 },
    back:  { w: 941, h: 1038, pxPerCm: 12.754, hspY: 191, centerX: 470.0 },
  },
  'crewneck': {
    front: { w: 975, h: 965, pxPerCm: 13.746, hspY: 53, centerX: 487.0 },
    back:  { w: 975, h: 1010, pxPerCm: 13.593, hspY: 97, centerX: 487.0 },
  },
};

const BRAND_SWATCHES = [
  { name: 'Navy Blazer',    pantone: '19-3923 TCX', hex: '#282D3C' },
  { name: 'Burgundy',       pantone: '19-1617 TCX', hex: '#64313E' },
  { name: 'Quiet Shade',    pantone: '18-4006 TCX', hex: '#66676D' },
  { name: 'Classic Blue',   pantone: '19-4052 TCX', hex: '#0F4C81' },
  { name: 'Pastel Yellow',  pantone: '11-0616 TCX', hex: '#F2E6B1' },
  { name: 'Bright White',   pantone: '11-0601 TCX', hex: '#F4F5F0' },
  { name: "Baby's Breath",  pantone: '11-0202 TCX', hex: '#E9E2D1' },
];

// Fabric constructions offered in the studio.
const FABRICS = ['Cotton Fleece', 'Cotton Terry'];

// Garment wash / finish offered in the studio. 'Raw' = no wash. The rest are
// applied to the cut-and-sewn garment; 'Pigment / garment dye' is the faded,
// tonal-seam vintage look. Prints in the tech pack header's WASH cell.
const WASHES = [
  'Raw (unwashed)',
  'Garment wash',
  'Enzyme wash',
  'Pigment / garment dye',
  'Vintage wash',
  'Mineral wash',
  'Stone wash',
  'Acid wash',
];

const GARMENTS = [
  {
    id: 'tee-navy',
    name: 'Navy Tee',
    category: 'T-Shirt',
    refNo: '6',
    season: 'FW26',
    silhouette: 'tee',
    assetKey: 'tee-navy',
    gsm: 250,
    fabric: 'Cotton Terry',
    colorway: { name: 'Navy Blazer', pantone: '19-3923 TCX', hex: '#282D3C' },
    print: { name: 'Pastel Yellow', pantone: '11-0616 TCX', hex: '#F2E6B1' },
    sizes: {
      S: { chest: 57,   length: 72,   shoulder: 20.3, sleeve: 20.75 },
      M: { chest: 59.5, length: 73,   shoulder: 20.6, sleeve: 21.25 },
      L: { chest: 62.5, length: 74.5, shoulder: 21,   sleeve: 22 },
    },
    pom: [
      { label: 'Chest width',   S: 57,    M: 59.5,  L: 62.5 },
      { label: 'Full length',   S: 72,    M: 73,    L: 74.5 },
      { label: 'Shoulder',      S: 20.3,  M: 20.6,  L: 21 },
      { label: 'Sleeve length', S: 20.75, M: 21.25, L: 22 },
    ],
    note: null,
  },
  {
    id: 'tee-burgundy',
    name: 'Burgundy Tee',
    category: 'T-Shirt',
    refNo: '9',
    season: 'FW26',
    silhouette: 'tee',
    assetKey: 'tee-burgundy',
    gsm: 250,
    fabric: 'Cotton Terry',
    colorway: { name: 'Burgundy', pantone: '19-1617 TCX', hex: '#64313E' },
    print: { name: 'Pastel Yellow', pantone: '11-0616 TCX', hex: '#F2E6B1' },
    sizes: {
      S: { chest: 57,   length: 72,   shoulder: 20.3, sleeve: 20.75 },
      M: { chest: 59.5, length: 73,   shoulder: 20.6, sleeve: 21.25 },
      L: { chest: 62.5, length: 74.5, shoulder: 21,   sleeve: 22 },
    },
    pom: [
      { label: 'Chest width',   S: 57,    M: 59.5,  L: 62.5 },
      { label: 'Full length',   S: 72,    M: 73,    L: 74.5 },
      { label: 'Shoulder',      S: 20.3,  M: 20.6,  L: 21 },
      { label: 'Sleeve length', S: 20.75, M: 21.25, L: 22 },
    ],
    note: 'Neck opening needs to be 1 cm smaller.',
  },
  {
    id: 'tank-quiet-shade',
    name: 'Quiet Shade Tank',
    category: 'Tank Top',
    refNo: '7',
    season: 'SS26',
    silhouette: 'tank',
    assetKey: 'tank',
    gsm: 250,
    fabric: 'Cotton Terry',
    colorway: { name: 'Quiet Shade', pantone: '18-4006 TCX', hex: '#66676D' },
    print: { name: "Baby's Breath", pantone: '11-0202 TCX', hex: '#E9E2D1' },
    sizes: {
      M: { chest: 55, length: 73.5, shoulder: 14, armholeCurve: 6, neckWidth: 29 },
    },
    pom: [
      { label: 'Side, armhole end to hem line length', M: 41 },
      { label: 'HSP to hem line',                      M: 73.5 },
      { label: 'CF (including rib)',                   M: 65 },
      { label: 'Shoulder end to armhole end length',   M: 29 },
      { label: 'Front neckline CF opening',             M: 9 },
      { label: 'Hem line to stitches',                  M: 2.5 },
      { label: 'Armhole to armhole opening',             M: 55 },
      { label: 'Armhole curve (center)',                 M: 6 },
      { label: 'Neck width (including neck rib)',        M: 29 },
      { label: 'Neck rib',                               M: '2 or 2.5' },
      { label: 'Shoulder',                                M: 14 },
    ],
    note: 'Only M sampled to date. S / L not yet graded.',
  },
  {
    id: 'longsleeve-navy',
    name: 'Navy Long Sleeve',
    category: 'Long Sleeve',
    refNo: '8',
    season: 'SS26',
    silhouette: 'longsleeve',
    assetKey: 'longsleeve',
    gsm: 250,
    fabric: 'Cotton Terry',
    colorway: { name: 'Navy Blazer', pantone: '19-3923 TCX', hex: '#282D3C' },
    print: { name: 'Bright White', pantone: '11-0601 TCX', hex: '#F4F5F0' },
    printBack: { name: 'Classic Blue', pantone: '19-4052 TCX', hex: '#0F4C81' },
    sizes: {
      S: { chest: 57,   length: 72,   shoulder: 20.3, sleeve: 54, sleeveWidth: 18, sleeveHem: 12 },
      M: { chest: 59.5, length: 73,   shoulder: 20.6, sleeve: 54, sleeveWidth: 18, sleeveHem: 12 },
      L: { chest: 62.5, length: 74.5, shoulder: 21,   sleeve: 54, sleeveWidth: 18, sleeveHem: 12 },
    },
    pom: [
      { label: 'Chest width',          S: 57, M: 59.5, L: 62.5 },
      { label: 'Full length',          S: 72, M: 73,   L: 74.5 },
      { label: 'Shoulder',             S: 20.3, M: 20.6, L: 21 },
      { label: 'Sleeve length',        M: 54 },
      { label: 'Inseam sleeve length', M: 49 },
      { label: 'Widest sleeve width',  M: 18 },
      { label: 'Sleeve hemline width', M: 12 },
    ],
    note: 'Sleeve points sampled at M only. Front logo + back print use separate colorways.',
  },
  {
    id: 'jacket-burgundy',
    name: 'Burgundy Jacket',
    category: 'Jacket',
    refNo: '5',
    season: 'FW26',
    silhouette: 'jacket',
    assetKey: 'jacket',
    gsm: 500,
    fabric: 'Cotton Fleece',
    colorway: { name: 'Burgundy', pantone: '19-1617 TCX', hex: '#64313E' },
    print: { name: 'Pastel Yellow', pantone: '11-0616 TCX', hex: '#F2E6B1' },
    sizes: {
      S: { chest: 59,   length: 65,   shoulder: 18,   sleeve: 59, sleeveWidth: 20,   sleeveHem: 12,   neckWidth: 22,   hemWidth: 58,   hood: 37 },
      M: { chest: 61.5, length: 66,   shoulder: 19.5, sleeve: 61, sleeveWidth: 21,   sleeveHem: 13.5, neckWidth: 23.5, hemWidth: 60,   hood: 37.5 },
    },
    pom: [
      { label: 'Neck opening flat',        S: 22,   M: 23.5 },
      { label: 'Neck front drop',          S: 9,    M: 9.4 },
      { label: 'Shoulder length',          S: 18,   M: 19.5 },
      { label: 'Sleeve length',            S: 59,   M: 61 },
      { label: 'Rib cuff width',           S: 6,    M: 6 },
      { label: 'Rib waistband width',      S: 6,    M: 6 },
      { label: 'Half chest width',         S: 59,   M: 61.5 },
      { label: 'Full length from HSP',     S: 65,   M: 66 },
      { label: 'Half armhole opening',     S: 29,   M: 30 },
      { label: 'Half hemline width',       S: 58,   M: 60 },
      { label: 'Half sleeve width',        S: 20,   M: 21 },
      { label: 'Half sleeve hemline width', S: 12,  M: 13.5 },
      { label: 'Pocket upper length',      S: 14,   M: 14.5 },
      { label: 'Pocket hemline length',    S: 17,   M: 17.5 },
      { label: 'Pocket HP',                S: 20,   M: 20.5 },
      { label: 'Pocket LP',                S: 7,    M: 7.5 },
      { label: 'Hood CF height',           S: 37,   M: 37.5 },
      { label: 'Half hood width (widest)', S: 26,   M: 27 },
    ],
    // Extracted verbatim from Jacket_techpack_SOAP_v1.pdf. Row 'c' is a
    // genuine blank in the source doc (letter reserved, no label/values) --
    // preserved as-is rather than renumbered. See assets/jacket_pom.png.
    pomKey: {
      headers: ['S', 'M', 'L', 'XL'],
      rows: [
        { key: 'a', label: 'Neck opening flat',        values: { S: '22',   M: '23,5', L: '-', XL: '-' } },
        { key: 'b', label: 'Neck front drop',          values: { S: '9',    M: '9,4',  L: '-', XL: '-' } },
        { key: 'c', label: '',                         values: { S: '-',    M: '-',    L: '-', XL: '-' } },
        { key: 'd', label: 'Shoulder length',          values: { S: '18',   M: '19,5', L: '-', XL: '-' } },
        { key: 'e', label: 'Sleeve length',            values: { S: '59',   M: '61',   L: '-', XL: '-' } },
        { key: 'f', label: 'Rib cuff width',           values: { S: '6',    M: '6',    L: '-', XL: '-' } },
        { key: 'g', label: 'Rib waistband width',      values: { S: '6',    M: '6',    L: '-', XL: '-' } },
        { key: 'h', label: 'Half chest width',         values: { S: '59',   M: '61,5', L: '-', XL: '-' } },
        { key: 'i', label: 'Full length from HSP',     values: { S: '65',   M: '66',   L: '-', XL: '-' } },
        { key: 'j', label: 'Half armhole opening',     values: { S: '29',   M: '30',   L: '-', XL: '-' } },
        { key: 'k', label: 'Half hemline width',       values: { S: '58',   M: '60',   L: '-', XL: '-' } },
        { key: 'l', label: 'Half sleeve width',        values: { S: '20',   M: '21',   L: '-', XL: '-' } },
        { key: 'm', label: 'Half sleeve hemline width', values: { S: '12',  M: '13,5', L: '-', XL: '-' } },
        { key: 'n', label: '1 pocket upper length',    values: { S: '14',   M: '14,5', L: '-', XL: '-' } },
        { key: 'o', label: '1 pocket hemline length',  values: { S: '17',   M: '17,5', L: '-', XL: '-' } },
        { key: 'p', label: '1 pocket HP',              values: { S: '20',   M: '20,5', L: '-', XL: '-' } },
        { key: 'q', label: '1 pocket LP',              values: { S: '7',    M: '7,5',  L: '-', XL: '-' } },
        { key: 'r', label: 'Hood CF height',           values: { S: '37',   M: '37,5', L: '-', XL: '-' } },
        { key: 's', label: 'Half hood width (widest)', values: { S: '26',   M: '27',   L: '-', XL: '-' } },
      ],
    },
    note: 'L and XL grade to be confirmed at sample stage.',
  },
  {
    id: 'hoodie',
    name: 'Hoodie',
    category: 'Hoodie',
    refNo: '1',
    season: 'FW26',
    silhouette: 'hoodie',
    assetKey: 'hoodie',
    gsm: 500,
    fabric: 'Cotton Fleece',
    colorway: { name: 'Colorway TBD', pantone: null, hex: '#3A3A3A' },
    print: { name: 'Print TBD', pantone: null, hex: '#F4F5F0' },
    sizes: {
      S: { chest: 59, length: 65, shoulder: 18,   sleeve: 59, sleeveWidth: 20,   sleeveHem: 12,   neckWidth: 22,   hemWidth: 46, hood: 50 },
      M: { chest: 61, length: 66, shoulder: 19.5, sleeve: 61, sleeveWidth: 21,   sleeveHem: 13.5, neckWidth: 23.5, hemWidth: 48, hood: 53 },
    },
    pom: [
      { label: 'Neck opening flat',                       S: 22,   M: 23.5 },
      { label: 'Neck drop front',                         S: 9,    M: 9.4 },
      { label: 'Shoulder to shoulder flat',                S: 57,   M: 59 },
      { label: 'Shoulder meas. on seam',                   S: 18,   M: 19.5 },
      { label: 'Width of chest, pit to pit flat',          S: 59,   M: 61.5 },
      { label: 'Front length, HSP to seam',                S: 65,   M: 66 },
      { label: 'Sleeve length, shoulder to seam',          S: 59,   M: 61 },
      { label: 'Sleeve length, inside seam',               S: 53.5, M: 55.5 },
      { label: '1/2 width of sleeve, meas. at 1/2 h',      S: 20,   M: 21 },
      { label: '1/2 sleeve opening at seam',                S: 12,   M: 13.5 },
      { label: '1/2 sleeve opening, end of sleeve relaxed', S: 7,    M: 8 },
      { label: 'Armhole front, straight across opening',    S: 29,   M: 30 },
      { label: 'Armhole back, straight across opening',     S: 28.5, M: 29.5 },
      { label: 'Pocket width at top',                       S: 25,   M: 26.5 },
      { label: 'Pocket height',                             S: 21,   M: 21.3 },
      { label: 'Pocket width at widest point',              S: 34,   M: 36 },
      { label: 'Pocket width bottom',                       S: 28,   M: 30 },
      { label: 'Pocket opening',                            S: 15,   M: 15 },
      { label: 'Center back length',                        S: 63,   M: 65 },
      { label: 'Neck drop back',                             S: 0.7, M: 0.7 },
      { label: 'Hood length at CB',                          S: 50,  M: 53 },
      { label: 'Hood width at widest point, meas. flat',     S: 30,  M: 31 },
      { label: 'Hood depth, edge to back',                   S: 26,  M: 27 },
      { label: 'Hood height',                                S: 37,  M: 37.5 },
      { label: '1/2 bottom opening, stretched, meas. on seam', S: 58, M: 60 },
      { label: '1/2 bottom opening, relaxed',                S: 46,  M: 48 },
      { label: 'Elastic height at sleeve',                    S: 6,  M: 6 },
      { label: 'Elastic height at bottom',                    S: 6,  M: 6 },
    ],
    // Lettered key + diagram data, extracted verbatim from the original
    // Hoodie_techpack_SOAP_v1.pdf via scripts/extract_pom_data.py. Feeds the
    // Studio tech pack export's "Measurements"/"Size Chart" pages
    // (assets/hoodie_pom.png is the matching diagram) -- not used by the
    // app's own live Measure tab, which keeps reading `pom` above unchanged.
    pomKey: {
      headers: ['S', 'M', 'L', 'XL'],
      rows: [
        { key: 'a',  label: 'Neck opening flat',                       values: { S: '22',   M: '23,5', L: '-', XL: '-' } },
        { key: 'b',  label: 'Neck drop front',                         values: { S: '9',    M: '9,4',  L: '-', XL: '-' } },
        { key: 'c',  label: 'Shoulder to shoulder flat',                values: { S: '57',   M: '59',   L: '-', XL: '-' } },
        { key: 'd',  label: 'Shoulder meas. on seam',                   values: { S: '18',   M: '19,5', L: '-', XL: '-' } },
        { key: 'e',  label: 'Width of chest, pit to pit flat',          values: { S: '59',   M: '61,5', L: '-', XL: '-' } },
        { key: 'f',  label: 'Front length, HSP to seam',                values: { S: '65',   M: '66',   L: '-', XL: '-' } },
        { key: 'g',  label: 'Sleeve length, shoulder to seam',          values: { S: '59',   M: '61',   L: '-', XL: '-' } },
        { key: 'h',  label: 'Sleeve length, inside seam',               values: { S: '53,5', M: '55,5', L: '-', XL: '-' } },
        { key: 'i',  label: '1/2 width of sleeve, meas. at 1/2 h',      values: { S: '20',   M: '21',   L: '-', XL: '-' } },
        { key: 'j',  label: '1/2 sleeve opening at seam',                values: { S: '12',   M: '13,5', L: '-', XL: '-' } },
        { key: 'k',  label: '1/2 sleeve opening, end of sleeve relaxed', values: { S: '7',    M: '8',    L: '-', XL: '-' } },
        { key: 'l',  label: 'Armhole front, straight across opening',    values: { S: '29',   M: '30',   L: '-', XL: '-' } },
        { key: 'm',  label: 'Armhole back, straight across opening',     values: { S: '28,5', M: '29,5', L: '-', XL: '-' } },
        { key: 'n',  label: 'Pocket width at top',                       values: { S: '25',   M: '26,5', L: '-', XL: '-' } },
        { key: 'o',  label: 'Pocket height',                             values: { S: '21',   M: '21,3', L: '-', XL: '-' } },
        { key: 'p',  label: 'Pocket width at widest point',              values: { S: '34',   M: '36',   L: '-', XL: '-' } },
        { key: 'q',  label: 'Pocket width bottom',                       values: { S: '28',   M: '30',   L: '-', XL: '-' } },
        { key: 'r',  label: 'Pocket opening',                            values: { S: '15',   M: '15',   L: '-', XL: '-' } },
        { key: 's',  label: 'Center back length',                        values: { S: '63',   M: '65',   L: '-', XL: '-' } },
        { key: 't',  label: 'Neck drop back',                            values: { S: '0,7',  M: '0,7',  L: '-', XL: '-' } },
        { key: 'u',  label: 'Hood length at CB',                         values: { S: '50',   M: '53',   L: '-', XL: '-' } },
        { key: 'v',  label: 'Hood width at widest point, meas. flat',    values: { S: '30',   M: '31',   L: '-', XL: '-' } },
        { key: 'w',  label: 'Hood depth, edge to back',                  values: { S: '26',   M: '27',   L: '-', XL: '-' } },
        { key: 'x',  label: 'Hood height',                               values: { S: '37',   M: '37,5', L: '-', XL: '-' } },
        { key: 'y',  label: '1/2 bottom opening, stretched, meas. on seam', values: { S: '58', M: '60',   L: '-', XL: '-' } },
        { key: 'z',  label: '1/2 bottom opening, relaxed',                values: { S: '46',  M: '48',   L: '-', XL: '-' } },
        { key: 'EL', label: 'Elastic height at sleeve',                   values: { S: '6',   M: '6',    L: '-', XL: '-' } },
        { key: 'EL', label: 'Elastic height at bottom',                   values: { S: '6',   M: '6',    L: '-', XL: '-' } },
      ],
    },
    note: 'Colorway not yet locked. L and XL grade to be confirmed at sample stage.',
  },
  {
    id: 'crewneck',
    name: 'Crewneck Sweater',
    category: 'Crewneck',
    refNo: '4',
    season: 'FW26',
    silhouette: 'crewneck',
    assetKey: 'crewneck',
    fabric: 'Cotton Fleece',
    colorway: { name: 'Colorway TBD', pantone: null, hex: '#4A4A4A' },
    print: { name: 'Print TBD', pantone: null, hex: '#F4F5F0' },
    sizes: {
      S: { chest: 59, length: 65, shoulder: 18, sleeve: 59, sleeveWidth: 20, sleeveHem: 12, neckWidth: 20, hemWidth: 58 },
    },
    pom: [
      { label: 'Neck opening flat',       S: 20 },
      { label: 'Neck front drop',         S: 10 },
      { label: 'Rib collar width',        S: 6 },
      { label: 'Shoulder length',         S: 18 },
      { label: 'Sleeve length',           S: 59 },
      { label: 'Rib cuff width',          S: 6 },
      { label: 'Rib waistband width',     S: 6 },
      { label: 'Half chest width',        S: 59 },
      { label: 'Full length from HSP',    S: 65 },
      { label: 'Half armhole opening',    S: 29 },
      { label: 'Half hemline width',      S: 58 },
      { label: 'Half sleeve width',       S: 20 },
      { label: 'Half sleeve hemline width', S: 12 },
    ],
    // Extracted verbatim from CrewneckSweater_techpack_SOAP_v1.pdf. Row 12
    // uses a capital 'L' key in the source (not lowercase 'l') -- preserved
    // as-is. See assets/crewneck_pom.png.
    pomKey: {
      headers: ['S', 'M', 'L', 'XL'],
      rows: [
        { key: 'a', label: 'Neck opening flat',        values: { S: '20', M: '-', L: '-', XL: '-' } },
        { key: 'b', label: 'Neck front drop',          values: { S: '10', M: '-', L: '-', XL: '-' } },
        { key: 'c', label: 'Rib collar width',         values: { S: '6',  M: '-', L: '-', XL: '-' } },
        { key: 'd', label: 'Shoulder length',          values: { S: '18', M: '-', L: '-', XL: '-' } },
        { key: 'e', label: 'Sleeve length',            values: { S: '59', M: '-', L: '-', XL: '-' } },
        { key: 'f', label: 'Rib cuff width',           values: { S: '6',  M: '-', L: '-', XL: '-' } },
        { key: 'g', label: 'Rib waistband width',      values: { S: '6',  M: '-', L: '-', XL: '-' } },
        { key: 'h', label: 'Half chest width',         values: { S: '59', M: '-', L: '-', XL: '-' } },
        { key: 'i', label: 'Full length from HSP',     values: { S: '65', M: '-', L: '-', XL: '-' } },
        { key: 'j', label: 'Half armhole opening',     values: { S: '29', M: '-', L: '-', XL: '-' } },
        { key: 'k', label: 'Half hemline width',       values: { S: '58', M: '-', L: '-', XL: '-' } },
        { key: 'L', label: 'Half sleeve width',        values: { S: '20', M: '-', L: '-', XL: '-' } },
        { key: 'm', label: 'Half sleeve hemline width', values: { S: '12', M: '-', L: '-', XL: '-' } },
      ],
    },
    note: 'Colorway not yet locked. Only S sampled to date, M through XL to be confirmed at sample stage.',
  },
];

/*
 * Seam-finish library. Each entry is one real construction/finish reference,
 * backed by a photo in assets/seams/ (normalized from assets/Stitching types/).
 * Chosen per garment part in the Studio's Seams tab and drawn as a labelled
 * callout on the tech pack's Seam Finish page.
 */
const SEAM_FINISHES = [
  { id: 'double-topstitch', name: 'Double topstitch',     desc: 'Overlock seam finished with a double topstitch on top', img: 'assets/seams/double-topstitch.jpg' },
  { id: 'taped-shoulder',   name: 'Taped shoulder seam',  desc: 'Shoulder seam taped, then double stitched',            img: 'assets/seams/taped-shoulder.jpg' },
  { id: 'neck-rib',         name: 'Ribbed neck',          desc: 'Rib collar, double stitched at the join',              img: 'assets/seams/neck-rib.jpg' },
  { id: 'ribbed-cuff',      name: 'Ribbed cuff',          desc: 'Rib cuff, double stitched at the join',                img: 'assets/seams/ribbed-cuff.jpg' },
  { id: 'ribbed-hem',       name: 'Ribbed hem band',      desc: 'Rib waistband, double stitched at the join',           img: 'assets/seams/ribbed-hem.jpg' },
  { id: 'hood-seam',        name: 'Hood seam',            desc: 'Double stitch with drawcord channel',                  img: 'assets/seams/hood-seam.jpg' },
  { id: 'pocket-double',    name: 'Pocket double stitch', desc: 'Patch pocket, double stitched edge',                   img: 'assets/seams/pocket-double.jpg' },
  { id: 'sleeve-attach',    name: 'Sleeve attach',        desc: 'Sleeve set in at the shoulder, overlock + topstitch',  img: 'assets/seams/sleeve-attach.jpg' },
  { id: 'hoodie-neck',      name: 'Hoodie neck seam',     desc: 'Front neck seam under the hood, double stitched',      img: 'assets/seams/hoodie-neck.jpg' },
];

/*
 * Construction points per silhouette, positioned on the FRONT flat-drawing
 * art as fractions (x from left, y from top) so they stay put at any render
 * size. `finish` is the default seam-finish id and `on` the default toggle
 * state (both editable in the Seams tab); `side` picks which margin the
 * callout thumbnail stacks in on the PDF page. Only parts left ON are drawn.
 * The shoulder is split into two selectable seams: `shoulder` (neck seam to
 * shoulder edge) and `sleeve-join` (where the sleeve is attached).
 * Keep each silhouette to <= 4 ON parts per side so the callouts don't crowd.
 */
const SEAM_PARTS = {
  tee: [
    { id: 'neck',        label: 'Neckline',       finish: 'neck-rib',         side: 'right', on: true, anchor: { x: 0.55, y: 0.05 } },
    { id: 'shoulder',    label: 'Shoulder seam',  finish: 'taped-shoulder',   side: 'left',  on: true, anchor: { x: 0.34, y: 0.10 } },
    { id: 'sleeve-join', label: 'Sleeve join',    finish: 'sleeve-attach',    side: 'left',  on: true, anchor: { x: 0.24, y: 0.16 } },
    { id: 'sleeve',      label: 'Sleeve hem',     finish: 'double-topstitch', side: 'left',  on: true, anchor: { x: 0.10, y: 0.30 } },
    { id: 'side',        label: 'Side seam',      finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.80, y: 0.52 } },
    { id: 'hem',         label: 'Bottom hem',     finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.50, y: 0.93 } },
  ],
  tank: [
    { id: 'neck',        label: 'Neckline',       finish: 'neck-rib',         side: 'right', on: true, anchor: { x: 0.56, y: 0.06 } },
    { id: 'shoulder',    label: 'Shoulder seam',  finish: 'taped-shoulder',   side: 'left',  on: true, anchor: { x: 0.35, y: 0.09 } },
    { id: 'armhole',     label: 'Armhole',        finish: 'double-topstitch', side: 'left',  on: true, anchor: { x: 0.22, y: 0.24 } },
    { id: 'side',        label: 'Side seam',      finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.78, y: 0.55 } },
    { id: 'hem',         label: 'Bottom hem',     finish: 'ribbed-hem',       side: 'right', on: true, anchor: { x: 0.50, y: 0.94 } },
  ],
  longsleeve: [
    { id: 'neck',        label: 'Neckline',       finish: 'neck-rib',         side: 'right', on: true, anchor: { x: 0.55, y: 0.05 } },
    { id: 'shoulder',    label: 'Shoulder seam',  finish: 'taped-shoulder',   side: 'left',  on: true, anchor: { x: 0.34, y: 0.10 } },
    { id: 'sleeve-join', label: 'Sleeve join',    finish: 'sleeve-attach',    side: 'left',  on: true, anchor: { x: 0.24, y: 0.17 } },
    { id: 'cuff',        label: 'Cuff',           finish: 'ribbed-cuff',      side: 'left',  on: true, anchor: { x: 0.08, y: 0.62 } },
    { id: 'side',        label: 'Side seam',      finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.80, y: 0.52 } },
    { id: 'hem',         label: 'Bottom hem',     finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.50, y: 0.93 } },
  ],
  crewneck: [
    { id: 'neck',        label: 'Rib collar',     finish: 'neck-rib',         side: 'right', on: true, anchor: { x: 0.55, y: 0.05 } },
    { id: 'shoulder',    label: 'Shoulder seam',  finish: 'taped-shoulder',   side: 'left',  on: true, anchor: { x: 0.34, y: 0.10 } },
    { id: 'sleeve-join', label: 'Sleeve join',    finish: 'sleeve-attach',    side: 'left',  on: true, anchor: { x: 0.24, y: 0.17 } },
    { id: 'cuff',        label: 'Rib cuff',       finish: 'ribbed-cuff',      side: 'left',  on: true, anchor: { x: 0.08, y: 0.62 } },
    { id: 'side',        label: 'Side seam',      finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.80, y: 0.52 } },
    { id: 'hem',         label: 'Rib hem',        finish: 'ribbed-hem',       side: 'right', on: true, anchor: { x: 0.50, y: 0.93 } },
  ],
  hoodie: [
    { id: 'hood',        label: 'Hood',           finish: 'hood-seam',        side: 'right', on: true, anchor: { x: 0.55, y: 0.07 } },
    { id: 'neck',        label: 'Neckline',       finish: 'hoodie-neck',      side: 'right', on: true, anchor: { x: 0.58, y: 0.22 } },
    { id: 'shoulder',    label: 'Shoulder seam',  finish: 'taped-shoulder',   side: 'left',  on: true, anchor: { x: 0.34, y: 0.20 } },
    { id: 'sleeve-join', label: 'Sleeve join',    finish: 'sleeve-attach',    side: 'left',  on: true, anchor: { x: 0.19, y: 0.28 } },
    { id: 'cuff',        label: 'Cuff',           finish: 'ribbed-cuff',      side: 'left',  on: true, anchor: { x: 0.10, y: 0.80 } },
    { id: 'pocket',      label: 'Pocket',         finish: 'pocket-double',    side: 'left',  on: true, anchor: { x: 0.38, y: 0.66 } },
    { id: 'hem',         label: 'Hem band',       finish: 'ribbed-hem',       side: 'right', on: true, anchor: { x: 0.55, y: 0.90 } },
    { id: 'side',        label: 'Side seam',      finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.82, y: 0.55 } },
  ],
  jacket: [
    { id: 'hood',        label: 'Hood',           finish: 'hood-seam',        side: 'right', on: true, anchor: { x: 0.55, y: 0.09 } },
    { id: 'shoulder',    label: 'Shoulder seam',  finish: 'taped-shoulder',   side: 'left',  on: true, anchor: { x: 0.34, y: 0.22 } },
    { id: 'sleeve-join', label: 'Sleeve join',    finish: 'sleeve-attach',    side: 'left',  on: true, anchor: { x: 0.24, y: 0.28 } },
    { id: 'cuff',        label: 'Cuff',           finish: 'ribbed-cuff',      side: 'left',  on: true, anchor: { x: 0.10, y: 0.66 } },
    { id: 'pocket',      label: 'Pocket',         finish: 'pocket-double',    side: 'left',  on: true, anchor: { x: 0.36, y: 0.68 } },
    { id: 'hem',         label: 'Hem band',       finish: 'ribbed-hem',       side: 'right', on: true, anchor: { x: 0.55, y: 0.86 } },
    { id: 'side',        label: 'Side seam',      finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.82, y: 0.58 } },
  ],
};

const LOGO_PATH = 'assets/logo.png';
