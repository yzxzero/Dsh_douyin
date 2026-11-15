#!/bin/bash
# 轮询远程训练进度直到出现完成标记。
# 用「短连接多次轮询」而不是一条长连接守候：长连接在这种 NAT 后面空闲 5 分钟会被掐。
# 用法: H=host SSHPASS=pw bash tools/rvc_wait.sh <exp>
set -u
H="${H:?need H}"
EXP="${1:?exp}"
LOG="/root/rvc/logs/train_${EXP}.log"
REMOTE="echo \"E=\$(grep -c '轮次：' $LOG)\"; grep -q '全部完成' $LOG && echo DONE || echo RUNNING"

for i in $(seq 1 80); do
  OUT=$(MSYS_NO_PATHCONV=1 python tools/ssh_exec.py --host "$H" --port 26368 --user root --timeout 40 "$REMOTE" 2>&1)
  FLAT=$(echo "$OUT" | tr '\n' ' ')
  echo "[poll $i] $FLAT"
  case "$OUT" in
    *DONE*) echo "训练已结束"; break ;;
  esac
  sleep 45
done
