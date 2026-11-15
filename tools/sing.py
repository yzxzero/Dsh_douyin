"""把 TTS 音色「唱」成一小段旋律 —— 直播间片头 / 梗音效用。

原理：RVC 换音色要先有人哼；只想让现有 TTS 音色哼几句时，更轻的路子是把
旋律拆成音符，逐字合成后变调到目标音高，再按时值拼起来。纯 CPU，几秒出结果。

用法：
  python tools/sing.py --text "大肥鱼" --notes "C4:.4 D4:.4 E4:1.2"
  python tools/sing.py --text "啊啊啊啊" --notes "C4:.4 E4:.4 G4:.4 C5:1.2" --engine kokoro --voice zf_xiaobei

  --notes  空格分隔的「音名:拍数」，音名支持 C4 / D#4 / Eb4 / C5
  --bpm    每分钟拍数，默认 100
  --engine edge | kokoro
  --voice  edge 音色名或 kokoro 音色名（默认 edge 的晓晓）
  --out    输出 wav 路径

依赖：numpy（tts-kokoro/.venv 里有）、ffmpeg（带 rubberband 滤镜）
"""
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KOKORO_DIR = os.path.join(ROOT, "tts-kokoro")
KOKORO_PY = os.path.join(KOKORO_DIR, ".venv", "Scripts", "python.exe")
KOKORO_ONNX = os.path.join(KOKORO_DIR, "model_quantized.onnx")
KOKORO_VOICES = os.path.join(KOKORO_DIR, "voices.npz")

SR = 44100

# ---------------------------------------------------------------- 音频基础


def read_wav(path):
    with wave.open(path, "rb") as w:
        n = w.getnframes()
        ch = w.getnchannels()
        sw = w.getsampwidth()
        sr = w.getframerate()
        raw = w.readframes(n)
    if sw != 2:
        raise SystemExit(f"只支持 16bit wav: {path}")
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        data = data.reshape(-1, ch).mean(axis=1)
    if sr != SR:
        data = resample(data, sr, SR)
    return data


def write_wav(path, data):
    pcm = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def resample(data, sr_in, sr_out):
    """线性插值重采样，够用且不引入额外依赖。"""
    if sr_in == sr_out:
        return data
    n_out = int(round(len(data) * sr_out / sr_in))
    x_old = np.arange(len(data), dtype=np.float64)
    x_new = np.linspace(0, len(data) - 1, n_out)
    return np.interp(x_new, x_old, data).astype(np.float32)


def trim_silence(data, thresh_ratio=0.02, pad_ms=8):
    """去掉首尾静音，保留一点点起音和尾音。"""
    if len(data) == 0:
        return data
    env = np.abs(data)
    peak = env.max()
    if peak <= 0:
        return data
    idx = np.where(env > peak * thresh_ratio)[0]
    if len(idx) == 0:
        return data
    pad = int(SR * pad_ms / 1000)
    a = max(0, idx[0] - pad)
    b = min(len(data), idx[-1] + pad)
    return data[a:b]


def _lowpass(data, k=5):
    """简单滑动平均，压掉高频让自相关更稳（人声基频远低于它）。"""
    if k <= 1 or len(data) < k:
        return data
    kern = np.ones(k, dtype=np.float32) / k
    return np.convolve(data, kern, mode="same")


