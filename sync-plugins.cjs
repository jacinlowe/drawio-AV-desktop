const fs = require('fs');
const path = require('path');

function resolvePluginFiles(pluginsSrcDir)
{
	const pkgJsonPath = path.join(pluginsSrcDir, 'package.json');

	if (fs.existsSync(pkgJsonPath))
	{
		try
		{
			const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

			if (Array.isArray(pkg.avPlugins) && pkg.avPlugins.length > 0)
			{
				const declared = pkg.avPlugins
					.filter(f => typeof f === 'string' && f.endsWith('.js'))
					.filter(f => fs.existsSync(path.join(pluginsSrcDir, f)));

				if (declared.length > 0)
				{
					return declared;
				}
			}

			if (typeof pkg.main === 'string' && pkg.main.endsWith('.js') &&
				fs.existsSync(path.join(pluginsSrcDir, pkg.main)))
			{
				return [pkg.main];
			}
		}
		catch (err)
		{
			console.warn('[sync-plugins] Could not parse package.json in plugins source:', err.message);
		}
	}

	return fs.readdirSync(pluginsSrcDir)
		.filter(file => file.endsWith('.js') && !file.endsWith('.config.js') && !file.endsWith('.test.js'))
		.sort();
}

function syncAvPlugins(options = {})
{
	const pluginsSrcDir = path.resolve(
		options.pluginsSrcDir ||
		process.argv[2] ||
		process.env.AV_PLUGINS_DIR ||
		path.join(__dirname, '..', 'drawio-av-plugins')
	);
	const webappDir = path.resolve(
		options.webappDir || path.join(__dirname, 'drawio', 'src', 'main', 'webapp')
	);
	const pluginsDestDir = path.join(webappDir, 'plugins', 'av');
	const postConfigPath = path.join(webappDir, 'js', 'PostConfig.js');

	const BEGIN_MARKER = '// --- BEGIN AV PLUGINS ---';
	const END_MARKER = '// --- END AV PLUGINS ---';

	if (!fs.existsSync(pluginsSrcDir))
	{
		console.warn('[sync-plugins] Source folder not found, skipping sync:', pluginsSrcDir);
		return { synced: [], removed: [], skipped: true };
	}

	if (!fs.existsSync(postConfigPath))
	{
		throw new Error(`[sync-plugins] Error: PostConfig.js not found at ${postConfigPath}. Did you initialize the drawio submodule (git submodule update --init)?`);
	}

	fs.mkdirSync(pluginsDestDir, { recursive: true });

	const pluginFiles = resolvePluginFiles(pluginsSrcDir);

	if (pluginFiles.length === 0)
	{
		console.warn('[sync-plugins] No .js plugin files found in:', pluginsSrcDir);
		return { synced: [], removed: [], skipped: true };
	}

	const removed = [];

	// Remove stale .js files in destination that no longer exist in source
	for (const existing of fs.readdirSync(pluginsDestDir))
	{
		if (existing.endsWith('.js') && !pluginFiles.includes(existing))
		{
			fs.unlinkSync(path.join(pluginsDestDir, existing));
			removed.push(existing);
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

	return { synced: pluginFiles, removed, skipped: false };
}

if (require.main === module)
{
	try
	{
		syncAvPlugins();
	}
	catch (err)
	{
		console.error(err.message);
		process.exit(1);
	}
}

module.exports = { syncAvPlugins, resolvePluginFiles };
