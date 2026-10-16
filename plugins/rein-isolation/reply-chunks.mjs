// The transport's payload limit is measured in UTF-16 code units. Iteration by
// code point preserves surrogate pairs even when they straddle the boundary.
export function* splitReply(text, maxCodeUnits = 1900) {
  if (!Number.isInteger(maxCodeUnits) || maxCodeUnits < 2) throw new Error('Invalid reply chunk limit');
  let chunk = '';
  for (const point of text) {
    if (chunk.length + point.length > maxCodeUnits) {
      yield chunk;
      chunk = '';
    }
    chunk += point;
  }
  if (chunk) yield chunk;
}
