// Self-check for check-plugins.mjs. Run: node --test .github/scripts/check-plugins.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkRepo, svgProblems } from './check-plugins.mjs'

function repo(setup) {
  const root = mkdtempSync(join(tmpdir(), 'plugin-check-'))
  setup(root)
  return root
}

function plugin(root, id, over = {}, files = {}) {
  const dir = join(root, 'plugins', id)
  mkdirSync(dir, { recursive: true })
  const manifest = { id, name: 'Sample', version: '1.0.0', publisher: 'someone', ...over }
  writeFileSync(join(dir, 'synqa-plugin.json'), JSON.stringify(manifest))
  writeFileSync(join(dir, 'LICENSE'), 'MIT')
  writeFileSync(join(dir, 'NOTICE'), 'Made by someone.')
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
}

function listed(root, entries) {
  writeFileSync(join(root, 'listed.json'), JSON.stringify({ version: 1, plugins: entries }))
}

const entry = (id) => ({ id, publisher: 'someone', path: `plugins/${id}`, version: '1.0.0', reviewer: 'r', date: '2026-01-31' })

test('an empty repository passes', () => {
  assert.deepEqual(checkRepo(repo(() => {})), [])
})

test('a good listed plugin passes', () => {
  const root = repo((r) => {
    plugin(r, 'good', {}, { 'a.svg': '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>' })
    listed(r, [entry('good')])
  })
  assert.deepEqual(checkRepo(root), [])
})

test('missing files and unlisted folders fail', () => {
  const root = repo((r) => {
    mkdirSync(join(r, 'plugins', 'bare'), { recursive: true })
    writeFileSync(join(r, 'plugins', 'bare', 'x.json'), '{}')
  })
  const text = checkRepo(root).join('\n')
  assert.match(text, /synqa-plugin.json is missing/)
  assert.match(text, /LICENSE is missing/)
  assert.match(text, /NOTICE is missing/)
  assert.match(text, /neither listed.json nor import-record.json/)
})

test('an imported folder may wait for its record, a folder from anybody else may not', () => {
  const root = repo((r) => {
    plugin(r, 'imported', { publisher: 'synqa-inc' })
    plugin(r, 'stray', { publisher: 'someone' })
  })
  const notes = []
  const errors = checkRepo(root, notes)
  assert.deepEqual(notes, ['plugins/imported: imported, waits for its import-record.json entry in the next pull request.'])
  assert.deepEqual(errors, ['plugins/stray: is in neither listed.json nor import-record.json.'])
})

test('code files and big files fail', () => {
  const root = repo((r) => {
    plugin(r, 'bad', {}, { 'run.js': 'x', 'big.txt': 'a'.repeat(1024 * 1024 + 1) })
    listed(r, [entry('bad')])
  })
  const text = checkRepo(root).join('\n')
  assert.match(text, /run.js: this file type is not allowed/)
  assert.match(text, /big.txt: is larger than 1 MB/)
})

test('a plugin over 5 MB fails', () => {
  const chunk = 'a'.repeat(900 * 1024)
  const files = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`p${n}.txt`, chunk]))
  const root = repo((r) => {
    plugin(r, 'huge', {}, files)
    listed(r, [entry('huge')])
  })
  assert.match(checkRepo(root).join('\n'), /larger than 5 MB in all/)
})

test('the synqa name is reserved', () => {
  const root = repo((r) => {
    plugin(r, 'synqa-theme', { publisher: 'someone' })
    plugin(r, 'ours', { name: 'Synqa Dark', publisher: 'someone' })
    plugin(r, 'synqa-own', { publisher: 'synqa-inc' })
    listed(r, [entry('synqa-theme'), entry('ours'), { ...entry('synqa-own'), publisher: 'synqa-inc' }])
  })
  const errors = checkRepo(root)
  assert.equal(errors.filter((e) => /synqa-theme.*starts with/.test(e)).length, 1)
  assert.ok(errors.some((e) => /ours.*"name" starts with/.test(e)))
  assert.ok(!errors.some((e) => /synqa-own.*starts with/.test(e)))
})

test('listed.json entries need folders', () => {
  const root = repo((r) => listed(r, [entry('ghost')]))
  assert.match(checkRepo(root).join('\n'), /"ghost" has no folder/)
})

test('svg files are checked', () => {
  assert.deepEqual(svgProblems('<svg xmlns="http://www.w3.org/2000/svg"><use href="#a"/></svg>'), [])
  assert.ok(svgProblems('<svg><script>x</script></svg>').length)
  assert.ok(svgProblems('<svg><image href="https://example.com/a.png"/></svg>').length)
  assert.ok(svgProblems('<svg><rect style="fill:url(https://example.com/a)"/></svg>').length)
  assert.ok(svgProblems('<svg onload="x()"></svg>').length)
})
