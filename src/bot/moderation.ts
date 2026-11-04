import type { Message, Client } from 'discord.js';
import { Events, PermissionFlagsBits } from 'discord.js';
import { events } from '../events.ts';

const SPAM_PATTERNS: readonly RegExp[] = [
  /discord\.gg\/[a-zA-Z0-9]+/i,
  /discord\.com\/invite\/[a-zA-Z0-9]+/i,
  /freenitro/i,
  /steamgift/i,
  /crypto-giveaway/i,
];

const BANNED_WORDS: readonly string[] = [];

export function setupModeration(client: Client): void {
  client.on(Events.MessageCreate, async (msg: Message) => {
    if (msg.author.bot || !msg.inGuild() || !msg.channel.isSendable()) return;

    if (msg.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return;
    }

    const content = msg.content || '';
    let flaggedReason: string | null = null;

    for (const pattern of SPAM_PATTERNS) {
      if (pattern.test(content)) {
        flaggedReason = 'Unauthorized invite link or potential phishing spam';
        break;
      }
    }

    if (!flaggedReason && BANNED_WORDS.length > 0) {
      const lower = content.toLowerCase();
      for (const word of BANNED_WORDS) {
        if (lower.includes(word)) {
          flaggedReason = 'Forbidden prohibited word detected';
          break;
        }
      }
    }

    if (flaggedReason) {
      try {
        await msg.delete();
        const warning = await msg.channel.send({
          content: `⚠️ **Auto-Moderation:** Hey ${msg.author}, your message was removed because it violated server rules: *${flaggedReason}*.`,
        });
        setTimeout(() => void warning.delete().catch(() => {}), 6_000);

        events.broadcast(
          'error',
          `Auto-mod removed message from ${msg.author.tag} in #${msg.channel.id}: ${flaggedReason}`,
        );
      } catch (err) {
        console.error('Auto-moderation action failed:', err);
      }
    }
  });
}
