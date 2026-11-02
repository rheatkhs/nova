/** Generates MP3 audio buffer from text using zero-key standard TTS. */
export async function generateSpeechAudio(text: string, baseUrl?: string): Promise<Buffer> {
  const clean = text.replace(/[*_#`~>]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = baseUrl || 'https://translate.google.com/translate_tts';
  const url = `${base}?ie=UTF-8&q=${encodeURIComponent(clean)}&tl=en&client=tw-ob`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`TTS service error (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
