const fs = require('fs')
const path = require('path')

function resolveAvVersion(baseVersion, envAvVersion)
{
	if (!/^\d+\.\d+\.\d+$/.test(baseVersion))
	{
		throw new Error('drawio/VERSION contains invalid version: "' + baseVersion + '"')
	}

	if (envAvVersion != null && envAvVersion.trim() !== '')
	{
		const trimmed = envAvVersion.trim()

		if (!/^\d+\.\d+\.\d+-av\.\d+$/.test(trimmed))
		{
			throw new Error('AV_VERSION contains invalid version: "' + trimmed + '"')
		}

		if (!trimmed.startsWith(baseVersion + '-av.'))
		{
			throw new Error('AV_VERSION "' + trimmed + '" does not match drawio/VERSION "' + baseVersion + '"')
		}

		return trimmed
	}

	return baseVersion + '-av.0'
}

function runSync(options = {})
{
	const rootDir = options.rootDir || __dirname
	const disable = options.disableUpdate === true
	const envAvVersion = options.avVersion !== undefined ? options.avVersion : process.env.AV_VERSION

	const appjsonpath = path.join(rootDir, 'package.json')
	const disableUpdatePath = path.join(rootDir, 'src/main', 'disableUpdate.js')
	const versionPath = path.join(rootDir, 'drawio', 'VERSION')

	if (!fs.existsSync(versionPath))
	{
		throw new Error('drawio/VERSION not found. Did you clone with --recursive or run git submodule update --init?')
	}

	const baseVer = fs.readFileSync(versionPath, 'utf8').trim()
	const finalVer = resolveAvVersion(baseVer, envAvVersion)

	const pj = JSON.parse(fs.readFileSync(appjsonpath, 'utf8'))
	pj.version = finalVer

	fs.writeFileSync(appjsonpath, JSON.stringify(pj, null, 2) + '\n', 'utf8')
	fs.writeFileSync(
		disableUpdatePath,
		'export function disableUpdate() { return ' + (disable ? 'true' : 'false') + ';}',
		'utf8'
	)

	return { version: finalVer, disableUpdate: disable }
}

if (require.main === module)
{
	try
	{
		runSync({ disableUpdate: process.argv[2] === 'disableUpdate' })
	}
	catch (err)
	{
		console.error('Error: ' + err.message)
		process.exit(1)
	}
}

module.exports = { runSync, resolveAvVersion }
