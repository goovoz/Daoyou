#!/usr/bin/env python3
"""[daoyou-fork L0] Daoyou <-> DSH 交接队列（跑在 101；本机 DSH 通过 ssh 调它）。

链路：
  101 的 sync-handoff-watch 发现「同步需要人判」  ->  enqueue 一个任务
  本机 DSH 领走（claim）-> 在 101 上修（ssh）-> report

这个脚本不发任何网络请求、不调用任何模型：判断由 DSH 做，脚本只记录与交付证据。

目录（DSH_HANDOFF_HOME，默认 /var/lib/daoyou-dsh）：
  tasks/<id>.json   任务本体，status 字段即生命周期
  evidence/<id>.*   证据包
  .lock             flock，串行化写入

生命周期：
  queued --claim--> claimed --report done|failed--> done|failed
  claimed 带租约 lease_until（默认 90 分钟）。DSH 半路挂掉后租约过期，
  任务会被 list --stale 列出、可重领，不会永久卡死。

幂等：同 fingerprint 已有 queued/claimed 任务时，enqueue 直接返回 SKIP <id>。

用法：
  dsh-handoff.py enqueue --kind sync-conflict --fingerprint <sha> < task.json
  dsh-handoff.py status
  dsh-handoff.py list [--status queued,claimed] [--stale]
  dsh-handoff.py show --id <id>
  dsh-handoff.py claim [--kind sync-conflict] [--ttl 90]
  dsh-handoff.py report <id> --status done|failed --message '...' [--commit <sha>]
"""

import argparse
import fcntl
import json
import os
import sys
from datetime import datetime, timedelta, timezone

HOME = os.environ.get("DSH_HANDOFF_HOME", "/var/lib/daoyou-dsh")
TASKS = os.path.join(HOME, "tasks")
EVID = os.path.join(HOME, "evidence")
LOCK = os.path.join(HOME, ".lock")

ACTIVE = ("queued", "claimed")
STATUSES = ("queued", "claimed", "done", "failed")


def now_utc():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(text):
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def ensure_dirs():
    os.makedirs(TASKS, exist_ok=True)
    os.makedirs(EVID, exist_ok=True)


