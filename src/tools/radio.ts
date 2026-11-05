import type { Tool } from './types.ts';
import type { Message } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  VoiceConnectionStatus,
  entersState,
  type DiscordGatewayAdapterCreator,
} from '@discordjs/voice';
import { ACTIVE_PLAYERS } from './music.ts';

const RADIO_PRESETS: Record<string, { name: string; url: string }> = {
  lofi: { name: 'Lofi Hip Hop Radio', url: 'https://iloradio.org/stream' },
  classical: { name: 'Classical Public Radio', url: 'https://streams.publicradio.org/ipt.mp3' },
  jazz: { name: 'Smooth Jazz Radio', url: 'https://жайз.рф/jazz' },
  chillout: { name: 'Chillout Dream Radio', url: 'https://stream.zeno.fm/f3wvbbqmdv8uv' },
};

export interface PlayRadioArgs {
  station?: string;
  url?: string;
  voiceChannelId?: string;
}

export function createPlayRadioTool(getContext?: () => { message?: Message }): Tool {
  return {
    name: 'play_radio',
    description:
      'Stream a live Internet radio station (Icecast/Shoutcast stream URL or preset like lofi, jazz, classical) live into the user voice channel.',
    parameters: {
      type: 'object',
      properties: {
        station: { type: 'string', description: 'Preset radio station name (lofi, classical, jazz, chillout)' },
        url: { type: 'string', description: 'Direct live radio stream URL (.mp3 or .aac stream)' },
        voiceChannelId: { type: 'string', description: 'Optional voice channel ID to join' },
      },
      required: [],
    },
    async execute(args): Promise<string> {
      const stationKey = String(args.station || '').trim().toLowerCase();
      const directUrl = String(args.url || '').trim();

      const preset = RADIO_PRESETS[stationKey] || RADIO_PRESETS['lofi'];
      const streamUrl = directUrl || preset?.url;
      const stationName = directUrl ? 'Custom Radio Stream' : (preset?.name || 'Live Radio');

      if (!streamUrl) return 'Error: station or url is required';

      const ctx = getContext?.();
      const msg = ctx?.message;
      const guild = msg?.guild;

      if (!guild) {
        return 'Error: radio streaming is only supported inside servers.';
      }

      const memberVoiceChannel = msg?.member?.voice?.channel;
      const targetVoiceId = String(args.voiceChannelId || memberVoiceChannel?.id || '');

      if (!targetVoiceId) {
        return `🎵 Selected radio station: **${stationName}**. *Join a voice channel to start live streaming.*`;
      }

      try {
        let state = ACTIVE_PLAYERS.get(guild.id);
        if (!state) {
          state = {
            connection: null,
            player: createAudioPlayer(),
            queue: [],
            current: null,
            paused: false,
            loop: false,
          };
          ACTIVE_PLAYERS.set(guild.id, state);
        }

        if (state.connection && state.connection.state.status !== VoiceConnectionStatus.Destroyed) {
          try {
            state.connection.destroy();
          } catch {}
        }

        const connection = joinVoiceChannel({
          channelId: targetVoiceId,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator,
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
        state.connection = connection;

        const resource = createAudioResource(streamUrl, { inlineVolume: true });
        resource.volume?.setVolume(1.0);
        state.player.play(resource);
        connection.subscribe(state.player);

        state.current = {
          title: stationName,
          durationFormatted: 'Live 24/7',
          url: streamUrl,
          thumbnail: null,
          requestedBy: msg.author.username,
        };

        state.player.removeAllListeners('error');
        state.player.on('error', (err) => {
          console.error('Radio player error:', err);
        });

        return [
          `📻 **Now Streaming Live Radio**`,
          `• **Station:** ${stationName}`,
          `• **Stream URL:** ${streamUrl}`,
          `• **Voice Status:** 🔊 Connected & streaming live audio 24/7!`,
        ].join('\n');
      } catch (err) {
        return `Radio streaming failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}

export const playRadioTool = createPlayRadioTool();
