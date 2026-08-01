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
 * Real pixel-to-centimetre calibration per garment/view, measured off the
 * flat-drawing PNGs:
 *   pxPerCm  - scale factor, px per real centimetre
 *   hspY     - the shoulder reference row in px ("HSP", high shoulder point).
 *              This is the technical datum the POM front length is measured
 *              from. It is INVISIBLE on the drawing, which is why necklineY
 *              exists alongside it.
 *   necklineY - the collar edge AS DRAWN, i.e. the line a person points at and
 *              calls "the collar". It is NOT hspY, and the sign of the gap
 *              flips by garment type: on the hoodie front the hood V sits 4.1cm
 *              ABOVE HSP, while a tee's collar sits 6.6cm BELOW it. Reporting
 *              one "below collar" number hid an 11cm swing between garments.
 *   hemY     - the bottom of the BODY hem in px, the third vertical datum.
 *              Not the drawing's lowest ink: on the longsleeve front the cuffs
 *              hang below the hem. (hemY - hspY) / pxPerCm is the garment's
 *              collar-to-hem length, which tests assert against the POM.
 *   centerX  - horizontal garment centerline in px
 * These drive the widthCm / belowCollarCm / aboveHemCm figures app.js prints on
 * the tech pack PDF, so the factory cuts and prints to them.
 *
 * !! The old values from scripts/calibrate_studio_flats.py were WRONG. !!
 *
 * That script took chest_px as the median silhouette width across the middle
 * of the drawing. At that height the sleeves hang against the body and the
 * silhouette is one connected span, so it measured body PLUS both sleeves
 * while dividing by the body-only chest. It then placed HSP at the first row
 * reaching half that inflated width, which on a hooded garment lands inside
 * the hood rather than at the shoulder.
 *
 * Result: the hoodie read 12.902 px/cm against a true 9.479, about 36% high,
 * with HSP 69px (7cm) above the real shoulder. Every cm figure the app showed,
 * and every tech pack exported before 2026-07-21, carries those errors.
 *
 * Every value below is RECALIBRATED by backend/flats/calibrate_flats.py, which
 * uses whichever anchor a garment's drawing actually supports:
 *
 *   hooded (hoodie, jacket)  Scale from the ribbed hem band, the one body
 *                            feature that separates cleanly from sleeves
 *                            hanging against it. HSP is then derived from the
 *                            garment's front length rather than searched for,
 *                            because the hood sits above it.
 *   unhooded (the rest)      Scale from the body's own height. With nothing
 *                            drawn above the shoulder, the topmost inked row
 *                            IS HSP, so both ends of the length measurement
 *                            are directly readable.
 *
 * pxPerCm is per-image, so front and back legitimately differ where the two
 * flats were extracted at different resolutions. The longsleeve's views differ
 * by 17% and both correctly measure the garment at 69.7cm across.
 *
 * Regenerate with:  python3 -c "import sys; sys.path.insert(0,'.'); \
 *   from backend.flats.calibrate_flats import calibrate_flat; ..."
 * and re-run tests/test_flat_calibration.py, which checks each scale against
 * independent point-of-measure references rather than trusting it.
 */
