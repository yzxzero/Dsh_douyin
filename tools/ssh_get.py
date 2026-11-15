"""通过 SFTP 从远程拉取文件。密码只从环境变量 SSHPASS 读取。

用法:
  SSHPASS=xxx python tools/ssh_get.py --host h --port p --user root \
      --remote /tmp/a.wav --local data/a.wav
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
    ap.add_argument("--remote", required=True)
    ap.add_argument("--local", required=True)
    ap.add_argument("--timeout", type=int, default=120)
    args = ap.parse_args()

    pwd = os.environ.get("SSHPASS")
    if not pwd:
        sys.exit("缺少环境变量 SSHPASS")

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(
        hostname=args.host,
        port=args.port,
        username=args.user,
        password=pwd,
        timeout=args.timeout,
        banner_timeout=args.timeout,
        auth_timeout=args.timeout,
    )
    try:
        sftp = cli.open_sftp()
        parent = os.path.dirname(os.path.abspath(args.local))
        if parent:
            os.makedirs(parent, exist_ok=True)
        sftp.get(args.remote, args.local)
        sftp.close()
        size = os.path.getsize(args.local)
        print("downloaded %s -> %s (%d bytes)" % (args.remote, args.local, size))
    finally:
        cli.close()


if __name__ == "__main__":
    main()
