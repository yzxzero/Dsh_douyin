"""按乐谱 JSON 渲染一整首歌（TTS 音色演唱 + 合成伴奏）。

和 sing.py 的分工：sing.py 渲染单句、适合片头几个字；本脚本按乐句排版成
完整曲子，并把简单伴奏叠上去 —— 一分钟的清唱没人听得下去。

用法：
  python tools/song.py --score data/sing-demo/score_dafeiyu.json
  python tools/song.py --score xx.json --out data/sing-demo/song.wav

乐谱格式：
{
  "title": "大肥鱼之歌",
  "bpm": 100,
  "engine": "edge",              // edge | kokoro
  "voice": "zh-CN-XiaoxiaoNeural",
  "gap_beats": 1,                // 句间换气休止（拍）
  "accompaniment": 0.34,         // 伴奏音量，0 = 不要伴奏
  "phrases": [
    {"lyric": "大肥鱼游过来", "notes": "E4:1 G4:1 A4:1 G4:1 E4:2 D4:2",
     "chords": ["C", "Am"]}      // 每小节一个和弦，一小节 4 拍
  ]
}
"""
import argparse
import json
import math
import os
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sing  # noqa: E402

SR = sing.SR
ROOT = sing.ROOT

CHORD_INTERVALS = {
    "": (0, 4, 7),
    "m": (0, 3, 7),
    "7": (0, 4, 7, 10),
    "maj7": (0, 4, 7, 11),
    "sus4": (0, 5, 7),
    "dim": (0, 3, 6),
}
NOTE_BASE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def parse_chord(name, octave=3):
    """'Am7' → 根音 MIDI（默认第 3 八度）"""
    name = name.strip()
    letter = name[0].upper()
    rest = name[1:]
    semi = NOTE_BASE.get(letter)
    if semi is None:
        raise SystemExit(f"看不懂的和弦：{name}")
    while rest[:1] in ("#", "b"):
        semi += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    root = (octave + 1) * 12 + semi
    return root, CHORD_INTERVALS.get(rest, CHORD_INTERVALS[""])


def chord_voice(root_midi, intervals, dur, amp=0.22):
    """电钢味的三和弦：基频 + 二三次谐波，快起音 + 缓慢衰减。"""
    n = int(SR * dur)
    if n <= 0:
        return np.zeros(1, dtype=np.float32)
    t = np.arange(n) / SR
    out = np.zeros(n, dtype=np.float64)
    for semi in intervals:
        f = sing.midi_to_hz(root_midi + semi)
        for h, w in ((1, 1.0), (2, 0.32), (3, 0.16)):
            out += w * np.sin(2 * np.pi * f * h * t)
    out /= len(intervals) * 1.6

    env = np.exp(-t / max(dur * 0.55, 0.08)) * 0.75 + 0.25
    a = min(int(SR * 0.012), n)
    if a > 0:
        env[:a] *= np.linspace(0, 1, a)
    r = min(int(SR * 0.10), n)
    if r > 0:
        env[-r:] *= np.linspace(1, 0, r)
    return (out * env * amp).astype(np.float32)


def bass_voice(root_midi, dur, amp=0.17):
    """低音根音，比和弦低一个八度，尽量干净不抢人声。"""
    n = int(SR * dur)
    if n <= 0:
        return np.zeros(1, dtype=np.float32)
    t = np.arange(n) / SR
    f = sing.midi_to_hz(root_midi - 12)
    out = np.sin(2 * np.pi * f * t) + 0.12 * np.sin(2 * np.pi * f * 2 * t)
    env = np.exp(-t / max(dur * 0.7, 0.1)) * 0.8 + 0.2
    a = min(int(SR * 0.02), n)
    if a > 0:
        env[:a] *= np.linspace(0, 1, a)
    r = min(int(SR * 0.12), n)
    if r > 0:
        env[-r:] *= np.linspace(1, 0, r)
    return (out * env * amp).astype(np.float32)


