"""把 pretrained_v2 的训练存档包成推理格式 pth（仅用于验证链路，音色是退化均值）。

pretrained_v2/G*.pth 的顶层是 {'model','iteration','learning_rate'}，
而 infer/cli.py 需要 {'weight','config','f0','version','sr','info'}。
本脚本做这层包装，并保留 emb_g 以便 speaker-id 生效。
"""
import sys
import torch

src = sys.argv[1] if len(sys.argv) > 1 else "assets/pretrained_v2/G48k.pth"
dst = sys.argv[2] if len(sys.argv) > 2 else "assets/weights/_probe_wrap.pth"

c = torch.load(src, map_location="cpu", weights_only=False)
sd = c["model"]
keys = list(sd.keys())
print("state_dict n_keys:", len(keys))
print("head:", keys[:4])
emb = [k for k in keys if "emb_g" in k]
print("emb_g:", emb)
if emb:
    print("emb_g.shape:", tuple(sd[emb[0]].shape))
print("has enc_p.emb_phone:", "enc_p.emb_phone.weight" in sd)
if "enc_p.emb_phone.weight" in sd:
    print("  shape:", tuple(sd["enc_p.emb_phone.weight"].shape))

n_spk = int(sd[emb[0]].shape[0]) if emb else 1
gin = int(sd[emb[0]].shape[1]) if emb else 256
# 按 configs/v2/48k.json 的真实取值组装：
# upsample_rates=[12,10,2,2]，upsample_kernel_sizes=[24,20,4,4]，gin_channels=256，
# 末尾 sr 为 SynthesizerTrnMs768NSFsid 的必需位置参数
assert n_spk == 109, "spk_embed_dim 与 configs/v2/48k.json 不一致：%s" % n_spk
assert gin == 256, "gin_channels 与 configs/v2/48k.json 不一致：%s" % gin
config = [1025, 32, 192, 192, 768, 2, 6, 3, 0, "1", [3, 7, 11],
          [[1, 3, 5], [1, 3, 5], [1, 3, 5]], [12, 10, 2, 2], 512, [24, 20, 4, 4],
          n_spk, gin, 48000]
out = {
    "weight": sd,
    "config": config,
    "f0": 1,
    "version": "v2",
    "sr": "48k",
    "info": "probe-wrap from %s" % src,
}
torch.save(out, dst)
print("wrote", dst)
print("config:", config)