const CALIBRATION = {
  'tee-navy': {
    front: { w: 1007, h: 1012, pxPerCm: 12.822, hspY: 38, necklineY: 122, hemY: 974, centerX: 490.0 },
    back: { w: 1033, h: 1014, pxPerCm: 12.822, hspY: 38, necklineY: 91, hemY: 974, centerX: 516.0 },
  },
  'tee-burgundy': {
    front: { w: 1031, h: 1011, pxPerCm: 12.795, hspY: 37, necklineY: 121, hemY: 971, centerX: 514.0 },
    back: { w: 1032, h: 1011, pxPerCm: 12.781, hspY: 38, necklineY: 89, hemY: 971, centerX: 516.0 },
  },
  // Cross-checked: widest body row measures 55cm, matching the POM
  // armhole-to-armhole opening.
  'tank': {
    front: { w: 768, h: 1145, pxPerCm: 14.531, hspY: 38, necklineY: 209, hemY: 1106, centerX: 384.0 },
    back: { w: 768, h: 1145, pxPerCm: 14.531, hspY: 38, necklineY: 96, hemY: 1106, centerX: 384.0 },
  },
  'longsleeve': {
    front: { w: 1060, h: 1149, pxPerCm: 14.151, hspY: 38, necklineY: 130, hemY: 1071, centerX: 530.0 },
    back: { w: 923, h: 997, pxPerCm: 12.137, hspY: 38, necklineY: 87, hemY: 924, centerX: 461.0 },
  },
  // Hem-band anchor, no second reference to cross-check against.
  'jacket': {
    front: { w: 1015, h: 1203, pxPerCm: 8.583, hspY: 468, necklineY: 420, hemY: 1035, centerX: 506.0 },
    back: { w: 1016, h: 1249, pxPerCm: 8.600, hspY: 513, necklineY: 198, hemY: 1081, centerX: 508.0 },
  },
  // Cross-checked against three independent POM references: hem band 9.42,
  // body length 9.76, sleeve opening at seam 10.07 px/cm.
  'hoodie': {
    front: { w: 941, h: 993, pxPerCm: 9.479, hspY: 217, necklineY: 178, hemY: 843, centerX: 470.0 },
    back: { w: 941, h: 1038, pxPerCm: 9.479, hspY: 262, necklineY: 114, hemY: 888, centerX: 471.0 },
  },
  'crewneck': {
    front: { w: 975, h: 1011, pxPerCm: 12.923, hspY: 38, necklineY: 70, hemY: 878, centerX: 487.0 },
    back: { w: 975, h: 1010, pxPerCm: 12.923, hspY: 38, necklineY: 43, hemY: 878, centerX: 487.0 },
  },
};

// Every SOAP brand color, selectable as a garment body color OR a print color.
// Group 1: the locked collection colorways (Pantone TCX, from context/business.md).
// Group 2: The Foundation brand palette (brand/figma_brief.md §Palette) -- digital
// brand colors, no TCX code (production would match to TCX at sampling if used).
const BRAND_SWATCHES = [
  // --- Collection colorways ---
  { name: 'Navy Blazer',    pantone: '19-3923 TCX', hex: '#282D3C', group: 'Collection' },
  { name: 'Burgundy',       pantone: '19-1617 TCX', hex: '#64313E', group: 'Collection' },
  { name: 'Quiet Shade',    pantone: '18-4006 TCX', hex: '#66676D', group: 'Collection' },
  { name: 'Classic Blue',   pantone: '19-4052 TCX', hex: '#0F4C81', group: 'Collection' },
  { name: 'Pastel Yellow',  pantone: '11-0616 TCX', hex: '#F2E6B1', group: 'Collection' },
  { name: 'Bright White',   pantone: '11-0601 TCX', hex: '#F4F5F0', group: 'Collection' },
  { name: "Baby's Breath",  pantone: '11-0202 TCX', hex: '#E9E2D1', group: 'Collection' },
  // --- The Foundation brand palette ---
  { name: 'Signal Red',     pantone: null, hex: '#7F0304', group: 'Foundation' },
  { name: 'Ink',            pantone: null, hex: '#2A2A2A', group: 'Foundation' },
  { name: 'Walnut',         pantone: null, hex: '#5C4A3B', group: 'Foundation' },
  { name: 'Mint Sage',      pantone: null, hex: '#AECCC3', group: 'Foundation' },
  { name: 'Powder Blue',    pantone: null, hex: '#C8D8E0', group: 'Foundation' },
  { name: 'Sky Blue',       pantone: null, hex: '#5E83AE', group: 'Foundation' },
  { name: 'Charcoal',       pantone: null, hex: '#6B6B6B', group: 'Foundation' },
  { name: 'Mid Grey',       pantone: null, hex: '#AAAAAA', group: 'Foundation' },
  { name: 'Light Grey',     pantone: null, hex: '#F0F0F0', group: 'Foundation' },
  { name: 'Cream Warm',     pantone: null, hex: '#F9F5ED', group: 'Foundation' },
  { name: 'Cream Pale',     pantone: null, hex: '#F0EDE4', group: 'Foundation' },
  { name: 'Cream Soft',     pantone: null, hex: '#F0EEDF', group: 'Foundation' },
];

