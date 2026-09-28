// Regex tests on the raw source, not a DOM run - these files are plain
// function sources pasted into a browser, not modules this test can import.
// The hard lock: no script here may ever target a submit/apply control.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));

test('at least the three fill scripts are present', () => {
  assert.ok(files.includes('dump.js'));
  assert.ok(files.includes('fill-facts.js'));
  assert.ok(files.includes('commit.js'));
});

test('no browser script ever clicks something matched by submit/apply/send text', () => {
  // "submit" alone is not the danger - fill-facts.js legitimately excludes
  // type=submit inputs from being touched at all. The danger is a `.click()`
  // reachable from text matched against submit/apply/send, so this checks
  // each line (comments stripped) for BOTH on the same statement.
  for (const f of files) {
    const lines = readFileSync(path.join(dir, f), 'utf8')
      .split('\n').filter((line) => !line.trim().startsWith('//'));
    for (const line of lines) {
      if (/submit|apply now|send application/i.test(line)) {
        assert.doesNotMatch(line, /\.click\(/, `${f} must never click a control on the same line it matches submit/apply/send: ${line}`);
      }
    }
  }
});

test('every browser script is one async (FACTS) => {...} function, callable with FACTS positionally', () => {
  for (const f of files) {
    const withoutComments = readFileSync(path.join(dir, f), 'utf8')
      .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').trim();
    assert.match(withoutComments, /^async\s*\(_?FACTS\)\s*=>\s*\{/, `${f} must start as async (FACTS) => {`);
    assert.ok(withoutComments.endsWith('}'), `${f} must end with a closing brace`);
  }
});

test('fill-facts.js never writes into a field whose label matched the never-fill guard', () => {
  const src = readFileSync(path.join(dir, 'fill-facts.js'), 'utf8');
  assert.match(src, /isNeverFill/);
  // every write path (setText, fillSelect click, fieldset click) is guarded.
  assert.match(src, /if \(isNeverFill\(label\)\) return;/);
});
