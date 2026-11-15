"""上传本地文件到远程机器（密码认证）。

密码从 SSHPASS 环境变量读，不落命令行。

用法：
  SSHPASS='xxx' python tools/ssh_put.py --host h --port 26368 \
      --local data/voice/x.wav --remote /root/rvc/dataset/x.wav
"""
import argparse
import os
import sys

import paramiko


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True)
    ap.add_argument("--port", type=int, default=22)
    ap.add_argument("--user", default="root")
    ap.add_argument("--local", required=True)
    ap.add_argument("--remote", required=True)
    ap.add_argument("--timeout", type=int, default=60)
    args = ap.parse_args()

    password = os.environ.get("SSHPASS")
    if not password:
        raise SystemExit("缺少 SSHPASS 环境变量")
    if not os.path.exists(args.local):
        raise SystemExit(f"本地文件不存在：{args.local}")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=args.host, port=args.port, username=args.user,
            password=password, timeout=args.timeout, banner_timeout=args.timeout,
            auth_timeout=args.timeout, look_for_keys=False, allow_agent=False,
        )
        sftp = client.open_sftp()
        sftp.put(args.local, args.remote)
        size = sftp.stat(args.remote).st_size
        sftp.close()
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise SystemExit(f"上传失败：{type(exc).__name__}: {exc}")
    finally:
        client.close()

    print(f"uploaded {args.local} -> {args.remote} ({size} bytes)")


if __name__ == "__main__":
    main()
