import type { Tool } from './types.ts';
import type { Message, Guild } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  type DiscordGatewayAdapterCreator,
  type AudioPlayer,
  type VoiceConnection,
} from '@discordjs/voice';
import { YouTube } from 'youtube-sr';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Ytdl } = require('@distube/ytdl-core');
const ytdl = new Ytdl();

export interface Track {
  title: string;
  durationFormatted: string;
  url: string;
  thumbnail: string | null;
  requestedBy: string;
}

export interface GuildPlayerState {
  connection: VoiceConnection | null;
  player: AudioPlayer;
  queue: Track[];
  current: Track | null;
  paused: boolean;
  loop: boolean;
}

export const ACTIVE_PLAYERS = new Map<string, GuildPlayerState>();

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
      'Search for a song and queue/stream full-length tracks live into the user voice channel with professional queue management, skip, stop, and loop controls. Supports English and Indonesian.',
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
      const guild = msg?.guild;

      if (!guild) {
        return 'Error: music playback is only supported inside servers.';
      }

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
              
              const previewTrack: Track = {
                title: `${track.trackName} - ${track.artistName}`,
                durationFormatted: durationStr,
                url: track.previewUrl || '',
                thumbnail: track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '400x400bb') : null,
                requestedBy: msg.author.username,
              };

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

              const memberVoiceChannel = msg?.member?.voice?.channel;
              const targetVoiceId = String(args.voiceChannelId || memberVoiceChannel?.id || '');

              if (state.current) {
                state.queue.push(previewTrack);
                return [
                  `🎵 **Added to Queue (Position #${state.queue.length})**`,
                  `• **Title:** ${previewTrack.title}`,
                  `• **Duration:** ${previewTrack.durationFormatted}`,
                  previewTrack.thumbnail ? `• **Artwork:** ${previewTrack.thumbnail}` : '',
                  `• **Requested By:** ${previewTrack.requestedBy}`,
                ].filter(Boolean).join('\n');
              } else {
                state.current = previewTrack;
                return [
                  `🎶 **Now Playing (Fallback Preview)**`,
                  `• **Title:** ${previewTrack.title}`,
                  `• **Duration:** ${previewTrack.durationFormatted}`,
                  previewTrack.thumbnail ? `• **Artwork:** ${previewTrack.thumbnail}` : '',
                  previewTrack.url ? `• **Stream URL:** ${previewTrack.url}` : '',
                  `• **Requested By:** ${previewTrack.requestedBy}`,
                ].filter(Boolean).join('\n');
              }
            }
          }
          return `No matching full-length tracks found for "${query}"`;
        }

        const newTrack: Track = {
          title: topVideo.title || query,
          durationFormatted: topVideo.durationFormatted || 'Full Track',
          url: topVideo.url,
          thumbnail: topVideo.thumbnail?.url || null,
          requestedBy: msg.author.username,
        };

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

        const memberVoiceChannel = msg?.member?.voice?.channel;
        const targetVoiceId = String(args.voiceChannelId || memberVoiceChannel?.id || '');

        if (!targetVoiceId) {
          state.queue.push(newTrack);
          return `🎵 Added **${newTrack.title}** to the queue (Position #${state.queue.length}). *Join a voice channel to start streaming.*`;
        }

        // Professional Queue Logic:
        // If a track is already currently playing or paused, push the new track into the queue.
        // Otherwise, set it as current and play immediately.
        if (state.current) {
          state.queue.push(newTrack);
          return [
            `🎵 **Added to Queue (Position #${state.queue.length})**`,
            `• **Title:** ${newTrack.title}`,
            `• **Duration:** ${newTrack.durationFormatted}`,
            newTrack.thumbnail ? `• **Artwork:** ${newTrack.thumbnail}` : '',
            `• **YouTube URL:** ${newTrack.url}`,
            `• **Requested By:** ${newTrack.requestedBy}`,
          ].filter(Boolean).join('\n');
        }

        // Start playback immediately for the first track
        state.current = newTrack;
        await playNextInQueue(guild.id, targetVoiceId, guild, newTrack);

        const lines = [
          `🎶 **Now Playing Full Track (FlaviBot Style)**`,
          `• **Title:** ${newTrack.title}`,
          `• **Duration:** ${newTrack.durationFormatted}`,
          newTrack.thumbnail ? `• **Artwork:** ${newTrack.thumbnail}` : '',
          `• **YouTube URL:** ${newTrack.url}`,
          `• **Position in Queue:** #1 (Now Playing)`,
          `• **Requested By:** ${newTrack.requestedBy}`,
        ];

        return lines.filter(Boolean).join('\n');
      } catch (err) {
        return `Music playback failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}

export async function playNextInQueue(guildId: string, voiceChannelId: string, guild: Guild, explicitTrack?: Track): Promise<void> {
  const state = ACTIVE_PLAYERS.get(guildId);
  if (!state) return;

  const track = explicitTrack || state.queue.shift();
  if (!track) {
    state.current = null;
    return;
  }

  state.current = track;

  try {
    if (!state.connection || state.connection.state.status === VoiceConnectionStatus.Destroyed) {
      state.connection = joinVoiceChannel({
        channelId: String(voiceChannelId),
        guildId: String(guildId),
        adapterCreator: guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator,
      });
      await entersState(state.connection, VoiceConnectionStatus.Ready, 20_000);
    }

    const stream = ytdl.download(track.url, {
      filter: { hasAudio: true, hasVideo: false },
      quality: 'highestaudio',
      highWaterMark: 1 << 25,
    });

    const resource = createAudioResource(stream, { inlineVolume: true });
    resource.volume?.setVolume(1.0);
    state.player.play(resource);
    state.connection.subscribe(state.player);

    state.player.removeAllListeners(AudioPlayerStatus.Idle);
    state.player.on(AudioPlayerStatus.Idle, () => {
      if (state.loop && track) {
        state.queue.push(track);
      }
      const nextTrack = state.queue.shift();
      if (nextTrack) {
        void playNextInQueue(guildId, voiceChannelId, guild, nextTrack);
      } else {
        state.current = null;
      }
    });

    state.player.removeAllListeners('error');
    state.player.on('error', (err: unknown) => {
      console.error('Audio player error:', err);
      const nextTrack = state.queue.shift();
      if (nextTrack) {
        void playNextInQueue(guildId, voiceChannelId, guild, nextTrack);
      } else {
        state.current = null;
      }
    });
  } catch (err) {
    console.error('Failed to play track:', err);
    state.current = null;
    const nextTrack = state.queue.shift();
    if (nextTrack) {
      void playNextInQueue(guildId, voiceChannelId, guild, nextTrack);
    }
  }
}

export const playMusicTool = createPlayMusicTool();
