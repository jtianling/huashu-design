import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pipeline = path.join(root, 'scripts/narrate-pipeline.mjs');

function run(dir, ...args) {
  return spawnSync(process.execPath, [pipeline, '--script',
    path.join(dir, 'script.md'), '--out-dir', path.join(dir, 'out'), ...args],
  { encoding: 'utf8', env: { PATH: process.env.PATH } });
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-narration-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'script.md'),
    '---\ntitle: Demo\ngap: 0.1\n---\n## intro\nHello.[[cue:next]]World.\n'
    + '\n## end\nGoodbye.\n');
  return dir;
}

function manifest(dir) {
  const planned = run(dir);
  assert.equal(planned.status, 0, planned.stderr);
  return JSON.parse(fs.readFileSync(path.join(dir, 'out/speech-plan.json')));
}

function writeManifest(dir, data) {
  const file = path.join(dir, 'audio-manifest.json');
  fs.writeFileSync(file, JSON.stringify(data));
  return file;
}

test('default prepares exact cue-separated text without supplier credentials', (t) => {
  const dir = fixture(t);
  const data = manifest(dir);
  assert.deepEqual(data.clips.map((c) => [c.sceneId, c.chunkIndex, c.text]), [
    ['intro', 0, 'Hello.'], ['intro', 1, 'World.'], ['end', 0, 'Goodbye.'],
  ]);
  assert.equal(fs.existsSync(path.join(dir, 'out/voiceover.mp3')), false);
  assert.notEqual(run(dir).status, 0);
});

test('assembles mixed local formats into real audio and cue timeline', (t) => {
  const dir = fixture(t);
  const data = manifest(dir);
  data.clips.forEach((clip, index) => {
    const filename = `clip-${index}.wav`;
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i',
      `sine=frequency=${440 + index * 100}:sample_rate=${index ? 48000 : 44100}`,
      '-t', '0.4', path.join(dir, filename)]);
    clip.path = filename;
  });
  const result = run(dir, '--audio-manifest', writeManifest(dir, data));
  assert.equal(result.status, 0, result.stderr);
  const timeline = JSON.parse(fs.readFileSync(path.join(dir, 'out/timeline.json')));
  assert.equal(timeline.provider, 'monkeys');
  assert.equal(timeline.scenes.length, 2);
  assert.equal(timeline.scenes[0].chunks.length, 2);
  assert.equal(timeline.scenes[0].cues[0].id, 'next');
  assert.equal(timeline.scenes[0].cues[0].offset,
    timeline.scenes[0].chunks[0].end);
  assert.ok(timeline.scenes[1].start > timeline.scenes[0].end);
  assert.ok(timeline.totalDuration > 1.2 && timeline.totalDuration < 2);
  assert.ok(timeline.scenes.every((s) => s.chunks.every((c) =>
    c.words.length === 0 && c.absoluteEnd > c.absoluteStart)));
  assert.ok(fs.statSync(path.join(dir, 'out/voiceover.mp3')).size > 0);
});

test('rejects mismatched, missing and duplicate manifest clips', (t) => {
  const dir = fixture(t);
  const data = manifest(dir);
  fs.writeFileSync(path.join(dir, 'clip.wav'), 'not audio');
  const clips = data.clips.map((c) => ({ ...c, path: 'clip.wav' }));
  const cases = [
    { clips: [{ ...clips[0], text: 'Different.' }, ...clips.slice(1)] },
    { clips: clips.slice(1) },
    { clips: [...clips, clips[0]] },
    { clips: [{ ...clips[0], path: '../outside.wav' }, ...clips.slice(1)] },
    { clips: [{ ...clips[0], path: 'https://example.com/audio' }, ...clips.slice(1)] },
    { clips, extra: true },
  ];
  for (const value of cases) {
    const result = run(dir, '--audio-manifest', writeManifest(dir, value));
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(path.join(dir, 'out/voiceover.mp3')), false);
  }
});

test('rejects invalid media and reports ffmpeg failure details', (t) => {
  const dir = fixture(t);
  const data = manifest(dir);
  fs.writeFileSync(path.join(dir, 'bad.wav'), 'not audio');
  data.clips.forEach((c) => { c.path = 'bad.wav'; });
  const result = run(dir, '--audio-manifest', writeManifest(dir, data));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid data|Error opening input/);
});

test('legacy provider requires explicit consent and never serves as fallback', (t) => {
  const dir = fixture(t);
  const result = run(dir, '--provider', 'doubao');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Explicit --yes required/);
  assert.notEqual(run(dir, '--provider', 'unknown').status, 0);
});
