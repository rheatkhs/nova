import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
} from 'discord.js';
import type { BotDeps } from './types.ts';
import { NO_PINGS } from './types.ts';
import { extractCodeSnippet } from './code.ts';
import { generateSpeechAudio } from './tts.ts';
import { getQuizItem, createChannelHistoryTool } from '../tools/index.ts';
import { formatFooter } from './footer.ts';
import { chunk } from '../chunk.ts';

export interface StepTrace {
  id: string;
  steps: string[];
}

const STEP_STORE = new Map<string, StepTrace>();

export function saveStepTrace(steps: string[]): string {
  const id = Math.random().toString(36).slice(2, 8);
  STEP_STORE.set(id, { id, steps });
  if (STEP_STORE.size > 50) {
    const oldest = STEP_STORE.keys().next().value;
    if (oldest) STEP_STORE.delete(oldest);
  }
  return id;
}

export interface PageEntry {
  id: string;
  pages: string[];
  footer: string;
  authorId: string;
  canThread: boolean;
  withCode: boolean;
}

const PAGE_STORE = new Map<string, PageEntry>();

export function savePageEntry(pages: string[], footer: string, authorId: string, canThread: boolean, withCode: boolean): string {
  const id = Math.random().toString(36).slice(2, 8);
  PAGE_STORE.set(id, { id, pages, footer, authorId, canThread, withCode });
  if (PAGE_STORE.size > 50) {
    const oldest = PAGE_STORE.keys().next().value;
    if (oldest) PAGE_STORE.delete(oldest);
  }
  return id;
}

