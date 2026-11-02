import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type MessageContextMenuCommandInteraction,
  type ModalSubmitInteraction,
  type SendableChannels,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { BotDeps } from './types.ts';
import { NO_PINGS } from './types.ts';
import { handleButton } from './buttons.ts';
import { chunk } from '../chunk.ts';
import type { ChatMessage } from '../ai.ts';

const SUGGESTED_MODELS = [
  { name: 'Gemini 3.8 Flash (Fast & concise)', value: 'ag/gemini-3.8-flash' },
  { name: 'Claude Sonnet 5.5 (Coding & reasoning)', value: 'ag/claude-sonnet-5-5' },
  { name: 'Claude Opus 5.5 (Deep complex tasks)', value: 'ag/claude-opus-5-5' },
  { name: 'GPT-4o Mini (OpenAI general)', value: 'gpt-4o-mini' },
  { name: 'Reset to Default (from .env)', value: 'reset' },
];

const SUGGESTED_LANGUAGES = [
  { name: 'English', value: 'English' },
  { name: 'Vietnamese (Tiếng Việt)', value: 'Vietnamese' },
  { name: 'Japanese (日本語)', value: 'Japanese' },
  { name: 'Spanish (Español)', value: 'Spanish' },
  { name: 'French (Français)', value: 'French' },
  { name: 'German (Deutsch)', value: 'German' },
  { name: 'Chinese (中文)', value: 'Chinese' },
  { name: 'Reset (Conversation language)', value: 'reset' },
];

export function buildModelSelectMenu(currentModel: string | null) {
  const row = new ActionRowBuilder<StringSelectMenuBuilder>();
  const menu = new StringSelectMenuBuilder()
    .setCustomId('select-model')
    .setPlaceholder('Select a model for this channel...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Gemini 3.8 Flash')
        .setDescription('Ultra fast, concise, multimodal reasoning')
        .setValue('ag/gemini-3.8-flash')
        .setDefault(currentModel === 'ag/gemini-3.8-flash'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Claude Sonnet 5.5')
        .setDescription('Deep coding, analysis, and reasoning')
        .setValue('ag/claude-sonnet-5-5')
        .setDefault(currentModel === 'ag/claude-sonnet-5-5'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Claude Opus 5.5')
        .setDescription('Maximum depth for complex tasks')
        .setValue('ag/claude-opus-5-5')
        .setDefault(currentModel === 'ag/claude-opus-5-5'),
      new StringSelectMenuOptionBuilder()
        .setLabel('GPT-4o Mini')
        .setDescription('Lightweight OpenAI general assistant')
        .setValue('gpt-4o-mini')
        .setDefault(currentModel === 'gpt-4o-mini'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Reset to Default')
        .setDescription('Use server default from AI_MODEL in .env')
        .setValue('reset'),
    );
  row.addComponents(menu);
  return row;
}

export function hasManagePermission(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
): boolean {
  if (!interaction.inGuild()) return true;
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild),
  );
}

