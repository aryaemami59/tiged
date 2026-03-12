/**
 * A value that may be provided either as a single item or as an array of
 * items.
 *
 * @template T - The type of the individual item.
 *
 * @internal
 * @since 3.0.0
 */
type Arrayable<T> = T | T[];

/**
 * A plain object keyed by strings, mapping each key to a value of type
 * {@linkcode T}.
 *
 * @template T - The type of the mapped values.
 *
 * @internal
 * @since 3.0.0
 */
type Dict<T> = Record<string, T>;

/**
 * Configuration options that control how
 * {@linkcode parseCliArgs | parseCliArgs()} interprets the raw command-line
 * arguments.
 *
 * @public
 * @since 3.0.0
 */
export type CliParserOptions = {
  /**
   * Argument keys (and their {@linkcode CliParserOptions.alias | aliases})
   * that should always be parsed as booleans.
   */
  boolean?: Arrayable<string>;

  /**
   * Argument keys (and their {@linkcode CliParserOptions.alias | aliases})
   * that should always be parsed as strings.
   */
  string?: Arrayable<string>;

  /**
   * A mapping of argument keys to one or more alias names. Each alias
   * resolves to the same value as its canonical key in the parsed output.
   */
  alias?: Dict<Arrayable<string>>;

  /**
   * Default values applied to keys that are absent from the parsed arguments.
   */
  default?: Dict<unknown>;

  /**
   * Callback invoked when an unknown flag is encountered. Providing this
   * option puts the parser into strict mode.
   *
   * @param flag - The unrecognized flag, including its leading dashes.
   * @returns A replacement value for the parsed output, or `undefined` to reject the flag.
   */
  unknown?(flag: string): unknown;
};

/**
 * The result produced by {@linkcode parseCliArgs | parseCliArgs()}. It
 * contains every parsed flag merged with {@linkcode T}, alongside the
 * positional arguments collected under {@linkcode CliParserArgv._ | _}.
 *
 * @template T - The shape of the named (flag) arguments.
 *
 * @public
 * @since 3.0.0
 */
export type CliParserArgv<T = Dict<unknown>> = T & {
  /**
   * The positional arguments that were not consumed by any flag.
   */
  _: (string | number | boolean)[];
};

/**
 * A fully resolved form of {@linkcode CliParserOptions} in which every
 * optional field has been normalized to a concrete value, ready for use by
 * {@linkcode parseCliArgs | parseCliArgs()}.
 *
 * @internal
 * @since 3.0.0
 */
type NormalizedOptions = {
  alias: Record<string, string[]>;

  boolean: string[];

  string: string[];

  default: Dict<unknown>;

  unknown?: ((flag: string) => unknown) | undefined;
};

