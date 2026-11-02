import type { Tool } from './types.ts';
import type { Message } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  type DiscordGatewayAdapterCreator,
} from '@discordjs/voice';

export interface PlaySpotifyArgs {
  query: string;
  channelId?: string;
  guildId?: string;
  voiceChannelId?: string;
}

export function createPlaySpotifyTool(getContext?: () => { message?: Message }): Tool {
  return {
    name: 'play_spotify',
    description:
      'Search for a track and optionally join the user voice channel to stream audio live like FlaviBot. Supports English and Indonesian (e.g. "putar lagu ...", "puterin ...", "play ...").',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Song title, artist name, or track search query' },
        voiceChannelId: { type: 'string', description: 'Optional voice channel ID to join and stream into' },
      },
      required: ['query'],
    },
    async execute(args): Promise<string> {
      const query = String(args.query || '').trim();
      if (!query) return 'Error: query is required';

      const ctx = getContext?.();
      const msg = ctx?.message;

      try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return `Music search error (${res.status})`;

        const data = (await res.json()) as {
          results?: Array<{
            trackName: string;
            artistName: string;
            collectionName: string;
            previewUrl?: string;
            artworkUrl100?: string;
            trackTimeMillis?: number;
          }>;
        };

        const track = data.results?.[0];
        if (!track) return `No matching music tracks found for "${query}"`;

        const durationSec = Math.round((track.trackTimeMillis ?? 0) / 1_000);
        const mins = Math.floor(durationSec / 60);
        const secs = durationSec % 60;
        const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;

        let voiceStatus = 'Voice channel not joined (search result only)';

        const memberVoiceChannel = msg?.member?.voice?.channel;
        const targetVoiceId = args.voiceChannelId || memberVoiceChannel?.id;
        const guild = msg?.guild;

        if (targetVoiceId && guild && track.previewUrl) {
          try {
            const connection = joinVoiceChannel({
              channelId: String(targetVoiceId),
              guildId: String(guild.id),
              adapterCreator: guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator,
            });

            await entersState(connection, VoiceConnectionStatus.Ready, 5_000);

            const player = createAudioPlayer();
            const resource = createAudioResource(track.previewUrl);
            player.play(resource);
            connection.subscribe(player);

            player.on(AudioPlayerStatus.Idle, () => {
              try {
                connection.destroy();
              } catch {}
            });

            voiceStatus = `🔊 Connected to voice channel & streaming audio preview!`;
          } catch (voiceErr) {
            voiceStatus = `⚠️ Voice join failed: ${voiceErr instanceof Error ? voiceErr.message : String(voiceErr)}`;
          }
        }

        const lines = [
          `🎶 **Now Playing / Track Found (FlaviBot Voice Style)**`,
          `• **Title:** ${track.trackName}`,
          `• **Artist:** ${track.artistName}`,
          `• **Album:** ${track.collectionName}`,
          `• **Duration:** ${durationStr}`,
          track.artworkUrl100 ? `• **Artwork:** ${track.artworkUrl100.replace('100x100bb', '400x400bb')}` : '',
          track.previewUrl ? `• **Audio Stream:** ${track.previewUrl}` : '',
          `• **Voice Status:** ${voiceStatus}`,
        ];

        return lines.filter(Boolean).join('\n');
      } catch (err) {
        return `Music playback failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}

export const playSpotifyTool = createPlaySpotifyTool();