export async function handleInteraction(interaction: Interaction, deps: BotDeps): Promise<void> {
  if (interaction.isAutocomplete()) {
    await handleAutocomplete(interaction);
    return;
  }
  if (interaction.isButton()) {
    await handleButton(interaction, deps);
    return;
  }
  if (interaction.isMessageContextMenuCommand()) {
    await handleMessageContextMenu(interaction, deps);
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId === 'prompt-modal') {
    if (!hasManagePermission(interaction)) {
      await interaction.reply({
        content: 'You need "Manage Channels" or "Manage Server" permissions to configure channel prompts.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const channelId = interaction.channelId;
    if (!channelId) return;
    const val = interaction.fields.getTextInputValue('prompt-input')?.trim();
    if (!val || val.toLowerCase() === 'reset') {
      deps.memory.clearPrompt(channelId);
      await interaction.reply({
        content: 'Custom channel prompt cleared (reverted to global default).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    deps.memory.setPrompt(channelId, val);
    await interaction.reply({
      content: `Custom channel prompt set:\n>>> ${val.slice(0, 500)}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.isStringSelectMenu() && interaction.customId === 'select-model') {
    if (!hasManagePermission(interaction)) {
      await interaction.reply({
        content: 'You need "Manage Channels" or "Manage Server" permissions to configure channel models.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const chosen = interaction.values[0];
    if (!chosen || chosen === 'reset') {
      deps.memory.clearModel(interaction.channelId);
      await interaction.update({
        content: 'Custom channel model cleared (reverted to global default).',
        components: [],
      });
      return;
    }
    deps.memory.setModel(interaction.channelId, chosen);
    await interaction.update({
      content: `Custom channel model set to: \`${chosen}\``,
      components: [],
    });
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'help') {
    const text = [
      '**Nova AI Assistant**',
      '• **Chatting:** Mention me, reply to my messages, DM me, or chat in active threads and designated AI channels.',
      '• **Attachments:** Upload images for vision analysis or code/text files (`.py`, `.ts`, `.json`, `.log`, etc.) for review.',
      '',
      '**Commands:**',
      '• `/help` - Show this guide',
      '• `/stats` - View live bot operational metrics and memory',
      '• `/ask-thread [question]` - Ask and start a dedicated discussion thread',
      '• `/reset [recap]` - Clear conversation history (optional recap summary)',
      '• `/export [format]` - Download channel conversation history (.md or .json)',
      '• **Right-Click Apps:** Right-click any message → Apps → *Explain with Nova* or *Summarize with Nova*',
      '• `/prompt [text]` - View or set custom system prompt for this channel (admins)',
      '• `/model [name]` - View or switch model for this channel (admins)',
      '• `/temperature [value]` - View or set temperature 0.0-2.0 (admins)',
      '• `web_search` 🔎, `wikipedia_search` 🔍, `fetch_page` 🌐, `render_chart` 📊, `render_diagram` 📐, `render_html` 💻, `play_spotify` 🎶, `generate_image` 🎨, `create_poll` 🗳️, `create_quiz` 🧠, `create_reminder` ⏰, `test_webhook` 📡, `run_code` ⚡, `eval_math` 🔢, `get_current_time` ⏱️, `read_channel_history` 📜',
    ].join('\n');
    await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.commandName === 'stats') {
    const memStats = deps.memory.stats();
    const uptimeSec = Math.floor(process.uptime());
    const uptimeHours = (uptimeSec / 3600).toFixed(1);
    const channelModel = deps.memory.getModel(interaction.channelId);
    const lines = [
      '**Nova System Stats**',
      `• **Status:** Connected (${interaction.client.ws.ping}ms gateway ping)`,
      `• **Uptime:** ${uptimeSec}s (~${uptimeHours}h)`,
      `• **Servers:** ${interaction.client.guilds.cache.size}`,
      `• **Active Model:** \`${channelModel ?? 'global default'}\``,
      `• **Questions Answered:** ${deps.stats.answered}`,
      `• **Questions Failed:** ${deps.stats.failed}${deps.stats.consecutiveFailures > 0 ? ` (${deps.stats.consecutiveFailures} consecutive)` : ''}`,
      `• **Tool Executions:** ${deps.stats.toolCalls}`,
      `• **Last Response Latency:** ${deps.stats.lastResponseMs > 0 ? `${deps.stats.lastResponseMs}ms` : 'none yet'}`,
      `• **SQLite Memory:** ${memStats.totalMessages} messages across ${memStats.channels} channels`,
    ];
    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.commandName === 'ask-thread') {
    const question = interaction.options.getString('question', true).trim();
    if (!deps.rateLimiter.check(interaction.user.id)) {
      await interaction.reply({
        content: '⏳ You are sending requests too quickly. Please wait a moment.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();
    const q: ChatMessage = { role: 'user', content: `${interaction.user.displayName}: ${question}` };

    let threadTarget: SendableChannels | null = null;
    if (interaction.inGuild() && !interaction.channel?.isThread()) {
      try {
        const replyMsg = await interaction.fetchReply();
        threadTarget = await replyMsg.startThread({
          name: question.slice(0, 90),
          autoArchiveDuration: 1440,
        });
      } catch {}
    }

    try {
      if (threadTarget) {
        await interaction.editReply({
          content: `💬 Created thread: <#${threadTarget.id}>\n**Question:** ${question}`,
          allowedMentions: NO_PINGS,
        });
        const channelPrompt = deps.memory.getPrompt(threadTarget.id) ?? undefined;
        const channelModel = deps.memory.getModel(threadTarget.id) ?? undefined;
        const channelTemperature = deps.memory.getTemperature(threadTarget.id) ?? undefined;
        const channelLanguage = deps.memory.getLanguage(threadTarget.id) ?? undefined;
        const t0 = Date.now();
        const answer = await deps.chat([q], {
          model: channelModel,
          systemPrompt: channelPrompt,
          temperature: channelTemperature,
          language: channelLanguage,
        });
        deps.stats.lastResponseMs = Date.now() - t0;
        deps.memory.append(threadTarget.id, q, { role: 'assistant', content: answer });
        const parts = chunk(answer);
        for (const part of parts) {
          await threadTarget.send({ content: part, allowedMentions: NO_PINGS });
        }
        deps.stats.answered++;
        deps.stats.consecutiveFailures = 0;
      } else {
        const channelPrompt = deps.memory.getPrompt(interaction.channelId) ?? undefined;
        const channelModel = deps.memory.getModel(interaction.channelId) ?? undefined;
        const channelTemperature = deps.memory.getTemperature(interaction.channelId) ?? undefined;
        const channelLanguage = deps.memory.getLanguage(interaction.channelId) ?? undefined;
        const t0 = Date.now();
        const answer = await deps.chat([q], {
          model: channelModel,
          systemPrompt: channelPrompt,
          temperature: channelTemperature,
          language: channelLanguage,
        });
        deps.stats.lastResponseMs = Date.now() - t0;
        deps.memory.append(interaction.channelId, q, { role: 'assistant', content: answer });
        await interaction.editReply({ content: answer.slice(0, 2000), allowedMentions: NO_PINGS });
        deps.stats.answered++;
        deps.stats.consecutiveFailures = 0;
      }
    } catch (err) {
      deps.stats.failed++;
      deps.stats.consecutiveFailures++;
      console.error(err);
      await interaction.editReply({ content: 'AI request failed, try again later.', allowedMentions: NO_PINGS });
    }
    return;
  }
  if (interaction.commandName === 'reset') {
    const wantRecap = interaction.options.getBoolean('recap') ?? false;
    const history = deps.memory.get(interaction.channelId);

    if (wantRecap && history.length > 0) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let summary = '';
      try {
        const recapPrompt: ChatMessage = {
          role: 'user',
          content: 'Provide a concise 2-3 sentence summary of the key points in our conversation so far.',
        };
        summary = await deps.chat([...history, recapPrompt]);
      } catch {
        summary = '(Could not generate recap)';
      }
      deps.memory.clear(interaction.channelId);
      await interaction.editReply({
        content: `**Conversation Recap:**\n${summary}\n\n*Memory cleared for this channel.*`,
        allowedMentions: NO_PINGS,
      });
      return;
    }

    deps.memory.clear(interaction.channelId);
    await interaction.reply({
      content: 'Conversation memory cleared for this channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.commandName === 'export') {
    const history = deps.memory.get(interaction.channelId);
    if (history.length === 0) {
      await interaction.reply({
        content: 'No conversation history stored for this channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const format = interaction.options.getString('format') || 'markdown';
    let file: AttachmentBuilder;
    if (format === 'json') {
      const json = JSON.stringify(history, null, 2);
      file = new AttachmentBuilder(Buffer.from(json, 'utf-8'), {
        name: `history-${interaction.channelId}.json`,
      });
    } else {
      const header = `# Nova Chat History\nChannel: ${interaction.channelId}\nExported: ${new Date().toISOString()}\n\n---\n\n`;
      const body = history
        .map((m) => {
          const author = m.role === 'assistant' ? 'Nova (Assistant)' : 'User';
          const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          return `### ${author}\n\n${content}\n`;
        })
        .join('\n---\n\n');
      file = new AttachmentBuilder(Buffer.from(header + body, 'utf-8'), {
        name: `history-${interaction.channelId}.md`,
      });
    }
    await interaction.reply({
      content: `Exported ${history.length} conversation messages:`,
      files: [file],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.commandName === 'prompt') {
    const text = interaction.options.getString('text')?.trim();
    if (!text) {
      if (!hasManagePermission(interaction)) {
        const current = deps.memory.getPrompt(interaction.channelId);
        await interaction.reply({
          content: current
            ? `Channel prompt: "${current}"`
            : 'No custom prompt set for this channel (using global default).',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const current = deps.memory.getPrompt(interaction.channelId) || '';
      const modal = new ModalBuilder()
        .setCustomId('prompt-modal')
        .setTitle('Channel AI Persona')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('prompt-input')
              .setLabel('Custom System Prompt / Instructions')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('e.g. You are a senior engineer. Keep answers concise.')
              .setValue(current)
              .setRequired(false)
              .setMaxLength(2000),
          ),
        );
      await interaction.showModal(modal);
      return;
    }
    if (!hasManagePermission(interaction)) {
      await interaction.reply({
        content: 'You need "Manage Channels" or "Manage Server" permissions to configure channel prompts.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (text.toLowerCase() === 'reset') {
      deps.memory.clearPrompt(interaction.channelId);
      await interaction.reply({
        content: 'Custom channel prompt cleared (reverted to global default).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    deps.memory.setPrompt(interaction.channelId, text);
    await interaction.reply({
      content: `Custom channel prompt set: "${text}"`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.commandName === 'model') {
    const name = interaction.options.getString('name')?.trim();
    if (!name) {
      const current = deps.memory.getModel(interaction.channelId);
      const row = buildModelSelectMenu(current);
      await interaction.reply({
        content: current
          ? `Current channel model: \`${current}\`\nSelect a new model below or specify \`/model [name]\` directly:`
          : 'No custom model set for this channel (using global default).\nSelect a model below or specify \`/model [name]\` directly:',
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!hasManagePermission(interaction)) {
      await interaction.reply({
        content: 'You need "Manage Channels" or "Manage Server" permissions to configure channel models.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (name.toLowerCase() === 'reset') {
      deps.memory.clearModel(interaction.channelId);
      await interaction.reply({
        content: 'Custom channel model cleared (reverted to global default).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    deps.memory.setModel(interaction.channelId, name);
    await interaction.reply({
      content: `Custom channel model set to: \`${name}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.commandName === 'temperature') {
    const valStr = interaction.options.getString('value')?.trim();
    if (!valStr) {
      const current = deps.memory.getTemperature(interaction.channelId);
      await interaction.reply({
        content:
          current !== null
            ? `Channel temperature: \`${current.toFixed(2)}\``
            : 'No custom temperature set for this channel (using model default).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!hasManagePermission(interaction)) {
      await interaction.reply({
        content: 'You need "Manage Channels" or "Manage Server" permissions to configure channel temperature.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (valStr.toLowerCase() === 'reset') {
      deps.memory.clearTemperature(interaction.channelId);
      await interaction.reply({
        content: 'Custom channel temperature cleared (reverted to model default).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const temp = parseFloat(valStr);
    if (Number.isNaN(temp) || temp < 0 || temp > 2.0) {
      await interaction.reply({
        content: 'Invalid temperature: must be a number between 0.0 and 2.0, or "reset".',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    deps.memory.setTemperature(interaction.channelId, temp);
    await interaction.reply({
      content: `Custom channel temperature set to: \`${temp.toFixed(2)}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.commandName === 'language') {
    const langStr = interaction.options.getString('name')?.trim();
    if (!langStr) {
      const current = deps.memory.getLanguage(interaction.channelId);
      await interaction.reply({
        content:
          current !== null
            ? `Channel language: \`${current}\``
            : 'No custom language preset for this channel (responds in conversation language).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!hasManagePermission(interaction)) {
      await interaction.reply({
        content: 'You need "Manage Channels" or "Manage Server" permissions to configure channel language.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (langStr.toLowerCase() === 'reset') {
      deps.memory.clearLanguage(interaction.channelId);
      await interaction.reply({
        content: 'Custom channel language cleared (responds in conversation language).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    deps.memory.setLanguage(interaction.channelId, langStr);
    await interaction.reply({
      content: `Custom channel language set to: \`${langStr}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.commandName === 'voice') {
    const localeStr = interaction.options.getString('locale')?.trim();
    if (!localeStr) {
      const current = deps.memory.getVoice(interaction.channelId);
      await interaction.reply({
        content:
          current !== null
            ? `Channel voice locale: \`${current}\``
            : 'No custom voice set for this channel (using default en).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!hasManagePermission(interaction)) {
      await interaction.reply({
        content: 'You need "Manage Channels" or "Manage Server" permissions to configure channel voice.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (localeStr.toLowerCase() === 'reset') {
      deps.memory.clearVoice(interaction.channelId);
      await interaction.reply({
        content: 'Custom channel voice cleared (reverted to default en).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    deps.memory.setVoice(interaction.channelId, localeStr);
    await interaction.reply({
      content: `Custom channel voice locale set to: \`${localeStr}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.commandName === 'memory') {
    const action = interaction.options.getString('action', true);
    if (action === 'inspect') {
      const stats = deps.memory.stats();
      await interaction.reply({
        content: `💾 **SQLite Memory Diagnostics**\n• **Total Messages Stored:** ${stats.totalMessages}\n• **Active Channels Tracked:** ${stats.channels}\n• **History Limit per Channel:** ${deps.historyCharLimit ?? 'default'} chars`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (action === 'view') {
      const history = deps.memory.getDetailedHistory(interaction.channelId, 10);
      if (history.length === 0) {
        await interaction.reply({
          content: 'No stored messages found in SQLite for this channel.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const rows = history.map((m: { id: number; role: string; content: string }, i: number) => {
        const snippet = m.content.length > 80 ? m.content.slice(0, 80) + '...' : m.content;
        return `**[#${i + 1}] ID: ${m.id} (${m.role}):** \`${snippet}\``;
      });

      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const m of history.slice(0, 5)) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`prune:${m.id}`)
            .setLabel(`Del #${m.id}`)
            .setStyle(ButtonStyle.Danger),
        );
      }

      await interaction.reply({
        content: `💾 **SQLite Memory Surgeon (Last ${history.length} messages):**\n\n${rows.join('\n')}\n\n*Click a button below to surgically delete a message row:*`,
        components: row.components.length > 0 ? [row] : [],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }
}
async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const query = focused.value.toLowerCase().trim();

  if (interaction.commandName === 'model') {
    const filtered = SUGGESTED_MODELS.filter(
      (m) => m.name.toLowerCase().includes(query) || m.value.toLowerCase().includes(query),
    );
    await interaction.respond(filtered.slice(0, 25));
    return;
  }

  if (interaction.commandName === 'language') {
    const filtered = SUGGESTED_LANGUAGES.filter(
      (l) => l.name.toLowerCase().includes(query) || l.value.toLowerCase().includes(query),
    );
    await interaction.respond(filtered.slice(0, 25));
    return;
  }
}

async function handleMessageContextMenu(
  interaction: MessageContextMenuCommandInteraction,
  deps: BotDeps,
): Promise<void> {
  const target = interaction.targetMessage;
  const content = target.content.trim();
  const authorName = target.author.displayName || target.author.username;

  if (!content && target.attachments.size === 0) {
    await interaction.reply({
      content: 'This message does not contain text or readable attachments.',
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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const isExplain = interaction.commandName === 'Explain with Nova';
  const instruction = isExplain
    ? `Explain this message by ${authorName} clearly and concisely:`
    : `Summarize the key points of this message by ${authorName}:`;

  const prompt = `${instruction}\n\n"${content}"`;
  const q: ChatMessage = { role: 'user', content: prompt };

  const channelPrompt = deps.memory.getPrompt(interaction.channelId) ?? undefined;
  const channelModel = deps.memory.getModel(interaction.channelId) ?? undefined;
  const channelTemperature = deps.memory.getTemperature(interaction.channelId) ?? undefined;
  const channelLanguage = deps.memory.getLanguage(interaction.channelId) ?? undefined;

  try {
    const t0 = Date.now();
    const answer = await deps.chat([q], {
      model: channelModel,
      systemPrompt: channelPrompt,
      temperature: channelTemperature,
      language: channelLanguage,
    });
    deps.stats.lastResponseMs = Date.now() - t0;
    deps.stats.answered++;
    deps.stats.consecutiveFailures = 0;

    const parts = chunk(answer);
    await interaction.editReply({
      content: `**${isExplain ? 'Explanation' : 'Summary'}:**\n${parts[0] ?? ''}`,
      allowedMentions: NO_PINGS,
    });
  } catch (err) {
    deps.stats.failed++;
    deps.stats.consecutiveFailures++;
    console.error(err);
    await interaction.editReply({
      content: 'AI request failed, try again later.',
      allowedMentions: NO_PINGS,
    });
  }
}
