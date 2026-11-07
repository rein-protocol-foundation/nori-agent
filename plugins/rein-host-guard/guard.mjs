import path from 'node:path';
import { realpathSync } from 'node:fs';

// An accident guard, NOT a shell parser or a security boundary against arbitrary code.
export function createHostGuard({ protectedPaths, defaultCwd }) {
  const canonical = value => {
    const absolute = path.resolve(value);
    try { return realpathSync(absolute); } catch {
      const parent = path.dirname(absolute);
      return parent === absolute ? absolute : path.join(canonical(parent), path.basename(absolute));
    }
  };
  const roots = protectedPaths.map(canonical);
  const overlaps = value => {
    const target = canonical(value);
    return roots.some(root => target === root || target.startsWith(root + '/') ||
      root.startsWith(target === '/' ? '/' : target + '/'));
  };
  const blocked = () => ({ block: true, blockReason:
    'Nori host guard: deletion of system files, OpenClaw core or core plugins is prohibited. Edit in place; do not bypass this guard. Ordinary project files remain writable.' });
  return event => {
    const args = event.params ?? {};
    const cwd = path.resolve(args.workdir ?? args.cwd ?? defaultCwd);
    if (event.toolName === 'apply_patch') {
      const patch = args.input ?? args.patch ?? '';
      for (const match of patch.matchAll(/^\*\*\* Delete File:\s*(.+)$/gm))
        if (overlaps(path.resolve(cwd, match[1].trim()))) return blocked();
    }
    if (event.toolName !== 'exec') return;
    const command = args.command ?? '';
    if (!/(?:\b(?:rm|rmdir|unlink|shred|rmtree|remove|removedirs)\b|\bfind\b[\s\S]*-delete|\bgit\s+clean\b|\brsync\b[\s\S]*--delete)/.test(command)) return;
    // Catch literal operands, quoted paths and cd targets. Expansion/indirection cannot be
    // reliably evaluated here; operating instructions prohibit circumventing the guard.
    const tokens = command.match(/"[^"]*"|'[^']*'|[^\s;&|<>]+/g) ?? [];
    if (overlaps(cwd)) return blocked();
    for (let token of tokens) {
      token = token.replace(/^['"]|['"]$/g, '').replace(/[,*?].*$/, '');
      if (!token || token.startsWith('-')) continue;
      if (overlaps(path.resolve(cwd, token))) return blocked();
    }
  };
}
