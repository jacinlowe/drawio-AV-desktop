// Unit tests for the Windows arm64 update channel — exercises src/main/update-channel.js
// and pins the channel name to electron-builder-win-arm64.json so the two cannot drift
// [jgraph/drawio-desktop#2197]
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUpdateChannel } from '../main/update-channel.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readConfig = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));

describe('getUpdateChannel', () =>
{
	test('windows arm64 uses its own channel', () =>
	{
		assert.equal(getUpdateChannel('win32', 'arm64'), 'latest-arm64');
	});

	test('windows x64 stays on the default latest.yml', () =>
	{
		assert.equal(getUpdateChannel('win32', 'x64'), null);
	});

	test('macOS and Linux are left to electron-updater', () =>
	{
		// latest-mac.yml lists both arches; Linux already gets a -arm64 suffix
		assert.equal(getUpdateChannel('darwin', 'arm64'), null);
		assert.equal(getUpdateChannel('darwin', 'x64'), null);
		assert.equal(getUpdateChannel('linux', 'arm64'), null);
		assert.equal(getUpdateChannel('linux', 'x64'), null);
	});
});

// The Windows builder configs are not in the public repository (build/public/config.json)
const windowsConfigs = fs.existsSync(path.join(root, 'electron-builder-win.json'));

describe('electron-builder publish config', {skip: !windowsConfigs && 'no Windows packaging in this tree'}, () =>
{
	test('arm64 config publishes the channel the app asks for', () =>
	{
		const config = readConfig('electron-builder-win-arm64.json');
		assert.equal(config.publish.provider, 'github');
		assert.equal(config.publish.channel, getUpdateChannel('win32', 'arm64'));
	});

	test('x64 config publishes plain latest.yml', () =>
	{
		const config = readConfig('electron-builder-win.json');
		assert.equal(config.publish.provider, 'github');
		assert.equal(config.publish.channel, undefined);
	});
});

describe('AV updater & sync configuration', () =>
{
	test('electron-builder-av.json publishes latest*.yml to jacinlowe/drawio-AV-desktop', () =>
	{
		const config = readConfig('electron-builder-av.json');
		assert.equal(config.publish.provider, 'github');
		assert.equal(config.publish.owner, 'jacinlowe');
		assert.equal(config.publish.repo, 'drawio-AV-desktop');
		assert.equal(config.detectUpdateChannel, false);
		assert.equal(config.win.verifyUpdateCodeSignature, false);
		const macTargets = config.mac.target.map(t => t.target);
		assert.ok(macTargets.includes('dmg') && macTargets.includes('zip'));
	});

	test('sync.cjs resolves AV semver versions and enables updates by default', async () =>
	{
		const os = await import('os');
		const { createRequire } = await import('module');
		const req = createRequire(import.meta.url);
		const { runSync, resolveAvVersion } = req('../../sync.cjs');

		assert.equal(resolveAvVersion('32.7.4', undefined), '32.7.4-av.0');
		assert.equal(resolveAvVersion('32.7.4', '32.7.4-av.15'), '32.7.4-av.15');
		assert.throws(() => resolveAvVersion('32.7.4', '32.8.0-av.15'), /does not match/);
		assert.throws(() => resolveAvVersion('32.7.4', '32.7.4.15'), /invalid version/);

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-sync-test-'));
		try
		{
			fs.mkdirSync(path.join(tmpDir, 'drawio'), { recursive: true });
			fs.mkdirSync(path.join(tmpDir, 'src', 'main'), { recursive: true });
			fs.writeFileSync(path.join(tmpDir, 'drawio', 'VERSION'), '32.7.4\n');
			fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'draw.io', version: '0.0.0' }));

			const res = runSync({ rootDir: tmpDir, avVersion: '32.7.4-av.9', disableUpdate: false });
			assert.equal(res.version, '32.7.4-av.9');
			assert.equal(JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')).version, '32.7.4-av.9');
			assert.match(fs.readFileSync(path.join(tmpDir, 'src', 'main', 'disableUpdate.js'), 'utf8'), /return false;/);
		}
		finally
		{
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
