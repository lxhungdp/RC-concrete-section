import { readFileSync } from 'node:fs';
import { assertSupportedRuntime } from './runtime-policy.mjs';

const rootPackage = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

const supportedNode = rootPackage.devEngines?.runtime?.version;
const supportedNpm = rootPackage.devEngines?.packageManager?.version;
const actualNode = process.version.replace(/^v/, '');
const npmUserAgent = process.env.npm_config_user_agent ?? '';
const actualNpm = /^npm\/([^\s]+)/u.exec(npmUserAgent)?.[1];

if (typeof supportedNode !== 'string' || typeof supportedNpm !== 'string') {
  throw new Error('Root package.json must declare supported Node.js and npm version lines in devEngines.');
}

assertSupportedRuntime({
  supportedNode,
  supportedNpm,
  actualNode,
  actualNpm,
});