class Lock:
    def __enter__(self):
        ensure_dirs()
        self.fh = open(LOCK, "w")
        fcntl.flock(self.fh, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        fcntl.flock(self.fh, fcntl.LOCK_UN)
        self.fh.close()
        return False


def load_all():
    if not os.path.isdir(TASKS):
        return []
    out = []
    for name in sorted(os.listdir(TASKS)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(TASKS, name)
        try:
            with open(path, encoding="utf-8") as fh:
                out.append(json.load(fh))
        except Exception as exc:  # noqa: BLE001
            print("warn: 跳过坏任务文件 %s: %s" % (path, exc), file=sys.stderr)
    return out


def write_task(task):
    path = os.path.join(TASKS, task["id"] + ".json")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(task, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write("\n")
    os.replace(tmp, path)


def is_stale(task):
    if task.get("status") != "claimed":
        return False
    lease = task.get("lease_until")
    if not lease:
        return True
    try:
        return parse_iso(lease) < now_utc()
    except ValueError:
        return True


def one_line(task):
    text = task.get("summary") or task.get("reason") or task.get("message") or ""
    return " ".join(str(text).split())[:90]


def cmd_enqueue(args):
    raw = sys.stdin.read()
    if not raw.strip():
        print("enqueue: 需要从 stdin 读一份任务 JSON", file=sys.stderr)
        return 2
    payload = json.loads(raw)
    fp = args.fingerprint
    with Lock():
        for task in load_all():
            if task.get("fingerprint") == fp and task.get("status") in ACTIVE:
                print("SKIP " + task["id"])
                return 0
        task = dict(payload)
        task["kind"] = args.kind
        task["fingerprint"] = fp
        task["priority"] = int(args.priority)
        task["status"] = "queued"
        task["created_at"] = iso(now_utc())
        task["id"] = "%s-%s-%s" % (now_utc().strftime("%Y%m%dT%H%M%S"), args.kind, fp[:8])
        write_task(task)
        print(task["id"])
    return 0


def status_match(task, wanted):
    if not wanted:
        return True
    return task.get("status") in [w.strip() for w in wanted.split(",") if w.strip()]


def cmd_list(args):
    tasks = [t for t in load_all() if status_match(t, args.status)]
    if args.stale:
        tasks = [t for t in tasks if is_stale(t)]
    if not tasks:
        print("(空)")
        return 0
    for task in sorted(tasks, key=lambda t: t.get("created_at", "")):
        line = "{id}  {st:<8} {kind:<15} {created}  {txt}".format(
            id=task.get("id", "?"),
            st=task.get("status", "?"),
            kind=task.get("kind", "?"),
            created=task.get("created_at", "?"),
            txt=one_line(task),
        )
        if is_stale(task):
            line += "  [租约过期]"
        print(line)
    return 0


def cmd_show(args):
    for task in load_all():
        if task.get("id") == args.id:
            print(json.dumps(task, ensure_ascii=False, indent=2, sort_keys=True))
            return 0
    print("没有任务 %s" % args.id, file=sys.stderr)
    return 4


def cmd_claim(args):
    with Lock():
        candidates = [
            t for t in load_all() if t.get("status") == "queued" or is_stale(t)
        ]
        if args.kind:
            candidates = [t for t in candidates if t.get("kind") == args.kind]
        if not candidates:
            print("没有可领的任务。", file=sys.stderr)
            return 4
        candidates.sort(key=lambda t: (-int(t.get("priority", 0)), t.get("created_at", "")))
        task = candidates[0]
        task["status"] = "claimed"
        task["claimed_by"] = args.by
        task["claimed_at"] = iso(now_utc())
        task["lease_until"] = iso(now_utc() + timedelta(minutes=args.ttl))
        write_task(task)
        print(json.dumps(task, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


def cmd_report(args):
    with Lock():
        tasks = load_all()
        for task in tasks:
            if task.get("id") != args.id:
                continue
            if args.status not in ("done", "failed"):
                print("report: --status 只能是 done / failed", file=sys.stderr)
                return 2
            task["status"] = args.status
            task["message"] = args.message
            task["closed_at"] = iso(now_utc())
            if args.commit:
                task["commit"] = args.commit
            if args.branch:
                task["branch"] = args.branch
            task.pop("lease_until", None)
            write_task(task)
            print("已记录：%s -> %s" % (task["id"], args.status))
            return 0
        print("没有任务 %s" % args.id, file=sys.stderr)
        return 4


def cmd_status(_args):
    tasks = load_all()
    counts = {s: 0 for s in STATUSES}
    stale = 0
    oldest = None
    for task in tasks:
        st = task.get("status", "?")
        if st in counts:
            counts[st] += 1
        if is_stale(task):
            stale += 1
        if st == "queued" and (oldest is None or task.get("created_at", "") < oldest):
            oldest = task.get("created_at")
    print("队列 %s" % HOME)
    print(
        "  queued=%d claimed=%d done=%d failed=%d  租约过期=%d"
        % (counts["queued"], counts["claimed"], counts["done"], counts["failed"], stale)
    )
    if oldest:
        print("  最久未领：%s" % oldest)
    if counts["queued"]:
        print("  下一步：dsh-handoff.py claim --kind sync-conflict")
    return 0


def main(argv):
    parser = argparse.ArgumentParser(prog="dsh-handoff.py", description="Daoyou <-> DSH 交接队列")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("enqueue", help="从 stdin 读任务 JSON 并入队")
    p.add_argument("--kind", required=True)
    p.add_argument("--fingerprint", required=True)
    p.add_argument("--priority", default=0)
    p.set_defaults(func=cmd_enqueue)

    p = sub.add_parser("list", help="列出任务")
    p.add_argument("--status", default="")
    p.add_argument("--stale", action="store_true")
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("show", help="打印单个任务")
    p.add_argument("--id", required=True)
    p.set_defaults(func=cmd_show)

    p = sub.add_parser("claim", help="领一个任务（默认租约 90 分钟）")
    p.add_argument("--kind", default="")
    p.add_argument("--ttl", type=int, default=90)
    p.add_argument("--by", default="dsh")
    p.set_defaults(func=cmd_claim)

    p = sub.add_parser("report", help="回填结果")
    p.add_argument("id")
    p.add_argument("--status", required=True)
    p.add_argument("--message", required=True)
    p.add_argument("--commit", default="")
    p.add_argument("--branch", default="")
    p.set_defaults(func=cmd_report)

    p = sub.add_parser("status", help="队列概览")
    p.set_defaults(func=cmd_status)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
