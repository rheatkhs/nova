import {
  ActionRowBuilder,
  ActivityType,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  PermissionFlagsBits,
  type Attachment,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type Message,
  type MessageMentionOptions,
  type SendableChannels,
} from 'discord.js';
import type { Chat, ChatMessage, MessagePart } from './ai.ts';
import { chunk } from './chunk.ts';
import type { ConversationMemory } from './memory.ts';
import { createQueue, type TaskQueue } from './queue.ts';
import { createChannelHistoryTool } from './tools.ts';
import type { RateLimiter } from './rate-limit.ts';

export interface BotStats {
  answered: number;
  failed: number;
  toolCalls: number;
  consecutiveFailures: number;
  lastResponseMs: number;
}

export interface BotDeps {
  chat: Chat;
  memory: ConversationMemory;
  /** Channels where the bot answers every message, no mention needed. */
  aiChannels: ReadonlySet<string>;
  /** Enforces minimum spacing between questions per user. */
  rateLimiter: RateLimiter;
  /** Maximum character budget across history before older messages are pruned. */
  historyCharLimit?: number;
  /** Mutated in place; read by the status API. */
  stats: BotStats;
}

/** Model output must never ping @everyone, roles, or users. */
const NO_PINGS: MessageMentionOptions = { parse: [], repliedUser: false };
/** Discord's typing indicator lasts ~10s. */
const TYPING_REFRESH_MS = 8_000;

export function createBot(deps: BotDeps): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel], // required to receive DMs
  });
  const queue = createQueue();

  client.once(Events.ClientReady, async (c) => {
    console.log(`Logged in as ${c.user.tag}`);
    updatePresence(client, deps.stats);
    try {
      await c.application.commands.set([
        { name: 'help', description: 'Show bot commands, capabilities, and active tools' },
        { name: 'stats', description: 'View live bot operational metrics, model, and memory stats' },
        {
          name: 'ask-thread',
          description: 'Ask Nova a question and create a dedicated discussion thread for the answer',
          options: [
            {
              name: 'question',
              description: 'Your question or topic to discuss in a new thread',
              type: 3, // ApplicationCommandOptionType.String
              required: true,
            },
          ],
        },
        {
          name: 'reset',
          description: 'Clear conversation memory for this channel',
          options: [
            {
              name: 'recap',
              description: 'Generate a summary of the conversation before clearing memory',
              type: 5, // ApplicationCommandOptionType.Boolean
              required: false,
            },
          ],
        },
        {
          name: 'export',
          description: 'Export and download conversation history for this channel',
          options: [
            {
              name: 'format',
              description: 'File format (default: markdown)',
              type: 3, // ApplicationCommandOptionType.String
              required: false,
              choices: [
                { name: 'Markdown (.md)', value: 'markdown' },
                { name: 'JSON (.json)', value: 'json' },
              ],
            },
          ],
        },
        {
          name: 'prompt',
          description: 'View, set, or clear custom AI system prompt for this channel',
          options: [
            {
              name: 'text',
              description: 'New system prompt (leave empty to view, type "reset" to clear)',
              type: 3, // ApplicationCommandOptionType.String
              required: false,
            },
          ],
        },
        {
          name: 'model',
          description: 'View, set, or clear custom AI model for this channel',
          options: [
            {
              name: 'name',
              description: 'Model identifier (e.g. ag/claude-sonnet-5-5, leave empty to view, type "reset" to clear)',
              type: 3, // ApplicationCommandOptionType.String
              required: false,
            },
          ],
        },
        {
          name: 'temperature',
          description: 'View, set, or clear AI temperature (0.0 to 2.0) for this channel',
          options: [
            {
              name: 'value',
              description: 'Creativity value (0.0 = deterministic/coding, 1.0 = creative, "reset" to clear)',
              type: 3, // ApplicationCommandOptionType.String
              required: false,
            },
          ],
        },
        {
          name: 'language',
          description: 'View, set, or clear preferred response language for this channel',
          options: [
            {
              name: 'name',
              description: 'Language name (e.g. Vietnamese, English, Japanese, or "reset" to clear)',
              type: 3, // ApplicationCommandOptionType.String
              required: false,
            },
          ],
        },
      ]);
    } catch (err) {
      console.error('Failed to register slash commands:', err);
    }
  });
  client.on(Events.GuildCreate, () => updatePresence(client, deps.stats));
  client.on(Events.GuildDelete, () => updatePresence(client, deps.stats));
  client.on(Events.MessageCreate, (msg) => void handleMessage(msg, deps, queue).catch(console.error));
  client.on(Events.InteractionCreate, (interaction) => void handleInteraction(interaction, deps).catch(console.error));
  return client;
}

