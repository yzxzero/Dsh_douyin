export const EDGE_EFFECTS = { normal: '原声', sweet: '轻甜高音', electro: '轻电音', electro_strong: '明显电音' };
export function edgeConfigOptions(v = {}) {
  return { edgeVoice: v.edgeVoice || undefined, effect: v.effect || 'normal',
    edgePythonPath: v.edgePythonPath || undefined, ffmpegPath: v.ffmpegPath || undefined };
}
export function edgeSettings(opts, preset) {
  const effect = opts.effect || 'normal';
  if (!Object.hasOwn(EDGE_EFFECTS, effect)) throw new Error('不支持的 Edge 音效');
  const multiplier = Number(opts.rate ?? 1);
  if (!Number.isFinite(multiplier) || multiplier < .6 || multiplier > 1.6) throw new Error('语速倍率必须在 0.6～1.6 之间');
  const rate = opts.edgeRate || `${Math.round((multiplier - 1) * 100) >= 0 ? '+' : ''}${Math.round((multiplier - 1) * 100)}%`;
  return { voice: opts.edgeVoice || preset.voice, pitch: opts.pitch || preset.pitch, rate, effect };
}