const toArray = <T>(value: Arrayable<T> | undefined | null): T[] => {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

const toValue = (
  out: CliParserArgv,
  key: string,
  val: boolean | string | number,
  opts: Pick<NormalizedOptions, 'string' | 'boolean'>,
) => {
  const oldValue = out[key];

  let nextValue: boolean | string | number;

  if (opts.string.includes(key)) {
    nextValue = val == null || val === true ? '' : String(val);
  } else if (typeof val === 'boolean') {
    nextValue = val;
  } else if (opts.boolean.includes(key)) {
    if (val === 'false') {
      nextValue = false;
    } else if (val === 'true') {
      nextValue = true;
    } else {
      const numeric = +val;

      out._.push(numeric * 0 === 0 ? numeric : val);

      nextValue = !!val;
    }
  } else {
    const numeric = +val;

    nextValue = numeric * 0 === 0 ? numeric : val;
  }

  if (oldValue == null) {
    out[key] = nextValue;
  } else if (Array.isArray(oldValue)) {
    out[key] = oldValue.concat(nextValue);
  } else {
    out[key] = [oldValue, nextValue];
  }
};

const normalizeAliases = (opts: NormalizedOptions) => {
  for (const key of Object.keys(opts.alias)) {
    const aliases = toArray(opts.alias[key] ?? []);

    opts.alias[key] = aliases;

    for (let i = 0; i < aliases.length; i += 1) {
      const alias = aliases[i];

      if (!alias) {
        continue;
      }

      const group = aliases.concat(key);

      group.splice(i, 1);

      opts.alias[alias] = group;
    }
  }
};

const normalizeOptions = (options: CliParserOptions): NormalizedOptions => {
  const alias: Record<string, string[]> = {};

  if (options.alias) {
    for (const key of Object.keys(options.alias)) {
      alias[key] = toArray(options.alias[key]);
    }
  }

  return {
    alias,
    boolean: toArray(options.boolean),
    string: toArray(options.string),
    default: options.default || {},
    unknown: options.unknown,
  };
};

/**
 * Parses an array of raw command-line arguments into a structured object of
 * named flags and positional arguments.
 *
 * Flags may be provided in long (**`--flag`**) or short (**`-f`**) form, with
 * values supplied either inline (**`--flag=value`**) or as the following
 * argument (**`--flag value`**). A bare **`--`** terminates flag parsing and
 * collects the remaining arguments as positionals.
 *
 * @template T - The shape of the named (flag) arguments.
 * @param args - The raw command-line arguments to parse, typically  {@linkcode process.argv | process.argv.slice(2)}.
 * @param options - Configuration controlling how the arguments are interpreted.
 * @returns A {@linkcode CliParserArgv} object, or `undefined` when an unknown flag is rejected in strict mode.
 *
 * @example
 * <caption>#### Parse boolean and string flags</caption>
 *
 * ```ts
 * const argv = parseCliArgs(["--force", "--mode=git", "src", "dest"], {
 *   boolean: ["force"],
 *   string: ["mode"],
 * });
 *
 * console.log(argv?.force); // true
 * console.log(argv?.mode); // "git"
 * console.log(argv?._); // ["src", "dest"]
 * ```
 *
 * @public
 * @since 3.0.0
 */
export function parseCliArgs<T = Dict<unknown>>(
  args: (boolean | string | number)[] = [],
  options: CliParserOptions = {},
): CliParserArgv<T> | undefined {
  const out: CliParserArgv = { _: [] };

  const opts = normalizeOptions(options);

  const hasAliases = options.alias !== undefined;

  const strict = options.unknown !== undefined;

  const hasDefaults = options.default !== undefined;

  if (hasAliases) {
    normalizeAliases(opts);
  }

  for (let i = opts.boolean.length; i-- > 0;) {
    const key = opts.boolean[i];

    if (!key) {
      continue;
    }

    const list = opts.alias[key] ?? [];

    for (let j = list.length; j-- > 0;) {
      const alias = list[j];

      if (alias) {
        opts.boolean.push(alias);
      }
    }
  }

  for (let i = opts.string.length; i-- > 0;) {
    const key = opts.string[i];

    if (!key) {
      continue;
    }

    const list = opts.alias[key] ?? [];

    for (let j = list.length; j-- > 0;) {
      const alias = list[j];

      if (alias) {
        opts.string.push(alias);
      }
    }
  }

  if (hasDefaults) {
    for (const key of Object.keys(opts.default)) {
      const type = typeof opts.default[key];

      const list = (opts.alias[key] = opts.alias[key] || []);

      const targetList =
        type === 'boolean'
          ? opts.boolean
          : type === 'string'
            ? opts.string
            : null;

      if (targetList) {
        targetList.push(key);

        for (const alias of list) {
          if (alias) {
            targetList.push(alias);
          }
        }
      }
    }
  }

  const allowedKeys = strict ? Object.keys(opts.alias) : [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';

    if (arg === '--') {
      out._ = out._.concat(args.slice(i + 1));

      break;
    }

    if (typeof arg !== 'string') {
      out._.push(arg);

      continue;
    }

    let dashCount = 0;

    for (; dashCount < arg.length; dashCount += 1) {
      if (arg.charCodeAt(dashCount) !== 45) {
        break;
      }
    }

    if (dashCount === 0) {
      out._.push(arg);

      continue;
    }

    if (arg.substring(dashCount, dashCount + 3) === 'no-') {
      const name = arg.substring(dashCount + 3);

      if (strict && !allowedKeys.includes(name)) {
        return typeof opts.unknown === 'function'
          ? (opts.unknown?.(arg) as CliParserArgv<T>)
          : undefined;
      }

      out[name] = false;

      continue;
    }

    let idx = dashCount + 1;

    for (; idx < arg.length; idx += 1) {
      if (arg.charCodeAt(idx) === 61) {
        break;
      }
    }

    let name = arg.substring(dashCount, idx);

    const nextIndex = idx + 1;

    const inlineValue = arg.substring(nextIndex);

    const nextArg = args[i + 1];

    const nextArgString = nextArg == null ? '' : String(nextArg);

    const nextIsFlag = nextArgString.charCodeAt(0) === 45;

    const value: boolean | string | number =
      inlineValue ||
      (i + 1 === args.length || nextIsFlag ? true : (args[++i] ?? ''));

    const list = dashCount === 2 ? [name] : name;

    for (let j = 0; j < list.length; j += 1) {
      const nextName = typeof list === 'string' ? list.charAt(j) : list[j];

      if (!nextName) {
        continue;
      }

      name = nextName;

      if (strict && !allowedKeys.includes(name)) {
        return typeof opts.unknown === 'function'
          ? (opts.unknown?.('-'.repeat(dashCount) + name) as CliParserArgv<T>)
          : undefined;
      }

      toValue(out, name, j + 1 < list.length || value, opts);
    }
  }

  if (hasDefaults) {
    for (const key of Object.keys(opts.default)) {
      if (out[key] === undefined) {
        out[key] = opts.default[key];
      }
    }
  }

  if (hasAliases) {
    for (const key of Object.keys(out)) {
      const list = opts.alias[key] ?? [];

      while (list.length > 0) {
        const alias = list.shift();

        if (alias) {
          out[alias] = out[key];
        }
      }
    }
  }

  return out as CliParserArgv<T>;
}
