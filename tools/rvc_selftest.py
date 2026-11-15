"""RVC 环境自检：真实加载 hubert 与 rmvpe，跑一遍人声特征提取和音高提取。

只验证核心模型能加载、能出结果 —— 这两步过了，训练链路基本就通了。
"""
import os
import sys
import time

import numpy as np
import torch

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
sys.path.insert(0, ROOT)

import librosa  # noqa: E402

WAV = sys.argv[1] if len(sys.argv) > 1 else "test-input.wav"
if not os.path.exists(WAV):
    raise SystemExit(f"找不到音频：{WAV}")

print("[1/3] 加载 hubert ...", flush=True)
t0 = time.time()
from infer.hubert import load_hubert_model, extract_hubert_features  # noqa: E402

hubert = load_hubert_model("cuda", is_half=True)
print(f"      OK {time.time() - t0:.1f}s  显存 {torch.cuda.memory_allocated() / 1024**3:.2f}GB", flush=True)

wav, sr = librosa.load(WAV, sr=16000, mono=True)
print(f"[2/3] 音频 {len(wav) / sr:.2f}s @ {sr}Hz，提取 hubert 特征 ...", flush=True)
t0 = time.time()
# 输入 dtype 必须跟模型一致：half 模型喂 float32 会报 Input type 不匹配
model_dtype = next(hubert.parameters()).dtype
src = torch.from_numpy(wav).float().unsqueeze(0).to("cuda", dtype=model_dtype)
with torch.no_grad():
    feat = extract_hubert_features(hubert, src, "v2")
print(f"      OK {tuple(feat.shape)}  {time.time() - t0:.2f}s", flush=True)

print("[3/3] 加载 rmvpe 并提取音高 ...", flush=True)
t0 = time.time()
from infer.rmvpe import RMVPE  # noqa: E402

rm = RMVPE("assets/rmvpe/rmvpe.pt", is_half=True, device="cuda")
print(f"      模型 OK {time.time() - t0:.1f}s", flush=True)
t0 = time.time()
f0 = rm.infer_from_audio(wav.astype(np.float32), thred=0.03)
voiced = f0[f0 > 0]
print(f"      OK f0 {f0.shape}  有声 {100 * (f0 > 0).mean():.1f}%  "
      f"范围 {voiced.min():.0f}-{voiced.max():.0f}Hz  {time.time() - t0:.2f}s", flush=True)

print(f"\n显存峰值 {torch.cuda.max_memory_allocated() / 1024**3:.2f}GB")
print("SELFTEST OK")
