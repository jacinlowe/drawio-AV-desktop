import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { syncAvPlugins } = require('../../sync-plugins.cjs');

test('syncAvPlugins migrates from legacy 3 scripts to unified drawio-av.js via package.json avPlugins', () => {
	const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-av-sync-'));

	try {
		const pluginsSrcDir = path.join(tmpRoot, 'drawio-av-plugins');
		const webappDir = path.join(tmpRoot, 'webapp');
		const avDestDir = path.join(webappDir, 'plugins', 'av');
		const jsDir = path.join(webappDir, 'js');
		const postConfigPath = path.join(jsDir, 'PostConfig.js');

		fs.mkdirSync(pluginsSrcDir, { recursive: true });
		fs.mkdirSync(avDestDir, { recursive: true });
		fs.mkdirSync(jsDir, { recursive: true });

		// Seed stale legacy plugin files in destination
		fs.writeFileSync(path.join(avDestDir, 'equipment_manager.js'), '// legacy');
		fs.writeFileSync(path.join(avDestDir, 'light_patcher.js'), '// legacy');
		fs.writeFileSync(path.join(avDestDir, 'line_counter_v2.js'), '// legacy');

		// Seed PostConfig.js with legacy block
		fs.writeFileSync(
			postConfigPath,
			[
				'window.ICONSEARCH_PATH = null;',
				'// --- BEGIN AV PLUGINS ---',
				'App.initPluginCallback();',
				"mxscript('plugins/av/equipment_manager.js');",
				"mxscript('plugins/av/light_patcher.js');",
				"mxscript('plugins/av/line_counter_v2.js');",
				'// --- END AV PLUGINS ---',
				''
			].join('\n')
		);

		// Seed new unified plugin source + config file that must be ignored
		fs.writeFileSync(
			path.join(pluginsSrcDir, 'package.json'),
			JSON.stringify({ name: 'drawio-av-plugins', main: 'drawio-av.js', avPlugins: ['drawio-av.js'] })
		);
		fs.writeFileSync(path.join(pluginsSrcDir, 'drawio-av.js'), '// unified bundle');
		fs.writeFileSync(path.join(pluginsSrcDir, 'eslint.config.js'), '// dev config');

		const result = syncAvPlugins({ pluginsSrcDir, webappDir });

		assert.deepEqual(result.synced, ['drawio-av.js']);
		assert.deepEqual(result.removed.sort(), [
			'equipment_manager.js',
			'light_patcher.js',
			'line_counter_v2.js'
		]);

		assert.deepEqual(fs.readdirSync(avDestDir), ['drawio-av.js']);

		const updatedPostConfig = fs.readFileSync(postConfigPath, 'utf8');
		assert.match(updatedPostConfig, /mxscript\('plugins\/av\/drawio-av\.js'\);/);
		assert.doesNotMatch(updatedPostConfig, /equipment_manager\.js/);
		assert.doesNotMatch(updatedPostConfig, /eslint\.config\.js/);
	} finally {
		fs.rmSync(tmpRoot, { recursive: true, force: true });
	}
});
