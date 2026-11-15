import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
function room() {
  const timers = new Map(); let id = 0;
  const pet = { src: 'assets/pet/idle.webm', dataset: {}, currentTime: 1,
    getAttribute() { return this.src; }, play() { return Promise.resolve(); } };
  const state = { story: { phase: 'idle' } };
  const code = source.slice(source.indexOf('const MOODS ='), source.indexOf('const IDLE_POOL')) +
    source.slice(source.indexOf('let moodTimer ='), source.indexOf('/* 哪个动作文件坏了')) +
    '\n({ setMood, phaseMood });';
  const api = runInNewContext(code, { pet, state, Date,
    setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(key) { timers.delete(key); } });
  return { pet, state, ...api, finish() { for (const [key, fn] of [...timers]) { timers.delete(key); fn(); } } };
}
test('idle uses original video; narration survives chat and text completion', () => {
  const r = room(); r.setMood(r.phaseMood('idle'));
  assert.equal(r.pet.src, 'assets/pet/idle.webm');
  r.state.story.phase = 'reading'; r.setMood(r.phaseMood('reading'));
  for (const mood of ['talk', 'idle', 'greet', 'happy']) {
    r.setMood(mood); assert.equal(r.pet.src, 'assets/pet/keyboard.webm');
  }
  assert.equal(r.pet.currentTime, 1);
});
test('gift has priority and returns to narration after finishing', () => {
  const r = room(); r.state.story.phase = 'reading';
  r.setMood('shy', 10100, { gift: true });
  r.setMood('talk'); assert.equal(r.pet.src, 'assets/pet/shy.webm');
  r.finish(); assert.equal(r.pet.src, 'assets/pet/keyboard.webm');
  assert.equal(r.pet.dataset.giftAction, '0');
});
test('gift restoration follows phase changes during the action', () => {
  const r = room(); r.state.story.phase = 'reading';
  r.setMood('unwrap', 10100, { gift: true });
  r.state.story.phase = 'done'; r.setMood(r.phaseMood('done'));
  assert.equal(r.pet.src, 'assets/pet/unwrap.webm');
  r.finish(); assert.equal(r.pet.src, 'assets/pet/idle.webm');
  r.setMood('happy', 10100, { gift: true });
  r.state.story.phase = 'reading'; r.setMood(r.phaseMood('reading'));
  r.finish(); assert.equal(r.pet.src, 'assets/pet/keyboard.webm');
});
