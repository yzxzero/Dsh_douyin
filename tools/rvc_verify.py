"""音色迁移客观检验：比较「参考原声」与「RVC 转换结果」的音色指纹相似度。

用法:
  python rvc_verify.py 原声.wav 转换后.wav [另一个对照.wav ...]

指标：
  mel-cos  平均梅尔谱的单位向量余弦相似度（音色指纹，越接近 1 越像同一个人）
  mfcc-d  梅尔倒谱系数均值的欧氏距离（越小越像）
  f0       中位基频，检验音高是否被保留
"""
import sys

import librosa
import numpy as np


def load(path, sr=48000):
    y, _ = librosa.load(path, sr=sr, mono=True)
    return y


def fingerprint(y, sr=48000, n_mels=128):
    # 只取有声帧，避免静音段把平均值拉平
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=256)[0]
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=n_mels,
                                         n_fft=2048, hop_length=256)
    logmel = librosa.power_to_db(mel)
    thr = np.percentile(rms, 40)
    mask = rms >= thr
    if mask.sum() < 5:
        mask = np.ones_like(rms, dtype=bool)
    n = min(logmel.shape[1], mask.shape[0])
    v = logmel[:, :n][:, mask[:n]].mean(axis=1)
    v = v - v.mean()
    return v / (np.linalg.norm(v) + 1e-9)


def mfcc_mean(y, sr=48000, n=20):
    m = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n, n_fft=2048, hop_length=256)
    return m.mean(axis=1)


def f0_med(y, sr=48000):
    f = librosa.yin(y, fmin=60, fmax=800, sr=sr, frame_length=2048)
    f = f[np.isfinite(f)]
    f = f[(f > 60) & (f < 800)]
    return float(np.median(f)) if len(f) else 0.0


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    paths = sys.argv[1:]
    names = [p.split("/")[-1] for p in paths]
    ys = [load(p) for p in paths]
    fps = [fingerprint(y) for y in ys]
    mf = [mfcc_mean(y) for y in ys]
    f0 = [f0_med(y) for y in ys]

    print("%-24s%10s" % ("file", "f0(Hz)"))
    for n, f in zip(names, f0):
        print("%-24s%10.1f" % (n, f))

    print("\n音色指纹（相对第一行）")
    print("%-24s%10s%10s" % ("file", "mel-cos", "mfcc-d"))
    base_mf = mf[0]
    for n, v, m in zip(names, fps, mf):
        cos = float(np.dot(fps[0], v))
        d = float(np.linalg.norm(m - base_mf))
        print("%-24s%10.4f%10.2f" % (n, cos, d))


if __name__ == "__main__":
    main()