// Fabric constructions offered in the studio. Curated from common premium
// streetwear construction (knits for tops/sweats, wovens for outerwear/bottoms,
// plus blends). 'Cotton Fleece' and 'Cotton Terry' stay first as the current
// collection defaults referenced by the garments below.
const FABRICS = [
  // Knits (tees, sweats, hoodies)
  'Cotton Fleece',
  'Cotton Terry',
  'French Terry',
  'Brushed-Back Fleece',
  'Loopback Terry',
  'Cotton Jersey',
  'Combed Ringspun Jersey',
  'Heavyweight Jersey',
  'Slub Jersey',
  'Waffle Knit (Thermal)',
  'Rib Knit',
  'Piqué',
  'Interlock',
  'Sherpa Fleece',
  // Wovens (jackets, shirts, bottoms)
  'Cotton Twill',
  'Brushed Twill',
  'Cotton Canvas',
  'Duck Canvas',
  'Ripstop',
  'Corduroy',
  'Denim',
  'Oxford Cotton',
  'Poplin',
  'Nylon Shell',
  'Melton Wool',
  // Blends
  'Poly-Cotton Blend',
  'Tri-Blend',
  'Cotton-Spandex Jersey',
];

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

// ---------------------------------------------------------------------------
// FABRIC & FINISHING SPEC
//
// Source: context/fabric_quality_guide.md (written 2026-07-28 after a 500 GSM
// sample came back correct on weight and measurements and still read cheap).
//
// The rule: GSM measures density, NOT quality. These are the fields that
// actually decide whether a 500 GSM hoodie looks like 30 EUR or 300 EUR, and
// they are exactly the fields factories substitute quietly when a tech pack
// stays silent on them. Every field below prints on the tech pack's
// Fabric & Finishing page.
//
// `preferred` marks the premium answer. Anything else is flagged on the PDF so
// a downgrade cannot pass unnoticed. `note` explains why it matters, and shows
// as the hint under the field in the studio.
// ---------------------------------------------------------------------------
const FABRIC_SPEC_GROUPS = [
  {
    group: 'Yarn',
    fields: [
      {
        key: 'yarnSpinning',
        label: 'Yarn spinning',
        options: ['Ring-spun, compact spun', 'Ring-spun', 'Open-end / rotor-spun', 'Not specified'],
        preferred: 'Ring-spun, compact spun',
        note: 'Open-end is 15-25% weaker and coarser. Its loose fibre ends are what create surface fuzz and pilling.',
      },
      {
        key: 'stapleLength',
        label: 'Staple length',
        options: ['Long staple, combed', 'Long staple, carded', 'Short staple, combed', 'Short staple, carded', 'Not specified'],
        preferred: 'Long staple, combed',
        note: 'Combing removes the short fibres (15-20% of the batch). Every short fibre has two ends, and every end eventually becomes a pill.',
      },
      {
        key: 'yarnCount',
        label: 'Yarn count (face)',
        type: 'text',
        placeholder: 'e.g. 20/1',
        preferred: '20/1',
        note: 'Benchmark: 20/1 (Rovo Assembly publish this on their 500 GSM hoodie). 16/1 for a heavier hand.',
      },
      {
        key: 'layInYarn',
        label: 'Lay-in / backing yarn',
        options: ['Ring-spun cotton', 'Open-end cotton', 'Polyester', 'Cotton / poly blend', 'Not specified'],
        preferred: 'Ring-spun cotton',
        note: 'THE detail nobody specifies. It is the layer that touches skin and the layer that pills. Cheap mills substitute open-end or poly here because "nobody sees it".',
      },
    ],
  },
  {
    group: 'Knit construction',
    fields: [
      {
        key: 'knitConstruction',
        label: 'Construction',
        options: [
          '3-end (3-thread) brushed-back fleece',
          '2-end (2-thread) fleece',
          'Loopback French terry (unbrushed)',
          'Single jersey',
          'Not specified',
        ],
        preferred: '3-end (3-thread) brushed-back fleece',
        note: 'The third yarn is a tie yarn locking the front and back layers together. Without it a 500 GSM fleece is just heavy fabric that droops.',
      },
      {
        key: 'knitFace',
        label: 'Knit face',
        options: ['Plain / flat jersey face', 'Diagonal', 'Not specified'],
        preferred: 'Plain / flat jersey face',
        note: 'Diagonal comes off a cheaper machine setup and shows a visible twill-like slant.',
      },
      {
        key: 'brushing',
        label: 'Brushing',
        options: [
          'Single light pass, inside face only',
          'Two-pass brushing',
          'Heavy multi-pass brushing',
          'None (unbrushed)',
        ],
        preferred: 'Single light pass, inside face only',
        note: 'Over-brushing shreds fibres. That is what makes fleece shed, pill, and collapse on camera. More brushing is not more premium.',
      },
      {
        key: 'fabricFinishing',
        label: 'Fabric finishing',
        options: ['Open-width', 'Tubular', 'Not specified'],
        preferred: 'Open-width',
        note: 'Open-width prevents the garment twisting at the side seam after washing. Tubular is cheaper and twists.',
      },
      {
        key: 'shrinkage',
        label: 'Shrinkage',
        type: 'text',
        placeholder: 'e.g. Pre-shrunk, max 3% after 3 washes',
        preferred: 'Pre-shrunk, max 3% after 3 washes',
        note: 'Sanforized / pre-shrunk. Garment dyeing already shrinks the piece in the vat.',
      },
    ],
  },
  {
    group: 'Wet processing & finishing',
    fields: [
      {
        key: 'enzymeWash',
        label: 'Enzyme wash / bio-polish',
        options: ['Enzyme wash / bio-polish (required)', 'None'],
        preferred: 'Enzyme wash / bio-polish (required)',
        note: 'Cellulase enzymes eat the loose surface fibres off. Removes fuzz, kills future pilling, softens the hand.',
      },
      {
        key: 'dyeMethod',
        label: 'Dye method',
        options: ['Garment dyed', 'Piece dyed', 'Pigment dyed', 'Yarn dyed', 'Not specified'],
        preferred: 'Garment dyed',
        note: 'Sew raw, then dye the finished piece. Softer hand, deeper tone, subtle variation across seams, no first-wash shrinkage.',
      },
      {
        key: 'softener',
        label: 'Softener',
        options: ['Silicone softener', 'None'],
        preferred: 'Silicone softener',
        note: 'The final chemical pass that produces the "expensive" hand feel.',
      },
    ],
  },
  {
    group: 'Trims',
    fields: [
      {
        key: 'ribConstruction',
        label: 'Rib construction',
        options: ['2x1 rib', '1x1 rib', 'Not specified'],
        preferred: '2x1 rib',
        note: 'Deeper, denser, more sculpted than 1x1.',
      },
      {
        key: 'ribComposition',
        label: 'Rib composition',
        options: ['95% cotton / 5% elastane', '97% cotton / 3% elastane', '100% cotton (no elastane)', 'Not specified'],
        preferred: '95% cotton / 5% elastane',
        note: 'Without elastane the cuffs hang open by week six, and once cuffs and hem go the whole silhouette collapses.',
      },
      {
        key: 'neckTape',
        label: 'Neck tape',
        options: ['Self-fabric, shoulder to shoulder', 'Poly tape', 'None'],
        preferred: 'Self-fabric, shoulder to shoulder',
        note: 'The first thing anyone does when they pick up a hoodie is look inside the collar.',
      },
    ],
  },
  {
    group: 'Construction',
    fields: [
      {
        key: 'spi',
        label: 'Stitch density (SPI)',
        type: 'text',
        placeholder: 'e.g. 10-12',
        preferred: '10-12',
        note: 'Below 8 causes seam slippage. Above 14 the needle cuts the fabric.',
      },
      {
        key: 'hemStitch',
        label: 'Hem & cuff stitch',
        options: ['Chainstitch (ISO 401)', 'Coverstitch', 'Lockstitch', 'Not specified'],
        preferred: 'Chainstitch (ISO 401)',
        note: 'Roughly twice the thread per inch, and it stretches with the fabric instead of popping.',
      },
      {
        key: 'thread',
        label: 'Thread',
        options: ['Core-spun polyester, colour matched', 'Spun polyester', 'Not specified'],
        preferred: 'Core-spun polyester, colour matched',
        note: 'Core-spun holds seam strength on heavyweight knits.',
      },
    ],
  },
];

