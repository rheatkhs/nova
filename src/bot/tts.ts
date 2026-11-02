/** Generates MP3 audio buffer from text using zero-key standard TTS. */
export async function generateSpeechAudio(text: string, locale = 'en', baseUrl = 'https://translate.google.com/translate_tts'): Promise<Buffer> {
  const clean = text.replace(/[*_#`~>]/g, ' ').replace(/\s+/g, ' ').trim();
  const url = `${baseUrl}?ie=UTF-8&q=${encodeURIComponent(clean)}&tl=${encodeURIComponent(locale)}&client=tw-ob&total=1&idx=0&textlen=${clean.length}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://translate.google.com/',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`TTS service error (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
