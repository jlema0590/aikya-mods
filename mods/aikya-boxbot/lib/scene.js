/** Decorative conveyor: an eight-second linear loop at eight frames/second. */
export const FRAME_MS = 125;
export const FRAME_COUNT = 64;

export function sampleScene(frame) {
  const f = ((Math.floor(frame) % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT;
  const distance = f * 660 / FRAME_COUNT;
  return {
    frame: f,
    phase: 'Conveyor running',
    distance,
    beltOffset: distance % 16,
    boxes: [0, 220, 440].map(offset => ({ x: (distance + offset) % 660 - 60, y: 84 })),
  };
}

function crate(x, y) {
  return `<g transform="translate(${x} ${y})"><rect width="44" height="40" rx="3" class="crate"/><path d="M16 0v13l6-3 6 3V0M0 15h44" class="tape"/><path d="M8 31h10" class="ink"/></g>`;
}

export function svgFrame(frame) {
  const s = sampleScene(frame);
  const rollers = Array.from({ length: 17 }, (_, i) => {
    const x = 64 + i * 32;
    return `<g transform="translate(${x} 138)"><circle r="8" fill="var(--roller)" class="edge"/><g transform="rotate(${s.distance * 3})"><path d="M-5 0h10M0-5v10" class="ink"/></g></g>`;
  }).join('');
  const tread = Array.from({ length: 37 }, (_, i) => `<path d="M${32 + i * 16 + s.beltOffset} 124v4" stroke="var(--tread)" stroke-width="4"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 210" width="640" height="210" role="img" aria-label="Boxes moving from left to right on a conveyor belt">
<style>
:root{color-scheme:light dark;--bg:#f6f3ed;--floor:#d9d4c9;--line:#47483f;--belt:#b8bba9;--roller:#e4e5da;--tread:#777f6b;--box:#c88d55;--tape:#f1d4a4;--muted:#77786c}
@media(prefers-color-scheme:dark){:root{--bg:#242622;--floor:#42483e;--line:#a5b09e;--belt:#65745b;--roller:#33402f;--tread:#c1cfb6;--box:#c49462;--tape:#e8c994;--muted:#a9b19e}}
.edge{stroke:var(--line);stroke-width:2;stroke-linejoin:round}.crate{fill:var(--box);stroke:var(--line);stroke-width:2}.tape{fill:none;stroke:var(--tape);stroke-width:3}.ink{fill:none;stroke:var(--line);stroke-width:2}.label{fill:var(--muted);font:11px ui-monospace,monospace;letter-spacing:2px}
</style>
<defs><clipPath id="boxbot-belt-clip"><rect x="48" y="38" width="544" height="87"/></clipPath><clipPath id="boxbot-tread-clip"><rect x="48" y="123" width="544" height="6" rx="3"/></clipPath></defs>
<rect width="640" height="210" rx="12" fill="var(--bg)"/>
<path d="M32 186H608" stroke="var(--floor)" stroke-width="2"/>
<path d="M96 152v29M544 152v29" stroke="var(--line)" stroke-width="6"/>
<path d="M78 182h36M526 182h36" stroke="var(--belt)" stroke-width="5" stroke-linecap="round"/>
<rect x="48" y="124" width="544" height="28" rx="14" fill="var(--belt)" class="edge"/>
${rollers}
<g clip-path="url(#boxbot-tread-clip)">${tread}</g>
<g clip-path="url(#boxbot-belt-clip)">${s.boxes.map(box => crate(box.x, box.y)).join('')}</g>
<text x="48" y="205" class="label">IN</text><text x="560" y="205" class="label">OUT</text>
</svg>`;
}

export function asciiFrame(frame, width = 44) {
  const s = sampleScene(frame);
  const columns = Math.max(1, Math.min(60, Math.floor(width) || 44));
  const grid = Array.from({ length: 7 }, () => Array(columns).fill(' '));
  const put = (x, y, value) => {
    for (let i = 0; i < value.length; i++) {
      if (x + i >= 0 && x + i < columns) grid[y][x + i] = value[i];
    }
  };
  for (const box of s.boxes) {
    const x = Math.round((box.x - 48) / 544 * columns);
    put(x, 0, '+--+'); put(x, 1, '|::|'); put(x, 2, '+--+');
  }
  put(0, 3, '='.repeat(columns));
  const shift = Math.floor(s.distance / 544 * columns) % 6;
  for (let x = shift; x < columns; x += 6) put(x, 3, '>');
  for (let x = 1; x < columns; x += 4) put(x, 4, 'o');
  put(Math.floor(columns / 6), 5, '|'); put(Math.floor(columns * 5 / 6), 5, '|');
  put(0, 6, 'IN'); put(Math.max(0, columns - 3), 6, 'OUT');
  return grid.map(row => row.join('')).join('\n');
}
