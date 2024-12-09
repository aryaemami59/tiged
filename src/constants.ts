import * as path from 'node:path';
import type { ValidModes } from './types.js';
import { homedir, tmpdir } from 'node:os';

const getHomeOrTmp = () => homedir() || tmpdir();
const homeOrTmp = /* @__PURE__ */ getHomeOrTmp();
export const tmpDirName = 'tmp';
export const tigedConfigName = 'degit.json';
export const base = /* @__PURE__ */ path.join(homeOrTmp, '.degit');
export const validModes = /* @__PURE__ */ new Set<ValidModes>(['tar', 'git']);
