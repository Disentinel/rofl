// A picture's icons and colours. An icon is SVG text, the renderer's own below or a notebook's (`The icon I is drawn as S`), and it is only ever
// drawn as an image, from a data: URI: as an image an SVG runs no script and loads nothing. A colour is a CSS name or a #hex, or it is not one.

/** The most SVG text an icon may be. */
export const ICON_MAX = 16 * 1024;

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32" fill="currentColor" stroke="#2d3330" stroke-width="1.5" stroke-linejoin="round">${body}</svg>`;
const glass = 'fill="#fff" fill-opacity=".75"', tyre = 'fill="#2d3330"';
/** The renderer's own icons. `currentColor` is the part a colour paints. */
export const ICONS: Record<string, string> = Object.fromEntries(Object.entries({
  car: `<path d="M3 21v-5l4-1 4-5h9l5 5 4 1v5z"/><path d="M12 11.5h7l2.5 3.5H9.5z" ${glass}/><circle cx="9" cy="22" r="3" ${tyre}/><circle cx="23" cy="22" r="3" ${tyre}/>`,
  van: `<path d="M3 22V9h17l6 6 3 1v6z"/><path d="M21 10.5l4 4.5h-4z" ${glass}/><circle cx="9" cy="23" r="3" ${tyre}/><circle cx="23" cy="23" r="3" ${tyre}/>`,
  truck: `<path d="M2 21V8h17v13z"/><path d="M19 12h6l4 5v4H19z"/><path d="M21 13.5h3.5l2.5 3.5h-6z" ${glass}/><circle cx="8" cy="23" r="3" ${tyre}/><circle cx="24" cy="23" r="3" ${tyre}/>`,
  bike: `<g fill="none" stroke-width="2"><circle cx="8" cy="21" r="5"/><circle cx="24" cy="21" r="5"/><path d="M8 21l5-9h9l2 9M13 12l5 9 4-9M11 9h5M22 12l-1-4h3" stroke="currentColor" stroke-width="2.5"/></g>`,
  scooter: `<g fill="none" stroke-width="2"><circle cx="7" cy="24" r="3.5"/><circle cx="25" cy="24" r="3.5"/></g><path d="M9 21h12l3-14h3" fill="none" stroke="currentColor" stroke-width="3"/><path d="M8 19h11v3H8z"/>`,
  engine: `<path d="M6 11h14l3 3h4v10h-4l-3 3H9l-3-3z"/><path d="M10 7h8v4h-8z"/><path d="M3 15v6" stroke-width="3"/>`,
  wheel: `<circle cx="16" cy="16" r="12" ${tyre}/><circle cx="16" cy="16" r="6"/><circle cx="16" cy="16" r="2" ${tyre}/>`,
  seat: `<path d="M8 4h8l1 14H9z"/><path d="M8 18h16v5H8z"/><path d="M10 23v6M22 23v6" stroke-width="2.5"/>`,
  frame: `<path d="M6 24l7-14h13l-5 14zM13 10l8 14" fill="none" stroke="currentColor" stroke-width="3"/>`,
  door: `<path d="M8 3h16v26H8z"/><path d="M11 6h10v9H11z" ${glass}/><path d="M19 19h3" stroke-width="2.5"/>`,
  motor: `<rect x="4" y="8" width="19" height="16" rx="3"/><path d="M23 13.5h6v5h-6z"/><path d="M15 10l-4 7h5l-3 5" fill="none" stroke="#fff" stroke-width="2"/>`,
  paint_can: `<path d="M6 10h20v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><ellipse cx="16" cy="10" rx="10" ry="3" fill="#fff"/><path d="M6 10c0-8 20-8 20 0" fill="none"/>`,
  store: `<path d="M4 13h24v16H4z"/><path d="M2 13l4-8h20l4 8z" fill="#fff"/><path d="M13 29v-9h6v9z" fill="#fff"/>`,
  gate: `<path d="M5 29V6h4v23z"/><path d="M9 11h20v5H9z" fill="#fff"/><path d="M13 11l-3 5M19 11l-3 5M25 11l-3 5" stroke="currentColor" stroke-width="3"/>`,
  body: `<path d="M3 23v-6l4-1 4-6h9l5 6 4 1v6z"/><path d="M12 11.5h7l3 4.5H9.5z" ${glass}/>`,
  panel: `<path d="M5 6l20-2 2 22-20 2z"/><path d="M9 10l14-1M9 14l14-1" fill="none" stroke-opacity=".5"/>`,
  cab: `<path d="M4 27V9h14l8 8v10z"/><path d="M8 12h9l5 5H8z" ${glass}/>`,
  chassis: `<path d="M3 11h26M3 21h26" fill="none" stroke="currentColor" stroke-width="3"/><path d="M7 11v10M16 11v10M25 11v10" fill="none" stroke-width="2.5"/>`,
  axle: `<path d="M8 16h16" stroke-width="3"/><rect x="2" y="8" width="7" height="16" rx="2"/><rect x="23" y="8" width="7" height="16" rx="2"/>`,
  mirror: `<ellipse cx="18" cy="12" rx="9" ry="7"/><ellipse cx="18" cy="12" rx="6" ry="4" fill="#cfe3ee"/><path d="M12 18l-6 9" stroke-width="3"/>`,
}).map(([k, b]) => [k, svg(b)]));

const NAMED = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral '
  + 'cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred '
  + 'darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite '
  + 'forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen '
  + 'lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray '
  + 'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue '
  + 'mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid '
  + 'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon '
  + 'sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white '
  + 'whitesmoke yellow yellowgreen').split(' '));
/** A colour a notebook may give a tag: a CSS colour name or a #hex of 3, 4, 6 or 8 digits, and nothing else. */
export const isColour = (c: string) => NAMED.has(c.toLowerCase()) || /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c);

/** An icon as an image's source, its `currentColor` painted `colour`: undefined when it is too big or no SVG. The colour is a checked one, or the
 *  theme's as the page computed it (`rgb(...)`), else grey. */
export function iconUri(text: string, colour: string): string | undefined {
  if (text.length > ICON_MAX || !/^\s*<svg[\s>]/i.test(text)) return undefined;
  const paint = isColour(colour) || /^rgba?\([\d.,\s%]+\)$/.test(colour) ? colour : 'grey';
  // an image needs its namespace, and a size of its own, or it is drawn 300 by 150 wherever it is scaled
  const root = /^\s*<svg[^>]*>/i.exec(text)![0], add = [!/\sxmlns=/i.test(root) && 'xmlns="http://www.w3.org/2000/svg"', !/\swidth=/i.test(root) && 'width="64" height="64"'].filter(Boolean).join(' ');
  const own = add ? text.replace(/<svg/i, `<svg ${add}`) : text;
  return `data:image/svg+xml,${encodeURIComponent(own.replace(/currentColor/g, paint)).replace(/[()']/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`;
}
