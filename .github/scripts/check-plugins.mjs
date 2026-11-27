// Checks the plugin folders of this catalog. It has no dependencies.
// Usage: node .github/scripts/check-plugins.mjs [repo-folder]
import { lstatSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FILE_LIMIT = 1024 * 1024
export const PLUGIN_LIMIT = 5 * 1024 * 1024
const CODE_FREE = new Set(['.json', '.md', '.txt', '.png', '.jpg', '.webp', '.svg'])
const PLAIN_NAMES = new Set(['LICENSE', 'NOTICE'])
const RESERVED = 'synqa'
const RESERVED_PUBLISHER = 'synqa-inc'
const ID = /^[a-z0-9][a-z0-9-]*$/
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

function normal(text) {
  return text.normalize('NFKC').toLowerCase().trim()
}

function readJson(file, errors, label) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    errors.push(`${label} is missing or is not valid JSON.`)
    return null
  }
}

function isText(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/** Returns the problems with one SVG text. An empty list means it is fine. */
export function svgProblems(text) {
  const found = []
  if (/<script/i.test(text)) found.push('has a script tag')
  if (/<foreignObject/i.test(text)) found.push('has a foreignObject tag')
  if (/<!ENTITY/i.test(text)) found.push('declares an entity')
  if (/\son[a-z]+\s*=/i.test(text)) found.push('has an event handler')
  if (/javascript:/i.test(text)) found.push('has a javascript link')
  if (/@import/i.test(text)) found.push('imports a style sheet')
  if (/url\(\s*["']?\s*(?!#)/i.test(text)) found.push('has a link that is not local')
  for (const match of text.matchAll(/(?:xlink:)?href\s*=\s*["']\s*([^"']*)["']/gi)) {
    if (!match[1].trim().startsWith('#')) found.push('has a link that is not local')
  }
  if (/\ssrc\s*=/i.test(text)) found.push('has a src attribute')
  return [...new Set(found)]
}

function walk(folder, base, out, errors) {
  for (const name of readdirSync(folder).sort()) {
    const full = join(folder, name)
    const shown = `${base}/${name}`
    const stat = lstatSync(full)
    if (stat.isSymbolicLink()) errors.push(`${shown}: links are not allowed.`)
    else if (stat.isDirectory()) walk(full, shown, out, errors)
    else out.push({ full, shown, name, size: stat.size })
  }
}

function checkManifest(folderName, root, errors) {
  const where = `plugins/${folderName}/synqa-plugin.json`
  const file = join(root, 'plugins', folderName, 'synqa-plugin.json')
  if (!existsSync(file)) {
    errors.push(`${where} is missing.`)
    return null
  }
  const manifest = readJson(file, errors, where)
  if (manifest === null) return null
  if (typeof manifest !== 'object' || Array.isArray(manifest)) {
    errors.push(`${where} must hold one JSON object.`)
    return null
  }
  for (const key of ['id', 'name', 'version', 'publisher']) {
    if (!isText(manifest[key])) errors.push(`${where}: "${key}" must be a non-empty text.`)
  }
  if (isText(manifest.id)) {
    if (!ID.test(manifest.id)) errors.push(`${where}: "id" may use only lowercase letters, digits and hyphens.`)
    if (manifest.id !== folderName) errors.push(`${where}: "id" must match the folder name "${folderName}".`)
  }
  if (isText(manifest.version) && !VERSION.test(manifest.version)) {
    errors.push(`${where}: "version" must look like 1.2.3.`)
  }
  if (isText(manifest.publisher)) {
    const publisher = normal(manifest.publisher)
    const ours = publisher === RESERVED_PUBLISHER
    if (publisher.startsWith(RESERVED) && !ours) {
      errors.push(`${where}: publisher names that start with "synqa" are reserved.`)
    }
    for (const key of ['id', 'name']) {
      if (isText(manifest[key]) && normal(manifest[key]).startsWith(RESERVED) && !ours) {
        errors.push(`${where}: "${key}" starts with "synqa", which only publisher synqa-inc may use.`)
      }
    }
  }
  return manifest
}

function checkFolder(folderName, root, errors) {
  const base = `plugins/${folderName}`
  const manifest = checkManifest(folderName, root, errors)
  const files = []
  walk(join(root, base), base, files, errors)
  let total = 0
  for (const file of files) {
    total += file.size
    const plain = PLAIN_NAMES.has(file.name)
    const ext = extname(file.name).toLowerCase()
    if (!plain && !CODE_FREE.has(ext)) {
      errors.push(`${file.shown}: this file type is not allowed. Use .json, .md, .txt, .png, .jpg, .webp or .svg.`)
    }
    if (file.size > FILE_LIMIT) errors.push(`${file.shown}: is larger than 1 MB.`)
    if (ext === '.svg') {
      for (const problem of svgProblems(readFileSync(file.full, 'utf8'))) {
        errors.push(`${file.shown}: the SVG ${problem}.`)
      }
    }
  }
  if (total > PLUGIN_LIMIT) errors.push(`${base}: is larger than 5 MB in all.`)
  for (const name of ['LICENSE', 'NOTICE']) {
    if (!files.some((file) => file.shown === `${base}/${name}`)) errors.push(`${base}/${name} is missing.`)
  }
  return manifest
}

function listedEntries(root, errors) {
  const file = join(root, 'listed.json')
  if (!existsSync(file)) return null
  const data = readJson(file, errors, 'listed.json')
  if (data === null) return []
  if (data.version !== 1 || !Array.isArray(data.plugins)) {
    errors.push('listed.json must look like {"version":1,"plugins":[...]}.')
    return []
  }
  const entries = []
  for (const [index, entry] of data.plugins.entries()) {
    const label = `listed.json entry ${index + 1}`
    let fine = entry && typeof entry === 'object' && !Array.isArray(entry)
    for (const key of ['id', 'publisher', 'path', 'version', 'reviewer', 'date']) {
      if (!fine || !isText(entry[key])) {
        errors.push(`${label}: "${key}" must be a non-empty text.`)
        fine = false
        break
      }
    }
    if (!fine) continue
    if (entry.path !== `plugins/${entry.id}`) errors.push(`${label}: "path" must be "plugins/${entry.id}".`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) errors.push(`${label}: "date" must look like 2026-01-31.`)
    entries.push(entry)
  }
  return entries
}

function recordedIds(root, errors) {
  const file = join(root, 'import-record.json')
  if (!existsSync(file)) return null
  const data = readJson(file, errors, 'import-record.json')
  if (data === null || !Array.isArray(data.plugins)) {
    if (data !== null) errors.push('import-record.json must hold a "plugins" list.')
    return []
  }
  return data.plugins.map((item) => item?.newId ?? item?.id).filter(isText)
}

/** Checks a whole repository folder. Returns a list of problems. */
export function checkRepo(root) {
  const errors = []
  const pluginsDir = join(root, 'plugins')
  const folders = existsSync(pluginsDir)
    ? readdirSync(pluginsDir).filter((name) => lstatSync(join(pluginsDir, name)).isDirectory())
    : []
  const manifests = new Map()
  for (const name of folders) manifests.set(name, checkFolder(name, root, errors))
  if (existsSync(pluginsDir)) {
    for (const name of readdirSync(pluginsDir)) {
      if (!folders.includes(name) && name !== '.gitkeep') errors.push(`plugins/${name}: only plugin folders belong here.`)
    }
  }

  const entries = listedEntries(root, errors)
  const recorded = recordedIds(root, errors)
  const listedIds = new Set((entries ?? []).map((entry) => entry.id))
  const recordedSet = new Set(recorded ?? [])
  for (const name of folders) {
    if (!listedIds.has(name) && !recordedSet.has(name)) {
      errors.push(`plugins/${name}: is in neither listed.json nor import-record.json.`)
    }
  }
  for (const entry of entries ?? []) {
    if (!folders.includes(entry.id)) {
      errors.push(`listed.json: "${entry.id}" has no folder under plugins/.`)
      continue
    }
    const manifest = manifests.get(entry.id)
    if (manifest && manifest.publisher !== entry.publisher) {
      errors.push(`listed.json: "${entry.id}" names publisher "${entry.publisher}", but the plugin file names "${manifest.publisher}".`)
    }
    if (manifest && manifest.version !== entry.version) {
      errors.push(`listed.json: "${entry.id}" names version "${entry.version}", but the plugin file names "${manifest.version}".`)
    }
  }
  for (const id of recordedSet) {
    if (!folders.includes(id)) errors.push(`import-record.json: "${id}" has no folder under plugins/.`)
  }
  return errors
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? '.')
  const errors = checkRepo(root)
  if (errors.length) {
    console.error(`Plugin checks failed (${errors.length}):`)
    for (const error of errors) console.error(`- ${error}`)
    process.exit(1)
  }
  console.log('Plugin checks passed.')
}
