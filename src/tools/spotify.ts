import type { Tool } from './types.ts';

export interface SpotifyTrack {
  title: string;
  artist: string;
  album: string;
  previewUrl: string | null;
  artworkUrl: string | null;
  durationMs: number;
}

export const playSpotifyTool: Tool = {
  name: 'play_spotify',
  description:
    'Search for a song, album, or artist (or resolve a Spotify / music link) and return playable track info, artwork, and audio preview stream like FlaviBot.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Song title, artist name, or Spotify search query' },
    },
    required: ['query'],
  },
  async execute(args): Promise<string> {
    const query = String(args.query || '').trim();
    if (!query) return 'Error: query is required';

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

      const lines = [
        `🎶 **Now Playing / Track Found (FlaviBot Style)**`,
        `• **Title:** ${track.trackName}`,
        `• **Artist:** ${track.artistName}`,
        `• **Album:** ${track.collectionName}`,
        `• **Duration:** ${durationStr}`,
        track.artworkUrl100 ? `• **Artwork:** ${track.artworkUrl100.replace('100x100bb', '400x400bb')}` : '',
        track.previewUrl ? `• **Audio Preview Stream:** ${track.previewUrl}` : '',
        '',
        '-# Connected to audio stream. Use voice channel commands or play preview directly.',
      ];

      return lines.filter(Boolean).join('\n');
    } catch (err) {
      return `Music playback search failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
