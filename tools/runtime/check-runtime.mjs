import { readFileSync } from 'node:fs';

const rootPackage = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

const expectedNode = rootPackage.devEngines?.runtime?.version;
const expectedNpm = rootPackage.devEngines?.packageManager?.version;
const actualNode = process.version.replace(/^v/, '');
const npmUserAgent = process.env.npm_config_user_agent ?? '';
const actualNpm = /^npm\/([^\s]+)/u.exec(npmUserAgent)?.[1];

if (typeof expectedNode !== 'string' || typeof expectedNpm !== 'string') {
  throw new Error('Root package.json must declare exact Node.js and npm versions in devEngines.');
}

if (actualNode !== expectedNode || actualNpm !== expectedNpm) {
  throw new Error(
    `Unsupported runtime: expected Node.js ${expectedNode} with npm ${expectedNpm}; ` +
      `received Node.js ${actualNode} with npm ${actualNpm ?? 'unknown'}. Run \`nvm use\` at the repository root.`,
  );
}