/** Updates Discord rich presence activity to reflect server count and answers. */
export function updatePresence(client: Client, stats: BotStats): void {
  const servers = client.guilds.cache.size;
  const serverText = servers === 1 ? '1 server' : `${servers} servers`;
  const answered = stats.answered;
  const statusText = answered > 0
    ? `${serverText} • ${answered} answers • /help`
    : `${serverText} • /help`;

  client.user?.setActivity(statusText, { type: ActivityType.Watching });
}

async function handleInteraction(interaction: Interaction, deps: BotDeps): Promise<void> {
  if (interaction.isButton()) {
    await handleButton(interaction);
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
      '• `/prompt [text]` - View or set custom system prompt for this channel (admins)',
      '• `/model [name]` - View or switch model for this channel (admins)',
      '• `/temperature [value]` - View or set temperature 0.0-2.0 (admins)',
      '• `/language [name]` - View or set preferred channel language (admins)',
      '',
      '• `web_search` 🔎, `wikipedia_search` 🔍, `fetch_page` 🌐, `eval_math` 🔢, `get_current_time` ⏱️, `read_channel_history` 📜',
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
        const answer = await withTyping(threadTarget, () =>
          deps.chat([q], {
            model: channelModel,
            systemPrompt: channelPrompt,
            temperature: channelTemperature,
            language: channelLanguage,
          }),
        );
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
      const current = deps.memory.getPrompt(interaction.channelId);
      await interaction.reply({
        content: current ? `Channel prompt: "${current}"` : 'No custom prompt set for this channel (using global default).',
        flags: MessageFlags.Ephemeral,
      });
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
      await interaction.reply({
        content: current ? `Channel model: \`${current}\`` : 'No custom model set for this channel (using global default).',
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
}

/** Returns true if interaction is in DM or member has ManageChannels/ManageGuild. */
function hasManagePermission(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.inGuild()) return true;
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild),
  );
}

async function handleMessage(msg: Message, deps: BotDeps, queue: TaskQueue): Promise<void> {
  const botId = msg.client.user.id;
  if (msg.author.bot || !msg.channel.isSendable()) return;

  const inActiveThread =
    msg.channel.isThread() &&
    (msg.channel.ownerId === botId ||
      (msg.channel.parentId !== null && deps.aiChannels.has(msg.channel.parentId)) ||
      deps.memory.get(msg.channelId).length > 0);

  const addressed =
    !msg.inGuild() || // DM
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
    let answer: string;
    try {
      const channelTool = createChannelHistoryTool(channel);
      const channelPrompt = deps.memory.getPrompt(msg.channelId) ?? undefined;
      const channelModel = deps.memory.getModel(msg.channelId) ?? undefined;
      const channelTemperature = deps.memory.getTemperature(msg.channelId) ?? undefined;
      const channelLanguage = deps.memory.getLanguage(msg.channelId) ?? undefined;
      const t0 = Date.now();
      answer = await withTyping(channel, () =>
        deps.chat([...deps.memory.get(msg.channelId, deps.historyCharLimit), question], {
          model: channelModel,
          systemPrompt: channelPrompt,
          temperature: channelTemperature,
          language: channelLanguage,
          extraTools: [channelTool],
          onToolStart: (tool) => {
            deps.stats.toolCalls++;
            void msg.react(toolEmoji(tool)).catch(() => {});
          },
        }),
      );
      deps.stats.lastResponseMs = Date.now() - t0;
    } catch (err) {
      deps.stats.failed++;
      deps.stats.consecutiveFailures++;
      console.error(err);
      await msg.reply({ content: 'AI request failed, try again later.', allowedMentions: NO_PINGS });
      return;
    }

    try {
      await sendAnswer(msg, channel, answer);
    } catch (err) {
      deps.stats.failed++;
      deps.stats.consecutiveFailures++;
      throw err;
    }
    deps.memory.append(msg.channelId, memoryQuestion, { role: 'assistant', content: answer });
    deps.stats.answered++;
    deps.stats.consecutiveFailures = 0;
  });
}