def detect_f0(data, fmin=70.0, fmax=800.0):
    """自相关测基频（中位数）。

    关键点：不能在搜索区间里直接取全局最大 —— 那会频繁落到二次谐波上
    （表现为测出 2 倍音高，变调时低了一个八度）。这里取「第一个足够高的
    局部峰」，并额外做一次八度校验。

    fmin/fmax 收窄后可避开伴奏低音（贝斯在 65–100Hz），否则人声弱的地方
    会把低音当成基频测出来。
    """
    frame = int(SR * 0.04)
    hop = int(SR * 0.02)
    f0s = []
    lo, hi = int(SR / fmax), int(SR / fmin)
    smooth = _lowpass(data)
    for start in range(0, max(1, len(smooth) - frame), hop):
        seg = smooth[start:start + frame]
        if len(seg) < frame or np.sqrt((seg ** 2).mean()) < 0.01:
            continue
        seg = seg - seg.mean()
        corr = np.correlate(seg, seg, mode="full")[len(seg) - 1:]
        if corr[0] <= 0:
            continue
        corr = corr / corr[0]
        window = corr[lo:hi]
        if len(window) < 3:
            continue
        peak = window.max()
        if peak < 0.4:
            continue
        # 以全局最大峰为锚点：真实周期往往不是全局最大（二次谐波常常更高），
        # 所以要在锚点之前找第一个达到峰值 90% 的局部极大，这样既不会落到
        # 高次谐波上，也不会像「取第一个峰」那样在无周期帧里返回搜索边界。
        kmax = int(np.argmax(window))
        if kmax < 2:
            continue
        cand = None
        for i in range(1, kmax + 1):
            nxt = window[i + 1] if i + 1 < len(window) else 0.0
            if window[i] >= window[i - 1] and window[i] >= nxt and window[i] >= peak * 0.9:
                cand = lo + i
                break
        if cand is None:
            cand = lo + kmax
        f0s.append(SR / cand)
    if not f0s:
        return None
    # 去掉离中位数超过一个八度的离群帧（谐波误判的典型表现）
    med = float(np.median(f0s))
    kept = [f for f in f0s if 0.5 * med <= f <= 2.0 * med]
    return float(np.median(kept)) if kept else med


def fit_length(data, n_samples):
    """pad / 截断到精确长度 —— 节奏必须准，不能靠变调器返回的长度。"""
    if len(data) == n_samples:
        return data
    if len(data) > n_samples:
        return data[:n_samples]
    return np.concatenate([data, np.zeros(n_samples - len(data), dtype=np.float32)])


def hz_to_midi(f):
    return 69 + 12 * math.log2(f / 440.0)


def midi_to_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- 合成


def synth_edge(text, voice, out_mp3):
    exe = KOKORO_PY if os.path.exists(KOKORO_PY) else sys.executable
    cmd = [
        exe, "-m", "edge_tts",
        "--text", text,
        "--voice", voice,
        "--write-media", out_mp3,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(out_mp3):
        raise SystemExit(f"edge-tts 失败：{r.stderr[-400:]}")
    return out_mp3


def synth_kokoro(text, voice, out_wav):
    """Kokoro 走 say.py 里的同一套 misaki + onnx 管线。"""
    script = r"""
import os, sys, wave
import numpy as np
ROOT, text, voice, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
os.environ.setdefault("HF_HUB_OFFLINE", "1")
from misaki import zh
from kokoro_onnx import Kokoro
g2p = zh.ZHG2P()
_o = g2p(text)
phonemes = _o[0] if isinstance(_o, (tuple, list)) else _o
k = Kokoro(os.path.join(ROOT, "model_quantized.onnx"), os.path.join(ROOT, "voices.npz"))
audio, sr = k.create(phonemes, voice=voice, speed=1.0, is_phonemes=True)
pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
with wave.open(out, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes(pcm.tobytes())
print(f"{sr}")
"""
    exe = KOKORO_PY if os.path.exists(KOKORO_PY) else sys.executable
    r = subprocess.run(
        [exe, "-c", script, KOKORO_DIR, text, voice, out_wav],
        capture_output=True, text=True,
    )
    if r.returncode != 0 or not os.path.exists(out_wav):
        raise SystemExit(f"kokoro 失败：{r.stderr[-400:]}")
    return out_wav


def to_wav_44k(src, dst):
    """统一成 44.1k 单声道 16bit wav。"""
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
           "-ar", str(SR), "-ac", "1", "-sample_fmt", "s16", dst]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"ffmpeg 转码失败：{r.stderr[-400:]}")
    return dst


