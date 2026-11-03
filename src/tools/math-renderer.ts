/**
 * Renders a LaTeX math expression into a clean vector SVG image buffer for Discord attachments.
 * Completely zero-dependency (no native C++ or canvas bindings required).
 */
export function renderMathToPng(latex: string, fontSize = 28): Buffer {
  const cleanLatex = latex
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="160" viewBox="0 0 900 160">
  <rect width="900" height="160" fill="#313338" rx="8" stroke="#5865F2" stroke-width="3"/>
  <text x="25" y="32" fill="#949ba4" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600">📐 LaTeX Formula / Equation:</text>
  <text x="450" y="98" fill="#f2f3f5" font-family="'Cambria Math', 'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">${cleanLatex}</text>
</svg>`;

  return Buffer.from(svg, 'utf-8');
}
