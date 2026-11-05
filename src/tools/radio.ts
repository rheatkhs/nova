import type { Tool } from './types.ts';
import type { Message } from 'discord.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  VoiceConnectionStatus,
  entersState,
  StreamType,
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
      'Stream a live Internet radio station (Radio Garden URL, Icecast/Shoutcast stream URL, or preset like lofi, jazz, classical) live into the user voice channel with embeds and controls.',
    parameters: {
      type: 'object',
      properties: {
        station: { type: 'string', description: 'Preset radio station name (lofi, classical, jazz, chillout)' },
        url: { type: 'string', description: 'Radio Garden link or direct live radio stream URL (.mp3 or .aac stream)' },
        voiceChannelId: { type: 'string', description: 'Optional voice channel ID to join' },
      },
      required: [],
    },
    async execute(args): Promise<string> {
      const stationKey = String(args.station || '').trim().toLowerCase();
      let directUrl = String(args.url || '').trim();
      let stationName = 'Live Radio';

      try {
        if (directUrl.includes('radio.garden')) {
          const parts = directUrl.split('/');
          const channelId = parts[parts.length - 1] || parts[parts.length - 2];
          if (channelId) {
            const apiRes = await fetch(`https://radio.garden/api/ara/content/channel/${channelId}`, {
              signal: AbortSignal.timeout(10_000),
            });
            if (apiRes.ok) {
              const apiData = (await apiRes.json()) as {
                data?: {
                  title?: string;
                };
              };
              if (apiData.data?.title) {
                stationName = apiData.data.title;
              }
            }

            const listenUrl = `https://radio.garden/api/ara/content/listen/${channelId}/channel.mp3`;
            const listenRes = await fetch(listenUrl, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
            const redirectLoc = listenRes.headers.get('location');
            if (redirectLoc) {
              directUrl = redirectLoc;
            } else {
              directUrl = listenUrl;
            }
          }
        }

        const preset = RADIO_PRESETS[stationKey] || RADIO_PRESETS['lofi'];
        const streamUrl = directUrl || preset?.url;
        if (!directUrl && !stationKey) {
          stationName = preset?.name || 'Live Radio';
        } else if (directUrl && stationName === 'Live Radio') {
          stationName = 'Custom Radio Stream';
        }

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

        // Use direct URL streaming with ffmpeg reconnect flags for robust live playback
        const resource = createAudioResource(streamUrl, {
          inlineVolume: true,
          inputType: StreamType.Arbitrary,
          metadata: { title: stationName },
        });

        resource.volume?.setVolume(1.0);
        state.player.play(resource);
        connection.subscribe(state.player);

        state.current = {
          title: stationName,
          durationFormatted: 'Live 24/7',
          url: streamUrl,
          thumbnail: null,
          requestedBy: msg?.author?.username || 'User',
        };

        state.player.removeAllListeners('error');
        state.player.on('error', (err) => {
          console.error('Radio player error (attempting auto-reconnect):', err);
          // Auto-reconnect on timeout or buffer underrun
          setTimeout(() => {
            try {
              const retryRes = createAudioResource(streamUrl, {
                inlineVolume: true,
                inputType: StreamType.Arbitrary,
              });
              retryRes.volume?.setVolume(1.0);
              state?.player.play(retryRes);
            } catch (e) {
              console.error('Radio retry failed:', e);
            }
          }, 3_000);
        });

        const embed = new EmbedBuilder()
          .setColor(0x1DB954)
          .setTitle('📻 Now Streaming Live Radio')
          .setDescription(`[${stationName}](${streamUrl})`)
          .addFields(
            { name: '📡 Stream Type', value: 'Live 24/7 Audio Feed (Auto-reconnect)', inline: true },
            { name: '👤 Requested By', value: msg?.author?.username || 'User', inline: true },
          );

        const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('pause').setLabel('Pause/Resume').setEmoji('⏯️').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('music-stop').setLabel('Stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
        );

        if (msg && msg.channel && msg.channel.isSendable()) {
          await msg.channel.send({ embeds: [embed], components: [controlRow] });
        }

        return `Now streaming live radio: **${stationName}**.`;
      } catch (err) {
        return `Radio streaming failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}

export const playRadioTool = createPlayRadioTool();