def retune_world(data, target_midi, beats=1.0, prev_midi=None):
    """用 WORLD 声码器把整段基频压平到目标音高，音色（谱包络）保持不变。

    为什么必须这步：rubberband 的整体变调只是把音高轮廓平移，中文的声调
    （去声降、阳平升）会原样保留 —— "大"字从 62 滑到 54、走音半個八度。
    WORLD 把 F0 和谱包络拆开，只重写 F0，声调就被抹平成平直长音了。

    纯常量 F0 出来是电子音，所以再加两样"人味"：
    - 颤音：按时值给深度，短音不颤、长音颤得多，且渐入（真人不会一开口就颤）
    - 起音滑音：从上一个音高滑进来，模拟换音时的过渡
    """
    try:
        import pyworld as pw
    except ImportError:
        return None
    x = np.ascontiguousarray(data.astype(np.float64))
    if len(x) < int(SR * 0.08):
        return None
    try:
        f0, t = pw.harvest(x, SR, f0_floor=60.0, f0_ceil=900.0, frame_period=5.0)
        f0 = pw.stonemask(x, f0, t, SR)
        voiced = f0 > 0
        if voiced.sum() < 3:
            return None
        target = midi_to_hz(target_midi)
        n = len(f0)
        tt = np.arange(n) * 0.005

        # 颤音深度按时值分档：八分音符不颤，长音才颤，且 0.2s 后才渐入
        if beats >= 1.8:
            depth, delay = 30.0, 0.20
        elif beats >= 1.0:
            depth, delay = 15.0, 0.14
        else:
            depth, delay = 0.0, 0.0
        if depth > 0:
            ramp = np.clip((tt - delay) / 0.30, 0.0, 1.0)
            vib = 2 ** (depth * ramp * np.sin(2 * np.pi * 5.4 * tt) / 1200.0)
        else:
            vib = np.ones(n)

        curve = np.full(n, target) * vib

        # 起音滑音：同音重复不滑，超过四度的大跳也不滑（会显得油）
        if prev_midi is not None and 0.3 < abs(prev_midi - target_midi) <= 4.0:
            gn = min(int(0.07 / 0.005), n)
            if gn > 2:
                w = np.linspace(0.0, 1.0, gn)
                start_hz = midi_to_hz(prev_midi)
                curve[:gn] = np.exp(np.log(start_hz) * (1 - w) + np.log(target) * w) * vib[:gn]

        new_f0 = f0.copy()
        new_f0[voiced] = curve[voiced]
        sp = pw.cheaptrick(x, f0, t, SR)
        ap = pw.d4c(x, f0, t, SR)
        y = pw.synthesize(new_f0, sp, ap, SR, frame_period=5.0)
        return np.asarray(y, dtype=np.float32)
    except Exception:
        return None


def time_stretch(data, tempo_ratio, tmpdir, tag):
    """只改速度不改音高（变调已由 retune_world 完成）。"""
    if abs(tempo_ratio - 1.0) < 0.02:
        return data
    src = os.path.join(tmpdir, f"{tag}_s_in.wav")
    dst = os.path.join(tmpdir, f"{tag}_s_out.wav")
    write_wav(src, data)
    filt = f"rubberband=pitch=1.0:tempo={tempo_ratio:.6f}:transients=smooth"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
           "-af", filt, "-ar", str(SR), "-ac", "1", dst]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"rubberband 变速失败：{r.stderr[-400:]}")
    return read_wav(dst)


def shift_pitch(data, semitones, tempo_ratio, tmpdir, tag):
    """用 rubberband 同时做变调 + 变速，音色基本不变形。"""
    if abs(semitones) < 0.05 and abs(tempo_ratio - 1.0) < 0.02:
        return data
    src = os.path.join(tmpdir, f"{tag}_in.wav")
    dst = os.path.join(tmpdir, f"{tag}_out.wav")
    write_wav(src, data)
    pitch = 2 ** (semitones / 12)
    filt = f"rubberband=pitch={pitch:.6f}:tempo={tempo_ratio:.6f}:transients=smooth"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
           "-af", filt, "-ar", str(SR), "-ac", "1", dst]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"rubberband 变调失败：{r.stderr[-400:]}")
    return read_wav(dst)


# ---------------------------------------------------------------- 旋律

NOTE_BASE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
NOTE_RE = re.compile(r"^([A-Ga-g])([#b]?)(-?\d)$")


def parse_notes(spec):
    """'C4:.4 D#4:.4 E4:1.2' → [(midi, beats), ...]"""
    out = []
    for tok in spec.split():
        if ":" in tok:
            name, beats = tok.split(":", 1)
        else:
            name, beats = tok, "1"
        m = NOTE_RE.match(name.strip())
        if not m:
            raise SystemExit(f"看不懂的音符：{name}")
        letter, acc, octave = m.group(1).upper(), m.group(2), int(m.group(3))
        semi = NOTE_BASE[letter]
        if acc == "#":
            semi += 1
        elif acc == "b":
            semi -= 1
        midi = (octave + 1) * 12 + semi
        out.append((midi, float(beats)))
    return out


def fade(data, ms_in=6, ms_out=14):
    a = int(SR * ms_in / 1000)
    b = int(SR * ms_out / 1000)
    data = data.copy()
    if a > 0 and len(data) > a:
        data[:a] *= np.linspace(0, 1, a)
    if b > 0 and len(data) > b:
        data[-b:] *= np.linspace(1, 0, b)
    return data


