"""常驻的 Kokoro 合成进程：模型只加载一次，之后一行一条活儿地干。

stdin 每行一个 JSON：
  {"id":1,"text":"要念的话","out":"D:\\...\\xx.wav","voice":"zf_xiaobei","speed":0.95}
stdout 每行一个 JSON：
  启动完成  {"ready":true}
  合成成功  {"id":1,"ok":true,"sec":2.1,"sr":24000,"ms":900}
  合成失败  {"id":1,"ok":false,"error":"..."}

父进程（node）关掉 stdin 或退出时，这里读到 EOF 自己结束，不会留下野进程。
"""
import json
import os
import sys
import time
import wave

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("HF_HUB_OFFLINE", "1")

from misaki import zh  # noqa: E402
from kokoro_onnx import Kokoro  # noqa: E402

MODEL = os.path.join(ROOT, "model_quantized.onnx")
VOICES = os.path.join(ROOT, "voices.npz")


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    g2p = zh.ZHG2P()
    kokoro = Kokoro(MODEL, VOICES)
    emit({"ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            job = json.loads(line)
        except Exception as err:
            emit({"ok": False, "error": f"任务不是合法 JSON：{err}"})
            continue

        job_id = job.get("id")
        try:
            text = str(job.get("text") or "").strip()
            if not text:
                raise ValueError("没有可念的内容")
            out_path = job["out"]
            voice = str(job.get("voice") or "zf_xiaobei")
            speed = float(job.get("speed") or 0.95)

            started = time.time()
            g2p_out = g2p(text)
            # misaki 老版本返回 (phonemes, tokens)，0.7 之后直接返回字符串
            phonemes = g2p_out[0] if isinstance(g2p_out, (tuple, list)) else g2p_out
            audio, sr = kokoro.create(phonemes, voice=voice, speed=speed, is_phonemes=True)

            pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
            with wave.open(out_path, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(sr)
                w.writeframes(pcm.tobytes())

            emit(
                {
                    "id": job_id,
                    "ok": True,
                    "sec": round(len(audio) / sr, 2),
                    "sr": sr,
                    "ms": int((time.time() - started) * 1000),
                }
            )
        except Exception as err:  # 一条失败不影响后面的活儿
            emit({"id": job_id, "ok": False, "error": str(err)[:300]})


if __name__ == "__main__":
    main()