def place(buf, audio, at):
    """把 audio 叠加到 buf 的 at 位置，越界自动裁掉。"""
    if at >= len(buf):
        return
    n = min(len(audio), len(buf) - at)
    buf[at:at + n] += audio[:n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--score", required=True)
    ap.add_argument("--out", default=None)
    ap.add_argument("--voice", default=None)
    ap.add_argument("--engine", default=None)
    ap.add_argument("--bpm", type=float, default=None)
    ap.add_argument("--legato", type=int, default=32, help="相邻音交叠毫秒，调大可减轻念字感")
    ap.add_argument("--retune", type=int, default=1)
    args = ap.parse_args()

    path = args.score if os.path.isabs(args.score) else os.path.join(ROOT, args.score)
    with open(path, "r", encoding="utf-8") as fh:
        score = json.load(fh)

    bpm = args.bpm or score.get("bpm", 100)
    engine = args.engine or score.get("engine", "edge")
    voice = args.voice or score.get("voice") or (
        "zf_xiaoxiao" if engine == "kokoro" else "zh-CN-XiaoxiaoNeural")
    beat_sec = 60.0 / bpm
    gap_beats = float(score.get("gap_beats", 1))
    acc_level = float(score.get("accompaniment", 0.34))

    phrases = score.get("phrases") or []
    if not phrases:
        raise SystemExit("乐谱里没有 phrases")

    opts = {
        "voice": voice, "engine": engine, "beat_sec": beat_sec,
        "gap": 20, "legato": args.legato, "retune": args.retune,
        "reverb": 0,  # 每句单独加混响会让接缝不一致，整首合成后统一加
    }

    timeline = []      # (start_sample, audio, phrase_meta)
    chord_events = []  # (start_sample, chord_name, dur)
    cursor = 0.0

    with tempfile.TemporaryDirectory() as td:
        for pi, ph in enumerate(phrases):
            lyric = [c for c in ph["lyric"] if not c.isspace()]
            notes = sing.parse_notes(ph["notes"])
            if len(lyric) != len(notes):
                raise SystemExit(
                    f"第 {pi+1} 句字数({len(lyric)})与音符数({len(notes)})不一致：{ph['lyric']}")

            audio, report, _bank, _starts, _bhz, _base = sing.render_phrase(
                lyric, notes, opts, td, tag=f"p{pi}")

            bar_len = 4 * beat_sec
            for ci, chord in enumerate(ph.get("chords") or []):
                chord_events.append(
                    (int((cursor + ci * bar_len) * SR), chord, bar_len))

            timeline.append((int(cursor * SR), audio, ph["lyric"], report))
            # 每句占「音符总拍数 + 句间休止」
            phrase_beats = sum(b for _m, b in notes)
            cursor += phrase_beats * beat_sec + gap_beats * beat_sec
            print(f"  [{pi+1}/{len(phrases)}] {ph['lyric']}  →  {cursor:.1f}s",
                  file=sys.stderr)

    total = int(cursor * SR)
    vocal = np.zeros(total, dtype=np.float32)
    for at, audio, _lyric, _report in timeline:
        place(vocal, audio, at)

    peak = float(np.abs(vocal).max())
    if peak > 1e-6:
        vocal = vocal / peak * 0.86

    inst = np.zeros(total, dtype=np.float32)
    if acc_level > 0:
        for at, name, dur in chord_events:
            root, ivs = parse_chord(name)
            place(inst, chord_voice(root, ivs, dur), at)
            place(inst, bass_voice(root, dur), at)
        ipeak = float(np.abs(inst).max())
        if ipeak > 1e-6:
            inst = inst / ipeak * acc_level
    else:
        inst = np.zeros(total, dtype=np.float32)

    mix = vocal + inst
    mix = sing.light_reverb(mix, 0.12)
    mpeak = float(np.abs(mix).max())
    if mpeak > 1e-6:
        mix = mix / mpeak * 0.94

    out_path = args.out or f"data/sing-demo/{score.get('title', 'song')}.wav"
    out_path = out_path if os.path.isabs(out_path) else os.path.join(ROOT, out_path)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    sing.write_wav(out_path, mix)

    # 统计有多少音走了 WORLD（成功压平声调）、多少回退到整体变调
    tuners = {}
    max_semis = 0.0
    for _at, _audio, _lyric, report in timeline:
        for r in report:
            tuners[r["tuner"]] = tuners.get(r["tuner"], 0) + 1
            max_semis = max(max_semis, abs(r["semitones"]))
    print(json.dumps({
        "out": out_path,
        "title": score.get("title"),
        "seconds": round(len(mix) / SR, 2),
        "bpm": bpm,
        "voice": voice,
        "phrases": len(phrases),
        "notes_count": sum(len(sing.parse_notes(p["notes"])) for p in phrases),
        "chords": len(chord_events),
        "accompaniment": acc_level,
        "tuners": tuners,
        "max_semitones": round(max_semis, 2),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
