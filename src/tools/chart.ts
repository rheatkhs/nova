import type { Tool } from './types.ts';

export const renderChartTool: Tool = {
  name: 'render_chart',
  description:
    'Generate a visual chart image (bar, line, pie, or doughnut) for statistics, trends, or comparisons. Returns an image URL that renders inline in Discord.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['bar', 'line', 'pie', 'doughnut'],
        description: 'Chart visualization type',
      },
      title: { type: 'string', description: 'Chart title' },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Category or X-axis labels',
      },
      data: {
        type: 'array',
        items: { type: 'number' },
        description: 'Numeric values corresponding to each label',
      },
      datasetLabel: {
        type: 'string',
        description: 'Optional legend label for the dataset (e.g. "Adoption", "Revenue")',
      },
    },
    required: ['type', 'labels', 'data'],
  },
  async execute(args): Promise<string> {
    const type = String(args.type || 'bar').toLowerCase();
    const title = String(args.title || '').trim();
    const labels = Array.isArray(args.labels) ? args.labels.map(String) : [];
    const data = Array.isArray(args.data) ? args.data.map(Number) : [];
    const datasetLabel = String(args.datasetLabel || title || 'Data');

    if (labels.length === 0 || data.length === 0) {
      return 'Error: labels and data arrays cannot be empty';
    }
    if (labels.length !== data.length) {
      return `Error: labels count (${labels.length}) must match data count (${data.length})`;
    }

    const config = {
      type,
      data: {
        labels,
        datasets: [{ label: datasetLabel, data }],
      },
      options: {
        title: title ? { display: true, text: title, fontColor: '#ffffff' } : undefined,
        legend: { labels: { fontColor: '#d1d5db' } },
        scales:
          type === 'pie' || type === 'doughnut'
            ? undefined
            : {
                xAxes: [{ ticks: { fontColor: '#9ca3af' }, gridLines: { color: 'rgba(255,255,255,0.1)' } }],
                yAxes: [{ ticks: { fontColor: '#9ca3af' }, gridLines: { color: 'rgba(255,255,255,0.1)' } }],
              },
      },
    };

    const encoded = encodeURIComponent(JSON.stringify(config));
    const url = `https://quickchart.io/chart?c=${encoded}&w=550&h=320&bkg=%23181a20`;
    return `[Chart generated: ${title || type}]\n${url}`;
  },
};
