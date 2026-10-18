export const PREFIX = "!";
export const MAX_COMMAND_LENGTH = 1_500;

/**
 * Splits `!cmd sub "quoted arg" rest` into words. Returns null for
 * anything that is not a prefix command.
 */
export function tokenise(content: string): string[] | null {
  if (!content.startsWith(PREFIX) || content.length > MAX_COMMAND_LENGTH)
    return null;
  const body = content.slice(PREFIX.length);
  if (!body || /^\s/.test(body)) return null;
  return [...body.matchAll(/"([^"]*)"|(\S+)/g)].map(
    (match) => match[1] ?? match[2]!,
  );
}

export interface Routable {
  path: readonly string[];
  aliases?: readonly (readonly string[])[];
}

/** Resolves the longest matching command path, e.g. `apply seller`. */
export function resolvePath<T extends Routable>(
  tokens: readonly string[],
  commands: readonly T[],
): { command: T; args: string[] } | null {
  const lowered = tokens.map((token) => token.toLowerCase());
  let best: { command: T; length: number } | undefined;
  for (const command of commands)
    for (const path of [command.path, ...(command.aliases ?? [])])
      if (
        path.length <= lowered.length &&
        path.every((word, index) => lowered[index] === word) &&
        path.length > (best?.length ?? 0)
      )
        best = { command, length: path.length };
  return best
    ? { command: best.command, args: tokens.slice(best.length) }
    : null;
}
