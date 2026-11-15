"""用 edge-tts 批量合成 RVC 训练集：单说话人、纯净、无混响、3~10 秒一段。

用法：
  python tools/rvc_make_dataset.py --corpus data/rvc-dataset/corpus_zh.txt \
      --out data/rvc-dataset/wav --voice zh-CN-XiaoxiaoNeural --target-min 13

设计取舍：
- 同一句话用不同 rate/pitch 重复合成，是为了拓宽音高与语速分布，
  避免模型只见过一种「播报腔」。
- pitch 抖动刻意压在 ±6Hz 以内。大幅改音高会让 edge 的韵律合成器产生
  明显的金属感，那种音色会被 RVC 当成「本人音色」学进去 —— 这正是
  TTS 训 RVC 最容易翻车的地方。
- 每段做静音剪除 + loudnorm 到 -20 LUFS，保证训练集电平一致。
"""
import argparse
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KOKORO_PY = os.path.join(ROOT, "tts-kokoro", ".venv", "Scripts", "python.exe")
FFMPEG = "ffmpeg"
FFPROBE = "ffprobe"

# 固定节奏表：确定性优先，方便复现和增量对比
RATES = ["+0%", "-8%", "+6%", "-4%", "+10%", "-6%", "+4%", "-10%", "+8%", "-2%"]
PITCHES = ["+0Hz", "-4Hz", "+5Hz", "-6Hz", "+3Hz", "+0Hz", "-2Hz", "+6Hz", "-5Hz", "+2Hz"]


def synth_mp3(text, voice, rate, pitch, out):
    cmd = [
        KOKORO_PY if os.path.exists(KOKORO_PY) else sys.executable,
        "-m", "edge_tts",
        "--text", text,
        "--voice", voice,
        # 必须用 = 形式：-8% / -4Hz 以 '-' 开头，argparse 会当成另一个选项，
        # 报 "argument --rate: expected one argument"
        "--rate=" + rate,
        "--pitch=" + pitch,
        "--write-media", out,
        "--no-progress",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0 or not os.path.exists(out):
        raise RuntimeError((r.stderr or r.stdout or "")[-300:])


def to_wav(src, dst):
    """转 48k 单声道 + 掐头去尾静音 + 统一响度。"""
    af = (
        "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,"
        "areverse,"
        "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,"
        "areverse,"
        "loudnorm=I=-20:TP=-2:LRA=11"
    )
    cmd = [
        FFMPEG, "-y", "-loglevel", "error", "-i", src,
        "-ac", "1", "-ar", "48000", "-sample_fmt", "s16",
        "-af", af, dst,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError((r.stderr or "")[-300:])


def duration(path):
    cmd = [
        FFPROBE, "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nk=1", path,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--voice", default="zh-CN-XiaoxiaoNeural")
    ap.add_argument("--target-min", type=float, default=13.0)
    ap.add_argument("--max-pass", type=int, default=2)
    ap.add_argument("--min-sec", type=float, default=2.5,
                    help="短于此的片段丢弃（信息量太低）")
    ap.add_argument("--max-sec", type=float, default=10.0,
                    help="长于此的片段丢弃（RVC 要求 3~10 秒）")
    args = ap.parse_args()

    with open(args.corpus, encoding="utf-8") as f:
        lines = [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]
    total_chars = sum(len(ln) for ln in lines)
    print("语料: %d 句, %d 字, 预估 %.1f 分钟/遍"
          % (len(lines), total_chars, total_chars / 4.5 / 60))

    os.makedirs(args.out, exist_ok=True)
    tmp = os.path.join(ROOT, "data", "rvc-dataset", "_tmp")
    os.makedirs(tmp, exist_ok=True)

    target = args.target_min * 60
    got, kept, dropped, idx = 0.0, [], [], 0
    for p in range(args.max_pass):
        if got >= target:
            break
        for i, text in enumerate(lines):
            if got >= target:
                break
            k = (i + p * 5) % len(RATES)
            rate, pitch = RATES[k], PITCHES[k]
            idx += 1
            mp3 = os.path.join(tmp, "t%04d.mp3" % idx)
            wav = os.path.join(args.out, "s%04d.wav" % idx)
            try:
                synth_mp3(text, args.voice, rate, pitch, mp3)
                to_wav(mp3, wav)
            except Exception as e:
                dropped.append({"idx": idx, "text": text, "why": str(e)[-120:]})
                continue
            d = duration(wav)
            if d < args.min_sec or d > args.max_sec:
                dropped.append({"idx": idx, "text": text, "why": "时长 %.2fs 越界" % d})
                os.remove(wav)
                continue
            kept.append({"file": os.path.basename(wav), "text": text,
                         "rate": rate, "pitch": pitch, "dur": round(d, 3)})
            got += d
            if idx % 10 == 0:
                print("  已合成 %d 段 / %.1fs（%.1f%%）" % (len(kept), got, got / target * 100))
        print("第 %d 遍完成，累计 %.1fs" % (p + 1, got))

    meta = {
        "voice": args.voice,
        "sample_rate": 48000,
        "total_sec": round(got, 2),
        "segments": len(kept),
        "params": {"loudnorm": "I=-20:TP=-2:LRA=11", "trim": "-50dB"},
        "items": kept,
        "dropped": dropped,
    }
    with open(os.path.join(ROOT, "data", "rvc-dataset", "manifest.json"), "w",
              encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)

    print("\n完成：%d 段，共 %.1f 秒（%.2f 分钟），丢弃 %d 段"
          % (len(kept), got, got / 60, len(dropped)))
    print("输出目录: %s" % args.out)


if __name__ == "__main__":
    main()