export function buildPageNavRow(pageId: string, pageIndex: number, totalPages: number) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`page:${pageId}:${pageIndex - 1}`)
      .setLabel('Prev Page')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex === 0),
    new ButtonBuilder()
      .setCustomId('page-noop')
      .setLabel(`Page ${pageIndex + 1} of ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`page:${pageId}:${pageIndex + 1}`)
      .setLabel('Next Page')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex === totalPages - 1),
  );
  return row;
}

export function buildActionRow(authorId: string, canThread: boolean, withCode = false, stepTraceId?: string) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (canThread) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`thread:${authorId}`)
        .setLabel('Thread')
        .setEmoji('🧵')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (withCode && row.components.length < 5) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('code')
        .setLabel('Code')
        .setEmoji('📥')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (stepTraceId && row.components.length < 5) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`step:${stepTraceId}:0`)
        .setLabel('Steps')
        .setEmoji('🔍')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (row.components.length < 5) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('tts')
        .setLabel('Listen')
        .setEmoji('🔊')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (row.components.length < 5) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`regen:${authorId}`)
        .setLabel('Regenerate')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (row.components.length < 5) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('save')
        .setLabel('Save')
        .setEmoji('📩')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (row.components.length < 5) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`del:${authorId}`)
        .setLabel('Delete')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  return row;
}

export function buildQuizRow(quizId: string) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  const letters = ['A', 'B', 'C', 'D'];
  for (let i = 0; i < 4; i++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`quiz:${quizId}:${i}`)
        .setLabel(letters[i]!)
        .setStyle(ButtonStyle.Primary),
    );
  }
  return row;
}

export async function handleButton(interaction: ButtonInteraction, deps: BotDeps): Promise<void> {
  if (interaction.customId.startsWith('quiz:')) {
    const [, quizId, idxStr] = interaction.customId.split(':');
    const quiz = quizId ? getQuizItem(quizId) : undefined;
    if (!quiz) {
      await interaction.reply({
        content: 'This quiz has expired.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }
    const chosenIndex = Number(idxStr);
    const isCorrect = chosenIndex === quiz.correctIndex;
    const letters = ['A', 'B', 'C', 'D'];
    const chosenLetter = letters[chosenIndex] ?? '';
    const correctLetter = letters[quiz.correctIndex] ?? '';

    const reply = isCorrect
      ? `🎉 **Correct! (${chosenLetter})**\n\n${quiz.explanation}`
      : `❌ **Incorrect (You chose ${chosenLetter})**\n\nCorrect answer is **${correctLetter}. ${quiz.options[quiz.correctIndex]}**\n\n${quiz.explanation}`;

    await interaction.reply({ content: reply, flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.customId === 'tts') {
    const rawText = interaction.message.content.replace(/^-#.*$/gm, '').replace(/```[\s\S]*?```/g, '').trim();
    if (!rawText) {
      await interaction.reply({
        content: 'No readable speech text found in this response.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const locale = deps.memory.getVoice(interaction.channelId) || deps.memory.getLanguage(interaction.channelId) || 'en';
      const audioBuf = await generateSpeechAudio(rawText.slice(0, 200), locale);
      const file = new AttachmentBuilder(audioBuf, { name: 'speech.mp3' });
      await interaction.editReply({
        content: '🔊 **Voice Readout:**',
        files: [file],
      });
    } catch (err) {
      console.error('TTS error:', err);
      await interaction.editReply({
        content: 'Could not generate speech audio at this time.',
      });
    }
    return;
  }

  if (interaction.customId === 'save') {
    try {
      const text = interaction.message.content || '*(No text content)*';
      const jumpUrl = interaction.message.url;
      await interaction.user.send({
        content: `**Saved from Nova:**\n${text}\n\n[Jump to message](${jumpUrl})`,
      });
      await interaction.reply({
        content: '📩 Answer sent to your DMs!',
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      await interaction.reply({
        content: 'Could not send DM. Please enable direct messages from server members in your privacy settings.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  if (interaction.customId === 'code') {
    const text = interaction.message.content || '';
    const snippet = extractCodeSnippet(text);
    if (!snippet) {
      await interaction.reply({
        content: 'No code block found in this response.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const file = new AttachmentBuilder(Buffer.from(snippet.code, 'utf-8'), {
      name: `snippet.${snippet.ext}`,
    });
    await interaction.reply({
      content: `📥 Extracted source code file (\`snippet.${snippet.ext}\`):`,
      files: [file],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const [action, authorId] = interaction.customId.split(':');
  if (action === 'regen' && authorId) {
    const isAuthor = interaction.user.id === authorId;
    if (!isAuthor) {
      await interaction.reply({
        content: 'Only the author of the question can regenerate this response.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!deps.rateLimiter.check(interaction.user.id)) {
      await interaction.reply({
        content: '⏳ You are sending requests too quickly. Please wait a moment.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const history = deps.memory.get(interaction.channelId, deps.historyCharLimit);
    if (history.length === 0) {
      await interaction.reply({
        content: 'No prior conversation found to regenerate.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferUpdate().catch(() => {});
    const priorContext =
      history.at(-1)?.role === 'assistant' ? history.slice(0, -1) : history;
    if (priorContext.length === 0) return;
    const channelPrompt = deps.memory.getPrompt(interaction.channelId) ?? undefined;
    const channelModel = deps.memory.getModel(interaction.channelId) ?? undefined;
    const channelTemperature = deps.memory.getTemperature(interaction.channelId) ?? undefined;
    const channelLanguage = deps.memory.getLanguage(interaction.channelId) ?? undefined;
    const channel = interaction.channel;
    const channelTool = channel ? createChannelHistoryTool(channel) : undefined;
    const toolsUsed: string[] = [];

    try {
      const t0 = Date.now();
      const answer = await deps.chat(priorContext, {
        model: channelModel,
        systemPrompt: channelPrompt,
        temperature: channelTemperature,
        language: channelLanguage,
        extraTools: channelTool ? [channelTool] : undefined,
        onToolStart: (tool) => {
          toolsUsed.push(tool);
          deps.stats.toolCalls++;
        },
      });
      deps.stats.lastResponseMs = Date.now() - t0;
      deps.memory.replaceLastAssistant(interaction.channelId, answer);
      deps.stats.answered++;
      deps.stats.consecutiveFailures = 0;

      const footer = formatFooter({
        model: channelModel ?? 'default',
        latencyMs: deps.stats.lastResponseMs,
        toolsUsed,
      });
      const parts = chunk(answer);
      const canThread = interaction.inGuild() && !interaction.channel?.isThread();
      const row = buildActionRow(authorId, canThread, /```[a-zA-Z0-9_-]*\n[\s\S]*?\n```/.test(answer));

      await interaction.editReply({
        content: `${parts[0] ?? ''}${footer}`,
        components: [row],
        allowedMentions: NO_PINGS,
      });
    } catch (err) {
      deps.stats.failed++;
      deps.stats.consecutiveFailures++;
      console.error(err);
      await interaction.followUp({
        content: 'Failed to regenerate response, try again later.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  if (action === 'del') {
    const isAuthor = interaction.user.id === authorId;
    const canManage = Boolean(
      interaction.inGuild() &&
        (interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ||
          interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)),
    );
    if (!isAuthor && !canManage) {
      await interaction.reply({
        content: 'Only the author of the question or a moderator can delete this reply.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    try {
      await interaction.message.delete();
    } catch {
      await interaction.reply({ content: 'Could not delete message.', flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (action === 'thread') {
    if (!interaction.inGuild() || interaction.channel?.isThread()) {
      await interaction.reply({ content: 'Threads can only be created in public server channels.', flags: MessageFlags.Ephemeral });
      return;
    }
    try {
      const thread = await interaction.message.startThread({
        name: 'Discussion',
        autoArchiveDuration: 1440,
      });
      await interaction.reply({
        content: `💬 Created thread: <#${thread.id}>`,
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      await interaction.reply({
        content: 'Failed to create thread (missing "Create Public Threads" permission).',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
  if (action === 'prune') {
    const msgId = Number(authorId);
    const canManage = Boolean(
      interaction.inGuild() &&
        (interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
          interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)),
    );
    if (!canManage) {
      await interaction.reply({
        content: 'You need "Manage Channels" or "Manage Server" permissions to prune memory messages.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const success = deps.memory.deleteMessageById(msgId);
    if (success) {
      await interaction.reply({
        content: `🗑️ Successfully deleted message ID \`${msgId}\` from SQLite memory.`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: 'Message ID not found or already deleted.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  if (action === 'step') {
    const stepId = authorId;
    const targetIndex = Number(interaction.customId.split(':')[2] || '0');
    const trace = stepId ? STEP_STORE.get(stepId) : undefined;
    if (!trace || trace.steps.length === 0) {
      await interaction.reply({
        content: 'Step history has expired for this turn.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const idx = Math.max(0, Math.min(targetIndex, trace.steps.length - 1));
    const currentStep = trace.steps[idx];
    const navRow = new ActionRowBuilder<ButtonBuilder>();

    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`step:${stepId}:${idx - 1}`)
        .setLabel('Prev')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(idx === 0),
      new ButtonBuilder()
        .setCustomId('noop')
        .setLabel(`Step ${idx + 1} of ${trace.steps.length}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`step:${stepId}:${idx + 1}`)
        .setLabel('Next')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(idx === trace.steps.length - 1),
    );

    const content = `🔍 **Agent Execution Trajectory**\n\n${currentStep}`;
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content, components: [navRow] });
    } else {
      await interaction.reply({ content, components: [navRow], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (action === 'page') {
    const pageId = authorId;
    const targetPageIndex = Number(interaction.customId.split(':')[2] || '0');
    const entry = pageId ? PAGE_STORE.get(pageId) : undefined;
    if (!entry) {
      await interaction.reply({
        content: 'This multi-page message has expired.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const idx = Math.max(0, Math.min(targetPageIndex, entry.pages.length - 1));
    const pageContent = entry.pages[idx] ?? '';
    const navRow = buildPageNavRow(entry.id, idx, entry.pages.length);
    const actionRow = buildActionRow(entry.authorId, entry.canThread, entry.withCode);

    await interaction.update({
      content: `${pageContent}${entry.footer}`,
      components: [navRow, actionRow],
    });
    return;
  }
}
