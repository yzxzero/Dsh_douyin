"""强制 fp32 跑一次推理，用于对照 fp16 是否劣化输出。

Config 的 dtype 由设备画像自动选择，CLI 没暴露开关，所以这里替换 create_config。
"""
import sys

import torch

import infer.cli as cli

_orig = cli.create_config


def patched():
    cfg = _orig()
    cfg.dtype = torch.float32
    cfg.is_half = False
    print("!! 已强制 dtype=float32 is_half=False")
    return cfg


cli.create_config = patched
raise SystemExit(cli.main())
