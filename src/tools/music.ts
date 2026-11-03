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
  type AudioPlayer,
} from '@discordjs/voice';
import { YouTube } from 'youtube-sr';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Ytdl } = require('@distube/ytdl-core');
const ytdl = new Ytdl();

// Global active audio players store per guild ID for pause/resume control
export const ACTIVE_PLAYERS = new Map<string, { player: AudioPlayer; paused: boolean }>();

export interface PlayMusicArgs {
  query: string;
  channelId?: string;
  guildId?: string;
  voiceChannelId?: string;
}

export function createPlayMusicTool(getContext?: () => { message?: Message }): Tool {
  return {
    name: 'play_music',
    description:
      'Search for a song and stream the FULL-LENGTH track live into the user voice channel like FlaviBot. Supports English and Indonesian (e.g. "putar lagu ...", "puterin ...", "play ...").',
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
        const results = await YouTube.search(query, { limit: 1, type: 'video' });
        const topVideo = results[0];
        if (!topVideo || !topVideo.url) {
          const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
          const res = await fetch(itunesUrl, { signal: AbortSignal.timeout(10_000) });
          if (res.ok) {
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
            if (track) {
              const durationSec = Math.round((track.trackTimeMillis ?? 0) / 1_000);
              const mins = Math.floor(durationSec / 60);
              const secs = durationSec % 60;
              const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
              return [
                `🎶 **Now Playing (Fallback Preview)**`,
                `• **Title:** ${track.trackName}`,
                `• **Artist:** ${track.artistName}`,
                `• **Album:** ${track.collectionName}`,
                `• **Duration:** ${durationStr}`,
                track.artworkUrl100 ? `• **Artwork:** ${track.artworkUrl100.replace('100x100bb', '400x400bb')}` : '',
                track.previewUrl ? `• **Audio Preview Stream:** ${track.previewUrl}` : '',
              ].filter(Boolean).join('\n');
            }
          }
          return `No matching full-length tracks found for "${query}"`;
        }

        const title = topVideo.title || query;
        const durationFormatted = topVideo.durationFormatted || 'Full Track';
        const videoUrl = topVideo.url;
        const thumbnail = topVideo.thumbnail?.url || null;

        let voiceStatus = 'Voice channel not joined (search result only)';

        const memberVoiceChannel = msg?.member?.voice?.channel;
        const targetVoiceId = args.voiceChannelId || memberVoiceChannel?.id;
        const guild = msg?.guild;

        if (targetVoiceId && guild) {
          void (async () => {
            try {
              const connection = joinVoiceChannel({
                channelId: String(targetVoiceId),
                guildId: String(guild.id),
                adapterCreator: guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator,
              });

              await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

              const stream = ytdl.download(videoUrl, {
                filter: { hasAudio: true, hasVideo: false },
                quality: 'highestaudio',
                highWaterMark: 1 << 25,
              });

              const player = createAudioPlayer();
              const resource = createAudioResource(stream, { inlineVolume: true });
              resource.volume?.setVolume(1.0);
              player.play(resource);
              connection.subscribe(player);

              ACTIVE_PLAYERS.set(guild.id, { player, paused: false });

              player.on('error', (error) => {
                console.error('Audio player error:', error);
              });
              player.on(AudioPlayerStatus.Idle, () => {
                ACTIVE_PLAYERS.delete(guild.id);
                try {
                  connection.destroy();
                } catch {}
              });
            } catch (err) {
              console.error('Background full-track voice stream error:', err);
            }
          })();

          voiceStatus = `🔊 Connected to voice channel & streaming FULL TRACK live!`;
        } else {
          voiceStatus = `🔗 Stream ready (join voice channel to auto-stream full track).`;
        }

        const lines = [
          `🎶 **Now Playing Full Track (FlaviBot Style)**`,
          `• **Title:** ${title}`,
          `• **Duration:** ${durationFormatted}`,
          thumbnail ? `• **Artwork:** ${thumbnail}` : '',
          `• **YouTube URL:** ${videoUrl}`,
          `• **Voice Status:** ${voiceStatus}`,
        ];

        return lines.filter(Boolean).join('\n');
      } catch (err) {
        return `Full-track music playback failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}

export const playMusicTool = createPlayMusicTool();
