"""探测 RVC 底模 ckpt 结构，判断能否直接用于推理。"""
import sys
import torch

path = sys.argv[1] if len(sys.argv) > 1 else "assets/pretrained_v2/G48k.pth"
c = torch.load(path, map_location="cpu", weights_only=False)

print("file:", path)
print("top keys:", list(c.keys()))
for k in ("f0", "version", "sr", "info"):
    print(f"  {k}: {c.get(k)}")
print("  config:", c.get("config"))

w = c.get("weight")
if w is None:
    print("!! 没有 weight")
    sys.exit(1)

ks = list(w.keys())
print("n_keys:", len(ks))
print("emb_g keys:", [k for k in ks if "emb_g" in k])
print("head:", ks[:5])
print("tail:", ks[-3:])
