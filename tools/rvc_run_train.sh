#!/bin/bash
# RVC v2 48k 训练流程（单说话人，f0 条件模型）
# 用法: bash run_train.sh <exp_name> <inp_dir> [total_epoch] [batch_size]
set -euo pipefail
cd /root/rvc

EXP="${1:?exp_name}"
INP="${2:?input dir}"
TE="${3:-200}"
BS="${4:-8}"
SR=48k
SR_INT=48000
SPK=0
VER=v2
NPROC=4
EDIR="/root/rvc/logs/$EXP"

PY=./.venv/bin/python
export PYTHONPATH=/root/rvc
export OPENBLAS_NUM_THREADS=1

say() { echo; echo "===== $* ====="; date '+%H:%M:%S'; }

mkdir -p "$EDIR" "$(dirname "$INP")"

say "0/6 检查输入"
test -d "$INP" || { echo "缺输入目录 $INP"; exit 1; }
CNT=$(find "$INP" -name '*.wav' | wc -l)
echo "输入 wav: $CNT 个"
[ "$CNT" -ge 10 ] || { echo "样本太少"; exit 1; }

say "1/6 切分 + 重采样到 16k"
# 第 6 个参数是「切片长度(秒)」，不是使用比例！PreProcess.__init__(per=3.7)，
# overlap=0.3、tail=per+overlap。传 1.0 会把 4 秒素材按 0.3 秒步进切成
# 4 段 1 秒的重叠碎块（总时长反而变长）。
$PY -m train.preprocess "$INP" "$SR_INT" "$NPROC" "$EDIR" False 3.7
echo "0_gt_wavs: $(ls "$EDIR/0_gt_wavs" | wc -l) 段"

say "2/6 提取 F0 (rmvpe)"
$PY -m train.dataset.extract_f0 cuda 1 0 0 "$EDIR" True
echo "2a_f0: $(ls "$EDIR/2a_f0" 2>/dev/null | wc -l)"

say "3/6 提取 HuBERT 特征 (768 维)"
$PY -m train.dataset.extract_hubert_feature cuda 1 0 0 "$EDIR" "$VER" True
echo "3_feature768: $(ls "$EDIR/3_feature768" 2>/dev/null | wc -l)"

say "4/6 写 filelist + config"
# filelist 正常由 webui.py 生成，命令行流程缺这一步，这里按它的格式补上。
# 格式: gt_wavs|feature|f0|f0nsf|speaker
# 注意：webui 还会追加 2 行 logs/mute 静音样本。这里不加 —— 数字静音送进
# rmvpe 会产出 NaN 特征，反而污染训练；RVC 官方那份 mute wav 是特制的。
$PY - "$EDIR" "$SPK" <<'PYEOF'
import os, sys, random
exp, spk = sys.argv[1], sys.argv[2]
gt, ft = exp + "/0_gt_wavs", exp + "/3_feature768"
f0, f0n = exp + "/2a_f0", exp + "/2b-f0nsf"
names = (set(n.split(".")[0] for n in os.listdir(gt))
         & set(n.split(".")[0] for n in os.listdir(ft))
         & set(n.split(".")[0] for n in os.listdir(f0))
         & set(n.split(".")[0] for n in os.listdir(f0n)))
if not names:
    sys.exit("四个目录没有交集，特征提取有问题")
lines = ["%s/%s.wav|%s/%s.npy|%s/%s.wav.npy|%s/%s.wav.npy|%s"
         % (gt, n, ft, n, f0, n, f0n, n, spk) for n in sorted(names)]
random.seed(1234)
random.shuffle(lines)
with open(exp + "/filelist.txt", "w", encoding="utf8") as f:
    f.write("\n".join(lines))
print("filelist 写入 %d 条（四目录交集）" % len(lines))
PYEOF

if [ ! -f "$EDIR/config.json" ]; then
  cp "configs/$VER/$SR.json" "$EDIR/config.json"
  echo "config.json 已从 configs/$VER/$SR.json 复制"
else
  echo "config.json 已存在，保留原文件"
fi

say "5/6 训练 (te=$TE bs=$BS se=25)"
PGC="assets/pretrained_v2/f0G48k.pth"
PDC="assets/pretrained_v2/f0D48k.pth"
test -f "$PGC" || { echo "缺底模 $PGC"; exit 1; }
$PY -m train.train -e "$EXP" -sr "$SR" -f0 1 -bs "$BS" -g 0 \
  -te "$TE" -se 25 -pg "$PGC" -pd "$PDC" -l 1 -c 0 -sw 1 -v "$VER"

say "6/6 建索引"
$PY -m train.train_index "$EXP" "$VER" "/root/rvc/assets/indices" 4 auto

say "全部完成"
ls -lt "/root/rvc/assets/weights" | head -6
ls -lt "$EDIR"/*.index 2>/dev/null | head -3
