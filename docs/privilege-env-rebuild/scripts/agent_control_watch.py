#!/usr/bin/env python3
"""Watch the PingOne Privilege desktop agent's log for control requests (disable / enable / tenant switch) and, the moment one
arrives, record who could have sent it. READ-ONLY: it never calls the agent's API (127.0.0.1:8008), changes nothing and prints no secrets.

Why: the agent logs "Got disable req" but not the caller. At each event this snapshots (a) every process started in the last 90 s plus
the parents of anything that talks to the agent, (b) open connections to the agent API port, (c) the Privilege app's own log lines around
the time (the app UI logs what it initiates), (d) the Claude guard hook's log (did a Claude session try?), (e) the frontmost app, (f) the
agent state before and after. Evidence is one JSON object per line in ~/.config/demo-kit/agent-watch/events.jsonl (mode 600).
Usage: python3 -I agent_control_watch.py [--selftest]   (run it in the background: nohup python3 -I agent_control_watch.py &)"""
import json, os, re, subprocess, sys, time, urllib.request

AGENT_LOG = "/Library/Logs/Procyon/procyon-agent.log"
APP_LOG = os.path.expanduser("~/Library/Logs/PingOne Privilege/main.log")
GUARD_LOG = os.path.expanduser("~/.claude/hooks/guard-privilege-agent.log")
OUT_DIR = os.path.expanduser("~/.config/demo-kit/agent-watch"); OUT = os.path.join(OUT_DIR, "events.jsonl")
PAT = re.compile(r"Got (disable|enable) req|Switching tenant|Agent received event '(disable|enable)'|setpreftenant|Got set.?pref", re.I)
SECRET = re.compile(r"eyJ[A-Za-z0-9_.=-]{12,}|((?:secret|token|password|key)[A-Za-z_]*[=: ]+)[^ \"']{8,}", re.I)
mask = lambda s: SECRET.sub(lambda m: (m.group(1) or "") + "<masked>" if m.group(1) else "<JWT>", s)
RELEVANT = re.compile(r"8008|setpreftenant|/disable|/enable|p1-privilege|procyon|PingOne Privilege|Terminal|iTerm|claude|osascript", re.I)


def sh(cmd, timeout=6):
    try: return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except Exception as e: return f"ERR {e}"


def status():
    try: d = json.load(urllib.request.urlopen("http://127.0.0.1:8008/status", timeout=3)); return f"{d.get('AgentState')}/{d.get('ControllerConnectionStatus')}/{d.get('ProxyConnectionStatus')}"
    except Exception as e: return f"unreadable ({type(e).__name__})"


def etime_s(t):
    p = [int(x) for x in re.split(r"[-:]", t)]; d = 0
    if "-" in t: d, p = p[0], p[1:]
    while len(p) < 3: p.insert(0, 0)
    return d * 86400 + p[0] * 3600 + p[1] * 60 + p[2]


def processes():
    rows = []; byid = {}
    for l in sh(["ps", "-axo", "pid=,ppid=,user=,etime=,comm=,command="]).splitlines():
        m = re.match(r"\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)", l)
        if not m: continue
        pid, ppid, user, et, comm, cmd = m.groups(); byid[pid] = (ppid, os.path.basename(comm), cmd)
        try: age = etime_s(et)
        except Exception: continue
        if age <= 90: rows.append((pid, ppid, user, age, os.path.basename(comm), cmd))
    out = []
    for pid, ppid, user, age, comm, cmd in rows:
        chain = []; p = ppid
        for _ in range(4):
            if p in byid: chain.append(f"{p}:{byid[p][1]}"); p = byid[p][0]
            else: break
        keep = mask(cmd[:140]) if RELEVANT.search(cmd) else comm      # full command only when it looks related; else just the name
        out.append({"pid": pid, "age_s": age, "user": user, "what": keep, "parents": chain})
    return out[:40]


def tail_lines(path, n=400, since_s=25):
    try: lines = open(path, errors="replace").read().splitlines()[-n:]
    except Exception as e: return [f"ERR {e}"]
    return [mask(l[:220]) for l in lines if re.search(r"disconnect|disable|enable|connect|tenant|ipc|quit|sign.?out|diagnos|click|menu", l, re.I)][-12:]


def snapshot(trigger, before):
    ev = {"at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "trigger": mask(trigger[:200]), "state_before": before,
          "frontmost": sh(["osascript", "-e", 'tell application "System Events" to get name of first application process whose frontmost is true']).strip()[:60],
          "api_connections": [mask(l[:160]) for l in sh(["lsof", "-nP", "-iTCP@127.0.0.1:8008"]).splitlines()[:12]],
          "recent_processes": processes(), "app_log": tail_lines(APP_LOG), "guard_log": tail_lines(GUARD_LOG, 200)}
    time.sleep(4); ev["state_after_4s"] = status()
    os.makedirs(OUT_DIR, mode=0o700, exist_ok=True)
    fd = os.open(OUT, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600); os.write(fd, (json.dumps(ev) + "\n").encode()); os.close(fd)
    return ev


def selftest():
    assert PAT.search('time="..." level=info msg="Got disable req: {ControllerURL:https://privilege.pingone.com/ Status: }"')
    assert PAT.search("Agent received event 'enable' in state 'disabled'") and not PAT.search("Agent transitioned from 'a' state to 'b' state")
    assert "eyJ" not in mask("curl -H 'Authorization: Bearer eyJabcdefghijklmnopqrstuvwx' x") and "hunter2hunter" not in mask("password=hunter2hunter")
    assert etime_s("01:02") == 62 and etime_s("1-00:00:05") == 86405
    ev = snapshot("SELFTEST Got disable req", status()); print("selftest ok; snapshot keys:", sorted(ev)); print("recent_processes:", len(ev["recent_processes"]), "| app_log lines:", len(ev["app_log"]))


if __name__ == "__main__":
    if "--selftest" in sys.argv: selftest(); sys.exit(0)
    print(f"watching {AGENT_LOG} -> {OUT}", flush=True)
    f = open(AGENT_LOG, errors="replace"); f.seek(0, 2); last = status(); seen_t = 0; bad_since = 0; reported = False
    while True:
        line = f.readline()
        if not line:
            time.sleep(0.4)
            now = status()
            if now.startswith("unreadable"):   # the status call timing out on a loaded Mac is noise: only an outage that lasts counts
                bad_since = bad_since or time.time()
                if time.time() - bad_since > 60 and not reported:
                    ev = snapshot(f"STATE CHANGE without a control line: agent API unreachable for over 60 s ({now})", last); reported = True; print(json.dumps({k: ev[k] for k in ('at', 'trigger', 'frontmost')}), flush=True)
                continue
            bad_since = 0; reported = False
            if now != last and time.time() - seen_t > 8:   # a real state change with no control request line (proxy drop, crash...)
                ev = snapshot(f"STATE CHANGE without a control line: {last} -> {now}", last); print(json.dumps({k: ev[k] for k in ('at', 'trigger', 'frontmost')}), flush=True)
            last = now; continue
        if PAT.search(line) and "Error" not in line[:60]:
            seen_t = time.time(); ev = snapshot(line.strip(), last); print(json.dumps({k: ev[k] for k in ('at', 'trigger', 'frontmost')}), flush=True)
