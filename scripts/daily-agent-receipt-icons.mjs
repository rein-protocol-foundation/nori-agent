// Fixed, locally bundled MIT-licensed vectors. See assets/daily-agent-receipt/PROVENANCE.md.
import { readFileSync } from 'node:fs';
const files = { alibaba: 'alibabacloud-color.svg', deepseek: 'deepseek-color.svg', qwen: 'qwen-color.svg',
  openai: 'openai.svg', google: 'google-color.svg', gemini: 'gemini-color.svg' };
const icons = Object.fromEntries(Object.entries(files).map(([name, file]) => {
  const source = readFileSync(new URL(`../assets/daily-agent-receipt/icons/${file}`, import.meta.url), 'utf8');
  // Only reviewed static vectors enter this map; no API-supplied SVG is accepted.
  if (/<(?:script|image|foreignObject)\b|(?:href|src)=/i.test(source)) throw new Error('Unsafe bundled receipt icon');
  const body = source.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    .replace(/fill="(?!none)[^"]*"/g, 'fill="currentColor"')
    .replace(/<defs>[\s\S]*?<\/defs>/g, '');
  return [name, body];
}));
export function providerIconName(provider) {
  const value = provider.toLowerCase();
  if (/bailian|alibaba|dashscope/.test(value)) return 'alibaba';
  if (/openai|chatgpt|codex/.test(value)) return 'openai';
  if (/google|gemini/.test(value)) return 'google';
  if (/deepseek/.test(value)) return 'deepseek';
  if (/qwen/.test(value)) return 'qwen';
  return null;
}
export function modelIconName(model, provider) {
  const value = model.toLowerCase().split('/').at(-1);
  if (value.startsWith('deepseek')) return 'deepseek';
  if (value.startsWith('qwen')) return 'qwen';
  if (value.startsWith('gemini')) return 'gemini';
  if (/^(?:gpt-|o[134](?:-|$))/.test(value)) return 'openai';
  return providerIconName(provider);
}
export function receiptIcon(name, x, y, size) {
  return icons[name] ? `<svg data-icon="${name}" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" color="#1f1d20" fill="currentColor">${icons[name]}</svg>` :
    `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 5}" fill="#1f1d20"/>`;
}
