import fs from 'fs-extra';
import path from 'node:path';
import { homedir, tmpdir } from 'node:os';
import https from 'node:https';
import child_process from 'node:child_process';
import URL from 'node:url';
import createHttpsProxyAgent from 'https-proxy-agent';
import { rimraf } from 'rimraf';
import type { DegitErrorCode } from "./index";

const tmpDirName = 'tmp';

const degitConfigName = 'degit.json';

const homeOrTmp = homedir() || tmpdir();

interface DegitErrorOptions extends ErrorOptions {
  code: DegitErrorCode;
  original?: Error;
  ref?: string;
  url?: string;
}

class DegitError extends Error {
    declare public code?: DegitErrorOptions['code'];
    declare public original?: DegitErrorOptions['original'];
    declare public ref?: DegitErrorOptions['ref'];
    declare public url?: DegitErrorOptions['url'];
	constructor(message?: string, opts?: DegitErrorOptions) {
		super(message);
		Object.assign(this, opts);
	}
}

function tryRequire(file: string, opts?: {
  clearCache?: true | undefined;
}): unknown {
	try {
		if (opts && opts.clearCache === true) {
			delete require.cache[require.resolve(file)];
		}
		return require(file);
	} catch (err) {
		return null;
	}
}

async function exec(command: string, size = 500): Promise<{ stdout: string; stderr: string }> {
	return new Promise<{ stdout: string; stderr: string }>((fulfil, reject) => {
		child_process.exec(
			command,
			{ maxBuffer: 1024 * size },
			(err, stdout, stderr) => {
				if (err) {
					reject(err);
					return;
				}

				fulfil({ stdout, stderr });
			}
		);
	}).catch(err => {
		if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
			return exec(command, size * 2);
		}
		return Promise.reject(err);
	});
}

async function fetch(url: string, dest: string, proxy?: string) {
	return new Promise<void>((fulfil, reject) => {
		const parsedUrl = URL.parse(url);
		const options: https.RequestOptions = {
			hostname: parsedUrl.hostname,
			port: parsedUrl.port,
			path: parsedUrl.path,
			headers: {
				Connection: 'close'
			}
		};
		if (proxy) {
			options.agent = createHttpsProxyAgent(proxy);
		}

		https
			.get(options, response => {
				const code = response.statusCode;
        if (code == null) {
          return reject(new Error('No status code'));
        }
				if (code >= 400) {
					reject({ code, message: response.statusMessage });
				} else if (code >= 300) {
          if (response.headers.location == null) {
            return reject(new Error('No location header'));
          }
					fetch(response.headers.location, dest, proxy).then(fulfil, reject);
				} else {
					response
						.pipe(fs.createWriteStream(dest))
						.on('finish', () => fulfil())
						.on('error', reject);
				}
			})
			.on('error', reject);
	});
}

async function stashFiles(dir: string, dest: string) {
	const tmpDir = path.join(dir, tmpDirName);
	try {
		await rimraf(tmpDir);
	} catch (e) {
    if (!(e instanceof Error && 'errno' in e && 'syscall' in e && 'code' in e)) {
      return
    }
		if (e.errno !== -2 && e.syscall !== 'rmdir' && e.code !== 'ENOENT') {
			throw e;
		}
	}
	await fs.mkdir(tmpDir);
	const files = await fs.readdir(dest);
	for (const file of files) {
		const filePath = path.join(dest, file);
		const targetPath = path.join(tmpDir, file);
		const isDir = (await fs.lstat(filePath)).isDirectory();
		if (isDir) {
			await fs.copy(filePath, targetPath);
			await rimraf(filePath);
		} else {
			await fs.copy(filePath, targetPath);
			await fs.unlink(filePath);
		}
	}
}

async function unstashFiles(dir: string, dest: string) {
	const tmpDir = path.join(dir, tmpDirName);
	const files = await fs.readdir(tmpDir);
	for (const filename of files) {
		const tmpFile = path.join(tmpDir, filename);
		const targetPath = path.join(dest, filename);
		const isDir = (await fs.lstat(tmpFile)).isDirectory();
		if (isDir) {
			await fs.copy(tmpFile, targetPath);
			await rimraf(tmpFile);
		} else {
			if (filename !== 'degit.json') {
				await fs.copy(tmpFile, targetPath);
			}
			await fs.unlink(tmpFile);
		}
	}
	await rimraf(tmpDir);
}

const base = path.join(homeOrTmp, '.degit');

export {
	rimraf,
	degitConfigName,
	DegitError,
	tryRequire,
	fetch,
	exec,
	stashFiles,
	unstashFiles,
	base
};