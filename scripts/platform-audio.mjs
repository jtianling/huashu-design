import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function expectedClips(scenes, splitByCues) {
  const ids = new Set();
  return scenes.flatMap((scene) => {
    if (!/^[\w-]+$/.test(scene.id) || ids.has(scene.id)) {
      throw new Error(`Invalid or duplicate scene id: ${scene.id}`);
    }
    ids.add(scene.id);
    const clips = splitByCues(scene.raw).flatMap((chunk, chunkIndex) =>
      chunk.text ? [{ sceneId: scene.id, chunkIndex, text: chunk.text }] : []);
    if (!clips.length) throw new Error(`Scene has no speech: ${scene.id}`);
    return clips;
  });
}

export function writePlatformPlan(scenes, splitByCues, outDir) {
  const clips = expectedClips(scenes, splitByCues)
    .map((clip) => ({ ...clip, path: null }));
  const target = path.join(outDir, 'speech-plan.json');
  fs.writeFileSync(target, JSON.stringify({ clips }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({
    plan: target,
    next: 'Call text_to_speech for each clip text. Save returned local files, '
      + 'fill path relative to the manifest, then rerun with --audio-manifest.',
  }));
}

function validateClip(clip, expected, root) {
  if (!clip || typeof clip !== 'object' || Array.isArray(clip) ||
      Object.keys(clip).some((key) =>
        !['sceneId', 'chunkIndex', 'text', 'path'].includes(key))) {
    throw new Error('Each clip must contain sceneId, chunkIndex, text and path');
  }
  const key = `${clip.sceneId}:${clip.chunkIndex}`;
  if (!Number.isInteger(clip.chunkIndex) || !expected.has(key) ||
      clip.text !== expected.get(key) || typeof clip.path !== 'string' ||
      !clip.path || path.isAbsolute(clip.path)) {
    throw new Error(`Invalid clip or mismatched script text: ${key}`);
  }
  const file = fs.realpathSync(path.resolve(root, clip.path));
  const relative = path.relative(root, file);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' ||
      path.isAbsolute(relative) || !fs.statSync(file).isFile() ||
      fs.statSync(file).size === 0) {
    throw new Error(`Audio must be a nonempty file within manifest directory: ${key}`);
  }
  return { key, file };
}

export function loadPlatformAudio(manifestPath, scenes, splitByCues) {
  const manifest = path.resolve(manifestPath);
  const root = fs.realpathSync(path.dirname(manifest));
  const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (!data || Array.isArray(data) || !Array.isArray(data.clips) ||
      Object.keys(data).some((key) => key !== 'clips')) {
    throw new Error('Audio manifest must contain only a clips array');
  }
  const expected = new Map(expectedClips(scenes, splitByCues)
    .map((clip) => [`${clip.sceneId}:${clip.chunkIndex}`, clip.text]));
  const files = new Map();
  for (const clip of data.clips) {
    const { key, file } = validateClip(clip, expected, root);
    if (files.has(key)) throw new Error(`Duplicate audio clip: ${key}`);
    files.set(key, file);
  }
  if (files.size !== expected.size) throw new Error('Missing speech clips');
  return (text, output, sceneId, chunkIndex) => {
    const key = `${sceneId}:${chunkIndex}`;
    if (expected.get(key) !== text) throw new Error(`Script changed: ${key}`);
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-i', files.get(key), '-vn', '-ar', '24000',
      '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '96k', output,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const duration = Number(execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', output,
    ], { encoding: 'utf8' }).trim());
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Invalid measured audio duration: ${key}`);
    }
    return { duration, words: [] };
  };
}