/** Fetches the message being replied to, unless it was authored by the bot itself. */
async function getReferencedContext(msg: Message, botId: string): Promise<string | null> {
  if (!msg.reference?.messageId) return null;
  try {
    const ref = await msg.fetchReference();
    if (ref.author.id === botId) return null; // bot's own prior reply is already in channel history
    const author = ref.author.displayName || ref.author.username;
    const body = ref.content.slice(0, 500).trim();
    return body ? `[Replying to ${author}: "${body}"]` : null;
  } catch {
    return null; // message deleted or inaccessible
  }
}

/** Downloads an attachment and converts it to a base64 data URI for vision models. */
async function toDataUri(url: string, contentType: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

const TEXT_EXTENSIONS: Record<string, true> = {
  txt: true, md: true, json: true, js: true, ts: true, tsx: true, jsx: true,
  py: true, rs: true, go: true, c: true, cpp: true, h: true, hpp: true,
  css: true, html: true, xml: true, yaml: true, yml: true, toml: true,
  sh: true, bash: true, sql: true, env: true, log: true, csv: true, diff: true, patch: true,
};

function isTextAttachment(a: Attachment): boolean {
  if (a.contentType?.startsWith('text/') || a.contentType === 'application/json') {
    return true;
  }
  const ext = a.name?.split('.').pop()?.toLowerCase();
  return ext !== undefined && TEXT_EXTENSIONS[ext] === true;
}

/** Downloads a text or code attachment, bounded to 20,000 characters. */
async function toTextContent(url: string, name: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const text = await res.text();
    return `[Attached file: ${name}]\n\`\`\`\n${text.slice(0, 20_000)}\n\`\`\``;
  } catch {
    return null;
  }
}

async function withTyping<T>(channel: SendableChannels, task: () => Promise<T>): Promise<T> {
  const ping = () => void channel.sendTyping().catch(() => {});
  ping();
  const timer = setInterval(ping, TYPING_REFRESH_MS);
  try {
    return await task();
  } finally {
    clearInterval(timer);
  }
}

async function sendAnswer(msg: Message, channel: SendableChannels, answer: string): Promise<void> {
  const parts = chunk(answer);
  const canThread = msg.inGuild() && !msg.channel.isThread();
  const row = buildActionRow(msg.author.id, canThread);

  if (parts.length <= 2) {
    const [first, second] = parts;
    if (second) {
      await msg.reply({ content: first ?? '', allowedMentions: NO_PINGS });
      await channel.send({ content: second, components: [row], allowedMentions: NO_PINGS });
    } else {
      await msg.reply({ content: first ?? '', components: [row], allowedMentions: NO_PINGS });
    }
    return;
  }

  // Long answer (>4,000 chars): send first part as preview and attach full markdown file
  const preview = parts[0] ?? '';
  const file = new AttachmentBuilder(Buffer.from(answer, 'utf-8'), { name: 'response.md' });
  await msg.reply({
    content: `${preview}\n\n*(Full response attached as response.md)*`,
    files: [file],
    components: [row],
    allowedMentions: NO_PINGS,
  });
}

function buildActionRow(authorId: string, canThread: boolean) {
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
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`del:${authorId}`)
      .setLabel('Delete')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary),
  );
  return row;
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [action, authorId] = interaction.customId.split(':');
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
}

/** Maps a tool name to a short visual status emoji. */
function toolEmoji(toolName: string): string {
  switch (toolName) {
    case 'wikipedia_search':
      return '🔍';
    case 'web_search':
      return '🔎';
    case 'fetch_page':
      return '🌐';
    case 'get_current_time':
      return '⏱️';
    case 'read_channel_history':
      return '📜';
    case 'eval_math':
      return '🔢';
    default:
      return '⚙️';
  }
}
