import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import type { Options, ValidModes } from './types.js';

const getHomeOrTmp = () => homedir() || tmpdir();
const homeOrTmp = /* @__PURE__ */ getHomeOrTmp();
export const tmpDirName = 'tmp';
export const tigedConfigName = 'degit.json';
export const cacheDirectoryPath = /* @__PURE__ */ path.join(
  homeOrTmp,
  '.degit',
);
export const validModes = /* @__PURE__ */ new Set([
  'tar',
  'git',
] as const satisfies readonly ValidModes[]) satisfies ReadonlySet<ValidModes>;
export const accessLogsFileName = 'access.json';
export const tigedDefaultOptions = {
  disableCache: false,
  force: false,
  mode: 'tar',
  subDirectory: undefined,
  subgroup: false,
  verbose: false,
} as const satisfies Options;
export const supportedHosts: Record<string, string> = {
  github: '.com',
  gitlab: '.com',
  bitbucket: '.com',
  'git.sr.ht': '.ht',
  huggingface: '.co',
  codeberg: '.org',
} as const satisfies Record<string, string>;
