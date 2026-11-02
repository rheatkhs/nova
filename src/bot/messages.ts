import {
  AttachmentBuilder,
  type Attachment,
  type Message,
  type SendableChannels,
} from 'discord.js';
import type { AnswerMeta, BotDeps } from './types.ts';
import { NO_PINGS, TYPING_REFRESH_MS } from './types.ts';
import type { TaskQueue } from '../queue.ts';
import { buildActionRow, buildPageNavRow, buildQuizRow, savePageEntry, saveStepTrace } from './buttons.ts';
import { formatFooter, toolEmoji, toolLabel } from './footer.ts';
import { createChannelHistoryTool, createReminderTool, createPlaySpotifyTool } from '../tools/index.ts';
import { chunk } from '../chunk.ts';
import { events } from '../events.ts';
import type { ChatMessage, MessagePart } from '../ai.ts';

const TEXT_EXTENSIONS: Record<string, true> = {
  txt: true, md: true, json: true, js: true, ts: true, tsx: true, jsx: true,
  py: true, rs: true, go: true, c: true, cpp: true, h: true, hpp: true,
  css: true, html: true, xml: true, yaml: true, yml: true, toml: true,
  sh: true, bash: true, sql: true, env: true, log: true, csv: true, diff: true, patch: true,
};

export function isTextAttachment(a: Attachment): boolean {
  if (a.contentType?.startsWith('text/') || a.contentType === 'application/json') {
    return true;
  }
  const ext = a.name?.split('.').pop()?.toLowerCase();
  return ext !== undefined && TEXT_EXTENSIONS[ext] === true;
}

export async function toDataUri(url: string, contentType: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function toTextContent(url: string, name: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const text = await res.text();
    return `[Attached file: ${name}]\n\`\`\`\n${text.slice(0, 20_000)}\n\`\`\``;
  } catch {
    return null;
  }
}

export async function withTyping<T>(channel: SendableChannels, task: () => Promise<T>): Promise<T> {
  const ping = () => void channel.sendTyping().catch(() => {});
  ping();
  const timer = setInterval(ping, TYPING_REFRESH_MS);
  try {
    return await task();
  } finally {
    clearInterval(timer);
  }
}

export async function getReferencedContext(msg: Message, botId: string): Promise<string | null> {
  if (!msg.reference?.messageId) return null;
  try {
    const ref = await msg.fetchReference();
    if (ref.author.id === botId) return null;
    const author = ref.author.displayName || ref.author.username;
    const body = ref.content.slice(0, 500).trim();
    return body ? `[Replying to ${author}: "${body}"]` : null;
  } catch {
    return null;
  }
}

export async function sendAnswer(
  msg: Message,
  channel: SendableChannels,
  answer: string,
  meta?: AnswerMeta,
): Promise<void> {
  const footer = formatFooter(meta);
  const parts = chunk(answer);
  const canThread = msg.inGuild() && !msg.channel.isThread();
  const withCode = /```[a-zA-Z0-9_-]*\n[\s\S]*?\n```/.test(answer);
  const stepTraceId =
    meta?.stepTraces && meta.stepTraces.length >= 2 ? saveStepTrace(meta.stepTraces as string[]) : undefined;
  const row = buildActionRow(msg.author.id, canThread, withCode, stepTraceId);
  const quizId = answer.match(/\[QUIZ:([a-z0-9]+)\]/)?.[1];
  const cleanAnswer = answer.replace(/\[QUIZ:[a-z0-9]+\]\n?/g, '');

  if (parts.length > 1 && parts.length <= 4) {
    const pageId = savePageEntry(parts, footer, msg.author.id, canThread, withCode);
    const navRow = buildPageNavRow(pageId, 0, parts.length);
    const rows = quizId ? [buildQuizRow(quizId), navRow, row] : [navRow, row];
    await msg.reply({
      content: `${parts[0] ?? ''}${footer}`,
      components: rows,
      allowedMentions: NO_PINGS,
    });
    return;
  }

  const rows = quizId ? [buildQuizRow(quizId), row] : [row];
  if (parts.length === 1) {
    await msg.reply({ content: `${parts[0] ?? ''}${footer}`, components: rows, allowedMentions: NO_PINGS });
    return;
  }

  const preview = parts[0] ?? '';
  const file = new AttachmentBuilder(Buffer.from(cleanAnswer, 'utf-8'), { name: 'response.md' });
  await msg.reply({
    content: `${preview}\n\n*(Full response attached as response.md)*${footer}`,
    files: [file],
    components: rows,
    allowedMentions: NO_PINGS,
  });
}

