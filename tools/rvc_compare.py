"""对比 RVC 输入/输出音频，验证转换是否真的生效。

用法: python rvc_compare.py in.wav out_a.wav out_b.wav
指标: 时长 / RMS / 频谱质心 / 两两相关系数 / 平均插值 F0
"""
import sys
import wave

import numpy as np


def read(path):
    with wave.open(path) as w:
        n = w.getnframes()
        sr = w.getframerate()
        ch = w.getnchannels()
        raw = w.readframes(n)
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    return a, sr


def centroid(a, sr):
    win = 2048
    if len(a) < win:
        return 0.0
    idx = np.arange(0, len(a) - win, win)
    frame = np.stack([a[i:i + win] * np.hanning(win) for i in idx])
    spec = np.abs(np.fft.rfft(frame, axis=1))
    freqs = np.fft.rfftfreq(win, 1.0 / sr)
    denom = spec.sum(axis=1) + 1e-9
    return float(((spec * freqs).sum(axis=1) / denom).mean())


def f0_median(a, sr, fmin=80.0, fmax=600.0):
    win, hop = 1024, 512
    lo, hi = int(sr / fmax), int(sr / fmin)
    vals = []
    for i in range(0, len(a) - win, hop):
        fr = a[i:i + win]
        if np.sqrt((fr ** 2).mean()) < 0.01:
            continue
        fr = fr - fr.mean()
        corr = np.correlate(fr, fr, mode="full")[win - 1:]
        if corr[0] <= 0:
            continue
        seg = corr[lo:hi]
        if not len(seg):
            continue
        k = int(np.argmax(seg))
        if seg[k] < 0.3 * corr[0]:
            continue
        vals.append(sr / (lo + k))
    return float(np.median(vals)) if vals else 0.0


def corr(a, b):
    n = min(len(a), len(b))
    a, b = a[:n], b[:n]
    a = a - a.mean()
    b = b - b.mean()
    d = np.sqrt((a ** 2).sum() * (b ** 2).sum()) + 1e-12
    return float((a * b).sum() / d)


def main():
    paths = sys.argv[1:]
    names = [p.split("/")[-1] for p in paths]
    data = []
    print(f"{'file':<18}{'dur(s)':>8}{'sr':>7}{'rms(dB)':>10}{'centroid':>10}{'f0(Hz)':>9}")
    for p, n in zip(paths, names):
        a, sr = read(p)
        rms = 20 * np.log10(np.sqrt((a ** 2).mean()) + 1e-9)
        f0 = f0_median(a, sr)
        print(f"{n:<18}{len(a)/sr:>8.2f}{sr:>7}{rms:>10.2f}{centroid(a, sr):>10.0f}{f0:>9.1f}")
        data.append(a)

    print("\n两两相关系数（1.0=完全一样）")
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            c = corr(data[i], data[j])
            print(f"  {names[i]} vs {names[j]}: {c:.4f}")

    if len(data) >= 3:
        a, b = data[1], data[2]
        n = min(len(a), len(b))
        diff = np.abs(a[:n] - b[:n])
        print(f"\nspeaker 间差异: 最大 {diff.max():.4f} 均值 {diff.mean():.4f}")


if __name__ == "__main__":
    main()