// Flat lookup, used by the studio and the export payload.
const FABRIC_SPEC_FIELDS = FABRIC_SPEC_GROUPS.flatMap(g => g.fields);

// Defaults = the premium answer for every field. The studio opens on the
// correct spec, and any downgrade is a deliberate act rather than an omission.
const FABRIC_SPEC_DEFAULT = Object.fromEntries(
  FABRIC_SPEC_FIELDS.map(f => [f.key, f.preferred])
);

// Documents the factory has to return WITH the sample. Without these the spec
// above is a claim, not a verified fact. Prints under the spec table.
const FABRIC_SPEC_REQUIREMENTS = [
  'Fabric swatch, unwashed AND washed',
  'Yarn spec sheet: spinning type, staple length and count for face, tie and lay-in yarns',
  'Lab dips for the body colourway, minimum 3 options against the Pantone TCX reference',
  'Pilling test result (Martindale or ICI), minimum rating 3-4',
  'Shrinkage test result after 3 domestic washes',
];

const GARMENTS = [
  {
    id: 'tee-navy',
    name: 'Tee',
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
    name: 'Tee',
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
    name: 'Tank',
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
    name: 'Long Sleeve',
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
    name: 'Jacket',
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
    { id: 'neck',        label: 'Neckline',       finish: 'neck-rib',         side: 'right', on: true, anchor: { x: 0.5, y: 0.118 } },
    { id: 'shoulder',    label: 'Shoulder seam',  finish: 'taped-shoulder',   side: 'left',  on: true, anchor: { x: 0.271, y: 0.099 } },
    { id: 'sleeve-join', label: 'Sleeve join',    finish: 'sleeve-attach',    side: 'left',  on: true, anchor: { x: 0.162, y: 0.2 } },
    { id: 'sleeve',      label: 'Sleeve hem',     finish: 'double-topstitch', side: 'left',  on: true, anchor: { x: 0.077, y: 0.545 } },
    { id: 'side',        label: 'Side seam',      finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.777, y: 0.665 } },
    { id: 'hem',         label: 'Bottom hem',     finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.5, y: 0.94 } },
  ],
  tank: [
    { id: 'neck',        label: 'Neckline',       finish: 'neck-rib',         side: 'right', on: true, anchor: { x: 0.512, y: 0.176 } },
    { id: 'shoulder',    label: 'Shoulder seam',  finish: 'taped-shoulder',   side: 'left',  on: true, anchor: { x: 0.169, y: 0.083 } },
    { id: 'armhole',     label: 'Armhole',        finish: 'double-topstitch', side: 'left',  on: true, anchor: { x: 0.14, y: 0.299 } },
    { id: 'side',        label: 'Side seam',      finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.948, y: 0.561 } },
    { id: 'hem',         label: 'Bottom hem',     finish: 'ribbed-hem',       side: 'right', on: true, anchor: { x: 0.5, y: 0.94 } },
  ],
  longsleeve: [
    { id: 'neck',        label: 'Neckline',       finish: 'neck-rib',         side: 'right', on: true, anchor: { x: 0.497, y: 0.052 } },
    { id: 'shoulder',    label: 'Shoulder seam',  finish: 'taped-shoulder',   side: 'left',  on: true, anchor: { x: 0.261, y: 0.093 } },
    { id: 'sleeve-join', label: 'Sleeve join',    finish: 'sleeve-attach',    side: 'left',  on: true, anchor: { x: 0.161, y: 0.194 } },
    { id: 'cuff',        label: 'Cuff',           finish: 'ribbed-cuff',      side: 'left',  on: true, anchor: { x: 0.089, y: 0.953 } },
    { id: 'side',        label: 'Side seam',      finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.803, y: 0.618 } },
    { id: 'hem',         label: 'Bottom hem',     finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.515, y: 0.925 } },
  ],
  crewneck: [
    { id: 'neck',        label: 'Rib collar',     finish: 'neck-rib',         side: 'right', on: true, anchor: { x: 0.5, y: 0.05 } },
    { id: 'shoulder',    label: 'Shoulder seam',  finish: 'taped-shoulder',   side: 'left',  on: true, anchor: { x: 0.293, y: 0.101 } },
    { id: 'sleeve-join', label: 'Sleeve join',    finish: 'sleeve-attach',    side: 'left',  on: true, anchor: { x: 0.22, y: 0.19 } },
    { id: 'cuff',        label: 'Rib cuff',       finish: 'ribbed-cuff',      side: 'left',  on: true, anchor: { x: 0.11, y: 0.88 } },
    { id: 'side',        label: 'Side seam',      finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.774, y: 0.584 } },
    { id: 'hem',         label: 'Rib hem',        finish: 'ribbed-hem',       side: 'right', on: true, anchor: { x: 0.5, y: 0.79 } },
  ],
  hoodie: [
    { id: 'hood',        label: 'Hood',           finish: 'hood-seam',        side: 'right', on: true, anchor: { x: 0.5, y: 0.06 } },
    { id: 'neck',        label: 'Neckline',       finish: 'hoodie-neck',      side: 'right', on: true, anchor: { x: 0.5, y: 0.19 } },
    { id: 'shoulder',    label: 'Shoulder seam',  finish: 'taped-shoulder',   side: 'left',  on: true, anchor: { x: 0.27, y: 0.171 } },
    { id: 'sleeve-join', label: 'Sleeve join',    finish: 'sleeve-attach',    side: 'left',  on: true, anchor: { x: 0.2, y: 0.28 } },
    { id: 'cuff',        label: 'Cuff',           finish: 'ribbed-cuff',      side: 'left',  on: true, anchor: { x: 0.11, y: 0.89 } },
    { id: 'pocket',      label: 'Pocket',         finish: 'pocket-double',    side: 'left',  on: true, anchor: { x: 0.38, y: 0.66 } },
    { id: 'hem',         label: 'Hem band',       finish: 'ribbed-hem',       side: 'right', on: true, anchor: { x: 0.5, y: 0.81 } },
    { id: 'side',        label: 'Side seam',      finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.776, y: 0.603 } },
  ],
  jacket: [
    { id: 'hood',        label: 'Hood',           finish: 'hood-seam',        side: 'right', on: true, anchor: { x: 0.5, y: 0.07 } },
    { id: 'shoulder',    label: 'Shoulder seam',  finish: 'taped-shoulder',   side: 'left',  on: true, anchor: { x: 0.232, y: 0.156 } },
    { id: 'sleeve-join', label: 'Sleeve join',    finish: 'sleeve-attach',    side: 'left',  on: true, anchor: { x: 0.23, y: 0.26 } },
    { id: 'cuff',        label: 'Cuff',           finish: 'ribbed-cuff',      side: 'left',  on: true, anchor: { x: 0.099, y: 0.893 } },
    { id: 'pocket',      label: 'Pocket',         finish: 'pocket-double',    side: 'left',  on: true, anchor: { x: 0.36, y: 0.66 } },
    { id: 'hem',         label: 'Hem band',       finish: 'ribbed-hem',       side: 'right', on: true, anchor: { x: 0.5, y: 0.81 } },
    { id: 'side',        label: 'Side seam',      finish: 'double-topstitch', side: 'right', on: true, anchor: { x: 0.762, y: 0.689 } },
  ],
};

