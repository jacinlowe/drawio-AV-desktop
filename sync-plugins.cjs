const fs = require('fs');
const path = require('path');

const pluginsSrcDir = path.resolve(
	process.argv[2] || process.env.AV_PLUGINS_DIR || path.join(__dirname, '..', 'drawio-av-plugins')
);
const webappDir = path.join(__dirname, 'drawio', 'src', 'main', 'webapp');
const pluginsDestDir = path.join(webappDir, 'plugins', 'av');
const postConfigPath = path.join(webappDir, 'js', 'PostConfig.js');

const BEGIN_MARKER = '// --- BEGIN AV PLUGINS ---';
const END_MARKER = '// --- END AV PLUGINS ---';

if (!fs.existsSync(pluginsSrcDir))
{
	console.warn('[sync-plugins] Source folder not found, skipping sync:', pluginsSrcDir);
	process.exit(0);
}

if (!fs.existsSync(postConfigPath))
{
	console.error('[sync-plugins] Error: PostConfig.js not found at', postConfigPath);
	console.error('Did you initialize the drawio submodule (git submodule update --init)?');
	process.exit(1);
}

fs.mkdirSync(pluginsDestDir, { recursive: true });

const pluginFiles = fs.readdirSync(pluginsSrcDir)
	.filter(file => file.endsWith('.js'))
	.sort();

if (pluginFiles.length === 0)
{
	console.warn('[sync-plugins] No .js plugin files found in:', pluginsSrcDir);
	process.exit(0);
}

// Remove stale .js files in destination that no longer exist in source
for (const existing of fs.readdirSync(pluginsDestDir))
{
	if (existing.endsWith('.js') && !pluginFiles.includes(existing))
	{
		fs.unlinkSync(path.join(pluginsDestDir, existing));
		console.log('[sync-plugins] Removed stale plugin:', existing);
	}
}

for (const file of pluginFiles)
{
	const srcFile = path.join(pluginsSrcDir, file);
	const destFile = path.join(pluginsDestDir, file);
	fs.copyFileSync(srcFile, destFile);
	console.log('[sync-plugins] Synced:', file);
}

// Idempotently inject plugin loader block into PostConfig.js
let postConfig = fs.readFileSync(postConfigPath, 'utf8');
const markerRegex = new RegExp(
	`\\r?\\n?${BEGIN_MARKER}[\\s\\S]*?${END_MARKER}\\r?\\n?`,
	'g'
);
postConfig = postConfig.replace(markerRegex, '').trimEnd();

const scriptLines = pluginFiles.map(file => `mxscript('plugins/av/${file}');`).join('\n');
const injectedBlock = [
	'',
	BEGIN_MARKER,
	'App.initPluginCallback();',
	scriptLines,
	END_MARKER,
	''
].join('\n');

fs.writeFileSync(postConfigPath, postConfig + '\n' + injectedBlock, 'utf8');
console.log('[sync-plugins] Updated PostConfig.js with', pluginFiles.length, 'AV plugin(s).');