def add_space(data, ms=40, sr=SR):
    """尾巴补一点静音，避免字和字黏在一起。"""
    n = int(sr * ms / 1000)
    if n <= 0:
        return data
    return np.concatenate([data, np.zeros(n, dtype=np.float32)])


def light_reverb(data, mix=0.14):
    """极简混响：几个指数衰减的早期反射，让干声不那么贴脸。"""
    out = data.astype(np.float64).copy()
    for delay_ms, gain in ((23, 0.5), (41, 0.34), (67, 0.22), (97, 0.14)):
        d = int(SR * delay_ms / 1000)
        if d >= len(out):
            continue
        out[d:] += data[: len(out) - d] * gain * mix
    peak = np.abs(out).max()
    if peak > 1e-6:
        out = out / peak * 0.9
    return out.astype(np.float32)


def assemble(segs, gap_ms=0, overlap_ms=0, sr=SR):
    """按顺序拼装。overlap_ms > 0 时让相邻音头尾交叠，听起来是连唱而不是念字。"""
    if not segs:
        return np.zeros(1, dtype=np.float32), []
    gap = int(sr * gap_ms / 1000)
    ov = int(sr * overlap_ms / 1000)

    # 先定好每段的起点，长度一次算准，避免累加时越界
    starts = [0]
    for i in range(1, len(segs)):
        starts.append(starts[-1] + len(segs[i - 1]) + gap - ov)
    total = starts[-1] + len(segs[-1])
    out = np.zeros(max(total, 1), dtype=np.float32)

    for i, s in enumerate(segs):
        st = starts[i]
        if i > 0 and ov > 0:
            n = min(ov, len(s))
            # 交叠区互补权重交叉淡化，避免相位打架出现音量凹陷
            w = np.linspace(0, 1, n, dtype=np.float32)
            out[st:st + n] = out[st:st + n] * (1 - w) + s[:n] * w
            out[st + n:st + len(s)] += s[n:]
        else:
            out[st:st + len(s)] += s
    return out, starts


# ---------------------------------------------------------------- 主流程


