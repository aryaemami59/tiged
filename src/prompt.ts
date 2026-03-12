import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline';
import * as readlinePromises from 'node:readline/promises';

/**
 * The default number of choices rendered by
 * {@linkcode promptAutocomplete | promptAutocomplete()} when no explicit
 * {@linkcode AutocompletePromptConfig.limit | limit} is set.
 *
 * @internal
 * @since 3.0.0
 */
const defaultListLimit = 10;

/**
 * A single selectable entry presented by
 * {@linkcode promptAutocomplete | promptAutocomplete()}.
 *
 * @public
 * @since 3.0.0
 */
export type PromptChoice = {
  /**
   * An optional secondary label associated with the choice
   * (e.g. a commit hash).
   */
  name?: string;

  /**
   * The text displayed to the user for this choice.
   */
  message: string;

  /**
   * The value returned when this choice is selected.
   */
  value: string;
};

/**
 * Configuration for {@linkcode promptInput | promptInput()}.
 *
 * @public
 * @since 3.0.0
 */
export type InputPromptConfig = {
  /**
   * The message displayed to the user.
   */
  message: string;

  /**
   * An optional default value returned when the user submits an empty input.
   */
  initial?: string;
};

/**
 * Configuration for {@linkcode promptToggle | promptToggle()}.
 *
 * @public
 * @since 3.0.0
 */
export type TogglePromptConfig = {
  /**
   * The message displayed to the user.
   */
  message: string;

  /**
   * The value returned when the user submits an empty answer.
   *
   * @default false
   */
  initial?: boolean;
};

/**
 * Configuration for {@linkcode promptAutocomplete | promptAutocomplete()}.
 *
 * @public
 * @since 3.0.0
 */
export type AutocompletePromptConfig = {
  /**
   * The message displayed to the user.
   */
  message: string;

  /**
   * The full list of choices the user can search and select from.
   */
  choices: PromptChoice[];

  /**
   * A predicate used to filter the available
   * {@linkcode AutocompletePromptConfig.choices | choices} against the current
   * search query.
   *
   * @param input - The current search query entered by the user.
   * @param choices - The full list of available choices.
   * @returns The subset of choices that match the query.
   */
  suggest: (input: string, choices: PromptChoice[]) => PromptChoice[];

  /**
   * The maximum number of choices to render at once.
   *
   * @default 10
   */
  limit?: number;
};

/**
 * Creates a readline interface configured for prompting users.
 *
 * @returns A {@linkcode readlinePromises.Interface} bound to the process stdio streams.
 */
const createPromptInterface = () => {
  const rl = readlinePromises.createInterface({ input, output });

  rl.on('SIGINT', () => {
    output.write('\n');

    process.exit(130);
  });

  return rl;
};

/**
 * Prompts the user for string input.
 *
 * @param config - Prompt configuration for the input.
 * @returns A {@linkcode Promise | promise} that resolves to the user input string.
 */
export const promptInput = async (config: InputPromptConfig) => {
  const rl = createPromptInterface();

  const suffix = config.initial ? ` (${config.initial}) ` : ' ';

  const answer = await rl.question(`${config.message}${suffix}`);

  rl.close();

  const trimmed = answer.trim();

  if (!trimmed && config.initial) {
    return config.initial;
  }

  return trimmed;
};

/**
 * Prompts the user for a yes/no toggle.
 *
 * @param config - Prompt configuration for the toggle.
 * @returns A {@linkcode Promise | promise} that resolves to a `boolean` reflecting the user choice.
 */
export const promptToggle = async (config: TogglePromptConfig) => {
  const rl = createPromptInterface();

  const initial = config.initial ?? false;

  const suffix = initial ? ' (Y/n) ' : ' (y/N) ';

  const answer = await rl.question(`${config.message}${suffix}`);

  rl.close();

  const normalized = answer.trim().toLowerCase();

  if (!normalized) {
    return initial;
  }

  return ['y', 'yes', 'true', '1'].includes(normalized);
};

/**
 * Prompts the user to select from a list using a search query.
 *
 * @param config - Prompt configuration for the autocomplete prompt.
 * @returns A {@linkcode Promise | promise} that resolves to the selected choice value.
 */
export const promptAutocomplete = async (config: AutocompletePromptConfig) => {
  if (config.choices.length === 0) {
    return promptInput({ message: config.message });
  }

  const rl = createPromptInterface();

  const limit = config.limit ?? defaultListLimit;

  let currentChoices = config.suggest('', config.choices);

  let inputValue = '';

  let printedLines = 0;

  const renderChoices = (choices: PromptChoice[]) => {
    const limited = choices.slice(0, limit);

    const lines = limited.map(
      (choice, index) => `  ${index + 1}) ${choice.message}`,
    );

    return lines.join('\n');
  };

  /**
   * Renders the autocomplete screen with the current input and choices.
   */
  const renderScreen = () => {
    if (printedLines > 0) {
      readline.moveCursor(output, 0, -printedLines);

      readline.clearScreenDown(output);
    }

    const header = config.message;

    const inputLine = `Search or select number: ${inputValue}`;

    const body = currentChoices.length
      ? renderChoices(currentChoices)
      : '  (no matches)';

    const outputText = `\n${header}\n${body}\n${inputLine}`;

    output.write(outputText);

    printedLines = outputText.split('\n').length - 1;
  };

  const setChoices = (query: string) => {
    const filtered = config.suggest(query, config.choices);

    currentChoices = filtered.length ? filtered : [];
  };

  readline.emitKeypressEvents(input, rl);

  if (input.isTTY) {
    input.setRawMode(true);
  }

  let isClosed = false;

  const cleanup = () => {
    if (isClosed) {
      return;
    }

    isClosed = true;

    if (input.isTTY) {
      input.setRawMode(false);
    }

    rl.close();
  };

  const resolveSelection = () => {
    if (!inputValue) {
      return currentChoices.length === 1
        ? (currentChoices[0]?.value ?? null)
        : null;
    }

    const selectedIndex = Number.parseInt(inputValue, 10);

    if (!Number.isNaN(selectedIndex)) {
      const choice = currentChoices[selectedIndex - 1];

      return choice?.value ?? null;
    }

    const directMatch = config.choices.find(
      choice => choice.value.toLowerCase() === inputValue.toLowerCase(),
    );

    if (directMatch) {
      return directMatch.value;
    }

    if (currentChoices.length === 1) {
      return currentChoices[0]?.value ?? null;
    }

    return null;
  };

  setChoices(inputValue);

  renderScreen();

  try {
    while (true) {
      const selection = await new Promise<string | null>(resolve => {
        const onKeypress = (chunk: string, key: readline.Key) => {
          input.off('keypress', onKeypress);

          if (key.name === 'return') {
            resolve(resolveSelection());

            return;
          }

          if (key.name === 'backspace') {
            inputValue = inputValue.slice(0, -1);

            setChoices(inputValue);

            renderScreen();

            resolve(null);

            return;
          }

          if (key.ctrl && key.name === 'c') {
            resolve(null);

            process.emit('SIGINT');

            return;
          }

          if (
            key.sequence &&
            !key.ctrl &&
            !key.meta &&
            key.sequence.length === 1
          ) {
            inputValue += key.sequence;

            setChoices(inputValue);

            renderScreen();

            resolve(null);
          }
        };

        input.on('keypress', onKeypress);
      });

      if (selection) {
        cleanup();

        output.write('\n');

        return selection;
      }
    }
  } finally {
    cleanup();
  }
};