const LOGO_PATH = 'assets/logo.png';

// Fonts offered by the Print tab's text tool. Brand fonts first (already loaded
// in the page head), then a curated set across categories, loaded on demand from
// Google Fonts the first time each is used. `name` is the exact CSS family.
const PRINT_FONTS = [
  { name: 'Roboto Condensed', cat: 'Brand',     brand: true },
  { name: 'Roboto',           cat: 'Brand',     brand: true },
  { name: 'Shrikhand',        cat: 'Brand',     brand: true },
  // Display / heavy
  { name: 'Anton',            cat: 'Display' },
  { name: 'Bebas Neue',       cat: 'Display' },
  { name: 'Oswald',           cat: 'Display' },
  { name: 'Archivo Black',    cat: 'Display' },
  { name: 'Alfa Slab One',    cat: 'Display' },
  { name: 'Staatliches',      cat: 'Display' },
  { name: 'Teko',             cat: 'Display' },
  { name: 'Fjalla One',       cat: 'Display' },
  { name: 'Passion One',      cat: 'Display' },
  { name: 'Titan One',        cat: 'Display' },
  { name: 'Bungee',           cat: 'Display' },
  { name: 'Righteous',        cat: 'Display' },
  { name: 'Black Ops One',    cat: 'Display' },
  { name: 'Monoton',          cat: 'Display' },
  { name: 'Rubik Mono One',   cat: 'Display' },
  { name: 'Unbounded',        cat: 'Display' },
  { name: 'Syne',             cat: 'Display' },
  { name: 'Orbitron',         cat: 'Display' },
  { name: 'Chakra Petch',     cat: 'Display' },
  // Sans
  { name: 'Inter',            cat: 'Sans' },
  { name: 'Montserrat',       cat: 'Sans' },
  { name: 'Poppins',          cat: 'Sans' },
  { name: 'Work Sans',        cat: 'Sans' },
  { name: 'DM Sans',          cat: 'Sans' },
  { name: 'Manrope',          cat: 'Sans' },
  { name: 'Barlow',           cat: 'Sans' },
  { name: 'Barlow Condensed', cat: 'Sans' },
  { name: 'Rubik',            cat: 'Sans' },
  { name: 'Archivo',          cat: 'Sans' },
  { name: 'Josefin Sans',     cat: 'Sans' },
  { name: 'Space Grotesk',    cat: 'Sans' },
  { name: 'Sora',             cat: 'Sans' },
  // Serif
  { name: 'Playfair Display', cat: 'Serif' },
  { name: 'DM Serif Display', cat: 'Serif' },
  { name: 'Libre Baskerville', cat: 'Serif' },
  { name: 'Lora',             cat: 'Serif' },
  { name: 'Cormorant Garamond', cat: 'Serif' },
  { name: 'EB Garamond',      cat: 'Serif' },
  { name: 'Bodoni Moda',      cat: 'Serif' },
  { name: 'Abril Fatface',    cat: 'Serif' },
  // Mono
  { name: 'Space Mono',       cat: 'Mono' },
  { name: 'JetBrains Mono',   cat: 'Mono' },
  { name: 'IBM Plex Mono',    cat: 'Mono' },
  { name: 'Roboto Mono',      cat: 'Mono' },
  // Script / hand
  { name: 'Pacifico',         cat: 'Script' },
  { name: 'Caveat',           cat: 'Script' },
  { name: 'Dancing Script',   cat: 'Script' },
  { name: 'Satisfy',          cat: 'Script' },
  { name: 'Permanent Marker', cat: 'Script' },
];
