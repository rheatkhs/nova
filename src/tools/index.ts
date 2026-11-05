import type { Tool } from './types.ts';
import { getCurrentTimeTool } from './time.ts';
import { evalMathTool } from './math.ts';
import { wikipediaSearchTool } from './wikipedia.ts';
import { webSearchTool } from './web-search.ts';
import { fetchPageTool } from './fetch-page.ts';
import { renderChartTool } from './chart.ts';
import { renderDiagramTool } from './diagram.ts';
import { renderHtmlTool } from './html-sandbox.ts';
import { createPollTool } from './poll.ts';
import { createQuizTool } from './quiz.ts';
import { generateImageTool } from './image.ts';
import { testWebhookTool } from './webhook.ts';
import { runCodeTool } from './repl.ts';
import { playMusicTool } from './music.ts';
import { essayExamTool } from './essay-exam.ts';
import { playRadioTool } from './radio.ts';

export * from './types.ts';
export * from './time.ts';
export * from './math.ts';
export * from './wikipedia.ts';
export * from './web-search.ts';
export * from './fetch-page.ts';
export * from './chart.ts';
export * from './diagram.ts';
export * from './html-sandbox.ts';
export * from './poll.ts';
export * from './quiz.ts';
export * from './image.ts';
export * from './webhook.ts';
export * from './channel-history.ts';
export * from './reminder.ts';
export * from './repl.ts';
export * from './music.ts';
export * from './essay-exam.ts';
export * from './radio.ts';

export const defaultTools: readonly Tool[] = [
  getCurrentTimeTool,
  evalMathTool,
  wikipediaSearchTool,
  webSearchTool,
  fetchPageTool,
  renderChartTool,
  createPollTool,
  renderHtmlTool,
  renderDiagramTool,
  createQuizTool,
  generateImageTool,
  testWebhookTool,
  runCodeTool,
  playMusicTool,
  essayExamTool,
  playRadioTool,
];