export async function handleMessage(msg: Message, deps: BotDeps, queue: TaskQueue): Promise<void> {
  const botId = msg.client.user.id;
  if (msg.author.bot || !msg.channel.isSendable()) return;

  const inActiveThread =
    msg.channel.isThread() &&
    (msg.channel.ownerId === botId ||
      (msg.channel.parentId !== null && deps.aiChannels.has(msg.channel.parentId)) ||
      deps.memory.get(msg.channelId).length > 0);

  const addressed =
    !msg.inGuild() ||
    deps.aiChannels.has(msg.channelId) ||
    inActiveThread ||
    msg.mentions.users.has(botId) ||
    msg.mentions.repliedUser?.id === botId;
  if (!addressed) return;

  const imageAttachments = [...msg.attachments.values()].filter(
    (a) => a.contentType?.startsWith('image/') && a.size <= 10 * 1024 * 1024,
  ).slice(0, 4);
  const textAttachments = [...msg.attachments.values()].filter(
    (a) => !a.contentType?.startsWith('image/') && isTextAttachment(a) && a.size <= 500 * 1024,
  ).slice(0, 3);
  const text = msg.content.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
  if (!text && imageAttachments.length === 0 && textAttachments.length === 0) return;
  if (!deps.rateLimiter.check(msg.author.id)) {
    void msg.react('⏳').catch(() => {});
    return;
  }

  const channel = msg.channel;
  await queue(msg.channelId, async () => {
    const refContext = await getReferencedContext(msg, botId);
    const promptText =
      text ||
      (imageAttachments.length > 0
        ? 'Describe or answer based on the attached image.'
        : 'Analyze or answer based on the attached file.');
    const userText = refContext
      ? `${refContext}\n${msg.author.displayName}: ${promptText}`
      : `${msg.author.displayName}: ${promptText}`;

    const [dataUris, textFiles] = await Promise.all([
      Promise.all(imageAttachments.map((a) => toDataUri(a.url, a.contentType ?? 'image/jpeg'))),
      Promise.all(textAttachments.map((a) => toTextContent(a.url, a.name))),
    ]);
    const validImages = dataUris.filter((u): u is string => u !== null);
    const validTexts = textFiles.filter((t): t is string => t !== null);

    const fullPrompt = validTexts.length > 0 ? `${userText}\n\n${validTexts.join('\n\n')}` : userText;

    const question: ChatMessage = validImages.length === 0
      ? { role: 'user', content: fullPrompt }
      : {
          role: 'user',
          content: [
            { type: 'text', text: fullPrompt },
            ...validImages.map((url): MessagePart => ({ type: 'image_url', image_url: { url } })),
          ],
        };

    const attachSummary = [
      validImages.length ? `${validImages.length} image(s)` : '',
      validTexts.length ? `${validTexts.length} file(s)` : '',
    ].filter(Boolean).join(', ');

    const memoryQuestion: ChatMessage = {
      role: 'user',
      content: attachSummary ? `${userText} [Attached ${attachSummary}]` : userText,
    };
    const channelTool = createChannelHistoryTool(channel);
    const reminderTool = createReminderTool(channel, msg.author.id);
    const spotifyTool = createPlaySpotifyTool(() => ({ message: msg }));
    const channelPrompt = deps.memory.getPrompt(msg.channelId) ?? undefined;
    const channelModel = deps.memory.getModel(msg.channelId) ?? undefined;
    const channelTemperature = deps.memory.getTemperature(msg.channelId) ?? undefined;
    const channelLanguage = deps.memory.getLanguage(msg.channelId) ?? undefined;
    const toolsUsed: string[] = [];
    const stepTraces: string[] = [];
    let statusMsg: Message | null = null;
    let answer: string;
    try {
      const t0 = Date.now();
      answer = await withTyping(channel, () =>
        deps.chat([...deps.memory.get(msg.channelId, deps.historyCharLimit), question], {
          model: channelModel,
          systemPrompt: channelPrompt,
          temperature: channelTemperature,
          language: channelLanguage,
          extraTools: [channelTool, reminderTool, spotifyTool],
          onToolStart: (tool, step) => {
            toolsUsed.push(tool);
            stepTraces.push(`**Step ${step}:** ${toolEmoji(tool)} **${tool}**\n*Action:* ${toolLabel(tool)}`);
            deps.stats.toolCalls++;
            events.broadcast('tool', `Invoked ${toolEmoji(tool)} ${tool} (step ${step}) in #${channel.id}`);
            void msg.react(toolEmoji(tool)).catch(() => {});
            const statusText = `*⏳ [Step ${step}] ${toolEmoji(tool)} ${toolLabel(tool)}...*`;
            if (!statusMsg) {
              msg.reply({ content: statusText, allowedMentions: NO_PINGS })
                .then((m) => { statusMsg = m; })
                .catch(() => {});
            } else {
              statusMsg.edit({ content: statusText, allowedMentions: NO_PINGS }).catch(() => {});
            }
          },
        }),
      );
      deps.stats.lastResponseMs = Date.now() - t0;
      if (statusMsg) {
        await (statusMsg as Message).delete().catch(() => {});
      }
    } catch (err) {
      if (statusMsg) {
        await (statusMsg as Message).delete().catch(() => {});
      }
      deps.stats.failed++;
      deps.stats.consecutiveFailures++;
      events.broadcast('error', `AI turn failed in #${channel.id}: ${err instanceof Error ? err.message : String(err)}`);
      console.error(err);
      await msg.reply({ content: 'AI request failed, try again later.', allowedMentions: NO_PINGS });
      return;
    }

    try {
      await sendAnswer(msg, channel, answer, {
        model: channelModel ?? 'default',
        latencyMs: deps.stats.lastResponseMs,
        toolsUsed,
        stepTraces,
      });
    } catch (err) {
      deps.stats.failed++;
      deps.stats.consecutiveFailures++;
      throw err;
    }
    deps.memory.append(msg.channelId, memoryQuestion, { role: 'assistant', content: answer });
    deps.stats.answered++;
    deps.stats.consecutiveFailures = 0;
    events.broadcast('answer', `Answered question in #${channel.id} (${deps.stats.lastResponseMs}ms)`);
  });
}