def render_phrase(chars, notes, opts, td, tag="p"):
    """渲染一句：逐字合成 → 定音高 → 对齐时值 → 拼装。

    song.py 复用它逐句渲染整首歌，所以这里不碰任何全局状态。
    返回 (audio, report, bank, starts, baseline)
    """
    voice, engine = opts["voice"], opts["engine"]
    beat_sec = opts["beat_sec"]
    gap, legato = opts.get("gap", 40), opts.get("legato", 20)

    bank = []
    for i, ch in enumerate(chars):
        raw = os.path.join(td, f"{tag}_{i}")
        if engine == "edge":
            mp3 = synth_edge(ch, voice, raw + ".mp3")
            wav = to_wav_44k(mp3, raw + ".wav")
        else:
            # kokoro 直接出 wav，要先写临时文件再转码（不能原地覆盖）
            src = synth_kokoro(ch, voice, raw + ".src.wav")
            wav = to_wav_44k(src, raw + ".wav")
        seg = trim_silence(read_wav(wav))
        if len(seg) == 0:
            raise SystemExit(f"第 {i+1} 个字合成出来是空的：{ch}")
        bank.append({"char": ch, "seg": seg, "f0": detect_f0(seg)})

    # 基准音高：只作为「F0 测不出或明显离谱时」的兜底。
    # 不能对所有字统一用同一个基准 —— 中文单字各带声调（"大"是去声，
    # 起音比"肥"高好几个半音），统一基准会把声调差直接变成走音。
    valid = [b["f0"] for b in bank if b["f0"]]
    if valid:
        base_hz = float(np.median(valid))
        baseline = round(hz_to_midi(base_hz))
    else:
        base_hz, baseline = 220.0, 57

    pieces, report = [], []
    for i, (b, (target_midi, beats)) in enumerate(zip(bank, notes)):
        seg = b["seg"]
        src_midi = hz_to_midi(b["f0"]) if b["f0"] else float(baseline)
        semis = target_midi - src_midi
        target_dur = beats * beat_sec
        used = "rubberband"

        # 首选 WORLD：能把声调抹平，音准才落得住
        prev_midi = notes[i - 1][0] if i > 0 else None
        tuned = (retune_world(seg, target_midi, beats=beats, prev_midi=prev_midi)
                 if opts.get("retune", 1) else None)
        if tuned is not None and len(tuned) > int(SR * 0.05):
            seg = tuned
            used = "world"
            seg = time_stretch(seg, (len(seg) / SR) / max(target_dur, 0.05), td, f"{tag}t{i}")
        else:
            seg = shift_pitch(seg, semis, (len(seg) / SR) / max(target_dur, 0.05), td, f"{tag}n{i}")

        seg = fit_length(seg, int(SR * target_dur))
        # 句中不淡出（交给交叠区衔接），句尾淡出，否则一句唱完是硬切
        is_last = i == len(bank) - 1
        seg = fade(seg, ms_out=0 if (legato > 0 and not is_last) else 30)
        pieces.append(seg)
        report.append({
            "char": b["char"],
            "target_midi": target_midi,
            "f0": round(b["f0"], 1) if b["f0"] else None,
            "semitones": round(semis, 2),
            "dur": round(len(seg) / SR, 3),
            "tuner": used,
        })

    audio, starts = assemble(pieces, gap_ms=gap, overlap_ms=legato)
    reverb = opts.get("reverb", 0.14)
    if reverb > 0:
        audio = light_reverb(audio, reverb)
    return audio, report, bank, starts, base_hz, baseline


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True, help="歌词，每个字对应一个音符")
    ap.add_argument("--notes", required=True, help="旋律，如 'C4:.4 D4:.4 E4:1.2'")
    ap.add_argument("--bpm", type=float, default=100)
    ap.add_argument("--engine", default="edge", choices=["edge", "kokoro"])
    ap.add_argument("--voice", default=None)
    ap.add_argument("--out", default="data/sing-demo/out.wav")
    ap.add_argument("--gap", type=float, default=40, help="字间静音毫秒")
    ap.add_argument("--legato", type=int, default=20, help="相邻音交叠毫秒，0 = 一字一顿")
    ap.add_argument("--retune", type=int, default=1, help="1=用 WORLD 压平声调（推荐），0=只做整体变调")
    ap.add_argument("--reverb", type=float, default=0.14)
    args = ap.parse_args()

    chars = [c for c in args.text if not c.isspace()]
    notes = parse_notes(args.notes)
    if len(chars) != len(notes):
        raise SystemExit(f"字数({len(chars)})和音符数({len(notes)})不一致：{chars}")

    voice = args.voice or ("zf_xiaoxiao" if args.engine == "kokoro" else "zh-CN-XiaoxiaoNeural")
    beat_sec = 60.0 / args.bpm

    out_path = args.out if os.path.isabs(args.out) else os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)

    opts = {
        "voice": voice, "engine": args.engine, "beat_sec": beat_sec,
        "gap": args.gap, "legato": args.legato, "retune": args.retune,
        "reverb": args.reverb,
    }
    with tempfile.TemporaryDirectory() as td:
        mix, report, bank, starts, base_hz, baseline = render_phrase(chars, notes, opts, td)

    write_wav(out_path, mix)

    # 客观校验：把输出按音符切回去测 F0，看有没有真的唱到目标音高。
    # 走音靠耳朵很难分辨，这步是唯一能确认「准不准」的地方。
    checks = []
    for i, (b, (target_midi, beats)) in enumerate(zip(bank, notes)):
        if i >= len(starts):
            break
        # 跳过交叠区，只取该音的稳定段
        a = starts[i] + int(SR * args.legato / 1000)
        z = min(len(mix), starts[i] + int(SR * beats * beat_sec))
        if z - a < int(SR * 0.06):
            a = starts[i]
        if z <= a:
            continue
        f = detect_f0(mix[a:z])
        hz_target = midi_to_hz(target_midi)
        err = 12 * math.log2(f / hz_target) if f else None
        checks.append({
            "char": b["char"],
            "target_midi": target_midi,
            "measured_hz": round(f, 1) if f else None,
            "target_hz": round(hz_target, 1),
            "error_semitones": round(err, 2) if err is not None else None,
        })

    print(json.dumps({
        "out": out_path,
        "seconds": round(len(mix) / SR, 2),
        "voice": voice,
        "engine": args.engine,
        "baseline": {"hz": round(base_hz, 1), "midi": baseline},
        "notes": report,
        "pitch_check": checks,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
