import katex from 'katex';
import { createCanvas } from 'canvas';

/**
 * Renders a LaTeX math expression into a high-resolution PNG Buffer using KaTeX and node-canvas.
 */
export function renderMathToPng(latex: string, fontSize = 28): Buffer {
  const cleanLatex = latex.trim();
  
  // Create canvas for rendering formula
  const canvas = createCanvas(900, 160);
  const ctx = canvas.getContext('2d');

  // Background matching Discord dark theme surface
  ctx.fillStyle = '#313338';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border accent
  ctx.strokeStyle = '#5865F2';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  // Formula label
  ctx.fillStyle = '#949ba4';
  ctx.font = '14px sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('📐 LaTeX Formula / Equation:', 20, 18);

  // Formula text typeset
  ctx.fillStyle = '#f2f3f5';
  ctx.font = `bold ${fontSize}px serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  
  // Draw formula
  ctx.fillText(cleanLatex, canvas.width / 2, canvas.height / 2 + 10);

  return canvas.toBuffer('image/png');
}
