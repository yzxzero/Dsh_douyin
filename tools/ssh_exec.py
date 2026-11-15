"""在远程机器上执行命令（密码认证），用于部署前探测环境。

密码只从环境变量 SSHPASS 读取，不写进命令行参数、不落盘 —— 免得留在
shell 历史和文件里。

用法：
  SSHPASS='xxx' python tools/ssh_exec.py --host h --port 20774 -- "nvidia-smi; df -h"

多个命令用分号串在一个参数里即可；退出码会原样透出。
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
    ap.add_argument("--timeout", type=int, default=30, help="连接超时秒数")
    ap.add_argument("--sudo", action="store_true", help="用 sudo -S 执行（密码从 stdin 喂）")
    ap.add_argument("cmd", nargs="*", help="要执行的命令")
    args = ap.parse_args()

    password = os.environ.get("SSHPASS")
    if not password:
        raise SystemExit("缺少 SSHPASS 环境变量")

    cmd = " ".join(args.cmd).strip()
    if not cmd:
        raise SystemExit("没给命令")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=args.host,
            port=args.port,
            username=args.user,
            password=password,
            timeout=args.timeout,
            banner_timeout=args.timeout,
            auth_timeout=args.timeout,
            look_for_keys=False,
            allow_agent=False,
        )
    except Exception as exc:
        raise SystemExit(f"连接失败：{type(exc).__name__}: {exc}")

    try:
        stdin, stdout, stderr = client.exec_command(cmd, timeout=args.timeout + 60)
        if args.sudo:
            stdin.write(password + "\n")
            stdin.flush()
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
    finally:
        client.close()

    if out:
        sys.stdout.write(out)
    if err:
        sys.stderr.write(err)
    sys.exit(code)


if __name__ == "__main__":
    main()
