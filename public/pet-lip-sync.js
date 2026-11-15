const portrait = new URL('./assets/pet/speaking.png', import.meta.url);

export function createPetLipSync(pet, { cover = false, keyboard = false } = {}) {
  if (!window.AudioContext) return () => () => {};

  // 沿用原画的坐标系，嘴型和人物一起缩放，分别匹配两个直播间的视频裁切。
  pet.insertAdjacentHTML('afterend', `
    <svg class="pet pet-speaking" viewBox="0 0 640 360"
      preserveAspectRatio="${cover ? 'xMidYMax slice' : 'xMidYMid meet'}"
      aria-hidden="true" style="position:absolute; inset:var(--pet-inset, 0); pointer-events:none; display:none">
      <defs>
        <radialGradient id="pet-smile-color" cx="51%" cy="75%" r="74%">
          <stop offset="0" stop-color="#dc9b9a"/>
          <stop offset=".54" stop-color="#cc8f8d"/>
          <stop offset="1" stop-color="#96736b"/>
        </radialGradient>
      </defs>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0; 0 -1.6; 0 0"
          dur="3.4s" repeatCount="indefinite" calcMode="spline" keySplines=".42 0 .58 1; .42 0 .58 1"/>
        <image width="640" height="360" href="${portrait.href}"/>
        <g transform="translate(307.5 207)">
          <g data-mouth opacity="0">
            <path d="M-8-3.1 C-8.1-4.2-7.2-4.4-5.7-4
              C-2.6-3.2 2.6-3.5 5.3-4.3 C7.5-5 8.6-4.6 8.5-2.9
              C8.1 2.9 5.6 6.3 .4 6.3 C-4.8 6.3-7.6 2.7-8-3.1Z"
              fill="url(#pet-smile-color)" stroke="#aa837a" stroke-width=".65" stroke-opacity=".7"/>
            <path d="M-4.8-3.7 C-2.4-3.3 1.8-3.5 4.6-4.1
              C4.1-2.4 2-2.1-.3-2 C-2.5-1.9-4.3-2.4-4.8-3.7Z" fill="#f8d7ce"/>
          </g>
        </g>
      </g>
    </svg>
  `);
  const avatar = pet.nextElementSibling;
  const mouth = avatar.querySelector('[data-mouth]');
  const portraitLayer = avatar.querySelector('image');
  const breathing = avatar.querySelector('animateTransform');
  if (keyboard) {
    // keyboard.webm 取写代码素材 2–3.25 秒往返循环：脸部位置稳定，手部继续打字。
    // 口型只覆盖原嘴，不替换身体，也不叠加独立的呼吸位移。
    mouth.insertAdjacentHTML('beforebegin', '<ellipse data-mouth-cover cx="0" cy="0" rx="10" ry="5" fill="#f2d9ca" opacity="0"/>');
  }
  const mouthCover = avatar.querySelector('[data-mouth-cover]');
  let keyboardPose = false;
  let portraitReady = false;
  const image = new Image();
  image.onload = () => { portraitReady = true; };
  image.src = portrait.href;

  const playing = new Set();
  const samples = new Float32Array(1024);
  let context;
  let frame = 0;
  let opening = 0;
  let visible = false;

  function showSpeaking(show) {
    visible = show;
    avatar.style.display = show ? '' : 'none';
    pet.style.visibility = show && !keyboardPose ? 'hidden' : '';
  }

  function unlock() {
    try {
      context ??= new AudioContext();
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch {
      // 浏览器无法分析音频时，让媒体元素继续直接播放。
    }
  }

  document.addEventListener('pointerdown', unlock, { capture: true, once: true });
  document.addEventListener('keydown', unlock, { capture: true, once: true });

  function connect(track) {
    if (track.analyser || track.unsupported || context?.state !== 'running') return;
    const url = new URL(track.audio.currentSrc);
    if (url.origin !== location.origin) return;
    try {
      const analyser = context.createAnalyser();
      analyser.fftSize = samples.length;
      const source = context.createMediaElementSource(track.audio);
      source.connect(analyser).connect(context.destination);
      track.source = source;
      track.analyser = analyser;
    } catch {
      track.unsupported = true;
    }
  }

  function render() {
    frame = 0;
    const nextKeyboardPose = keyboard && /\/keyboard\.webm(?:[?#]|$)/.test(pet.currentSrc);
    if (nextKeyboardPose !== keyboardPose) {
      keyboardPose = nextKeyboardPose;
      portraitLayer.style.display = keyboardPose ? 'none' : '';
      // SVG 的呼吸位移只作用于普通说话头像，不能带动敲键盘口型漂移。
      if (keyboardPose) {
        breathing.remove();
        portraitLayer.parentElement.setAttribute('transform', 'translate(0 0)');
      } else {
        portraitLayer.parentElement.prepend(breathing);
      }
      mouth.parentElement.setAttribute('transform', keyboardPose ? 'translate(311 211) scale(.68)' : 'translate(307.5 207)');
      avatar.style.filter = keyboardPose ? 'none' : '';
    }
    let rms = 0;
    let hasVoice = false;
    for (const track of playing) {
      const { audio } = track;
      if (audio.paused || audio.ended || audio.seeking || audio.muted || audio.volume === 0 ||
          audio.readyState < 2 || !audio.currentSrc) continue;
      connect(track);
      if (!track.analyser || context.state !== 'running') continue;
      hasVoice = true;
      track.analyser.getFloatTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += sample * sample;
      rms = Math.max(rms, Math.sqrt(energy / samples.length));
    }

    const target = Math.min(1, Math.sqrt(Math.max(0, rms - 0.008) * 8));
    opening = hasVoice ? opening + (target - opening) * (target > opening ? 0.6 : 0.32) : 0;
    if (hasVoice && (keyboardPose || portraitReady)) {
      mouth.setAttribute('opacity', opening > 0.09 ? '1' : '0');
      mouthCover?.setAttribute('opacity', keyboardPose && opening > 0.09 ? '1' : '0');
      mouth.setAttribute('transform', `scale(${0.72 + opening * 0.28} ${0.15 + opening * 0.85})`);
    }
    const matchingPose = pet.dataset.giftAction !== '1' && pet.readyState >= 2 && pet.style.display !== 'none';
    showSpeaking(hasVoice && (keyboardPose || portraitReady) && matchingPose);
    if (playing.size) frame = requestAnimationFrame(render);
  }

  return function watch(audio) {
    const track = { audio };
    const listeners = new AbortController();
    const { signal } = listeners;
    const start = () => {
      unlock();
      playing.add(track);
      if (!frame) frame = requestAnimationFrame(render);
    };
    const stop = () => {
      playing.delete(track);
      if (playing.size) return;
      cancelAnimationFrame(frame);
      frame = 0;
      opening = 0;
      showSpeaking(false);
    };

    audio.addEventListener('playing', start, { signal });
    for (const event of ['pause', 'waiting', 'seeking', 'ended', 'emptied', 'error']) {
      audio.addEventListener(event, stop, { signal });
    }
    return () => {
      stop();
      listeners.abort();
      track.source?.disconnect();
      track.analyser?.disconnect();
    };
  };
}
