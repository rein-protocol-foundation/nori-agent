// Discord's limit is kept conservatively in UTF-16 code units. Iteration by
// code point preserves surrogate pairs even when they straddle the boundary.
export function* splitDiscordReply(text) {
  let chunk = '';
  for (const point of text) {
    if (chunk.length + point.length > 1900) {
      yield chunk;
      chunk = '';
    }
    chunk += point;
  }
  if (chunk) yield chunk;
}
