#!/usr/bin/env python3
"""Generates the synthetic transcript fixtures. Hand-authored stories, never captured sessions.
Shapes mirror real Claude Code 2.1.x rows inspected on 2026-10-24. Re-run: python3 fixtures/gen.py"""
import json, itertools
from datetime import datetime, timedelta, timezone

VER = "2.1.301"
CWD = "/Users/dev/projects/corner-shop"
SID = "11111111-2222-3333-4444-555555555555"
T0 = datetime(2026, 10, 24, 10, 0, 0, tzinfo=timezone.utc)
_n = itertools.count(1)
def ts(sec): return (T0 + timedelta(seconds=sec)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
def uid(): return f"00000000-0000-4000-8000-{next(_n):012d}"
def base(sec, typ, parent=None, sidechain=False, agent=None, **kw):
    r = {"parentUuid": parent, "isSidechain": sidechain, "userType": "external", "cwd": CWD, "sessionId": SID,
         "version": VER, "gitBranch": "main", "type": typ, "uuid": uid(), "timestamp": ts(sec), "entrypoint": "cli"}
    if agent: r["agentId"] = agent
    r.update(kw); return r
def prompt(sec, text, parent=None):
    return base(sec, "user", parent, message={"role": "user", "content": text}, promptId=uid())
def tool_use(sec, tid, name, inp, parent=None, stop="tool_use", sidechain=False, agent=None):
    return base(sec, "assistant", parent, sidechain, agent, message={"model": "claude-x", "id": f"msg_{tid}", "type": "message", "role": "assistant",
        "content": [{"type": "tool_use", "id": tid, "name": name, "input": inp, "caller": {"type": "direct"}}], "stop_reason": stop, "stop_sequence": None})
def tool_result(sec, tid, content, tur, parent=None, is_error=None, sidechain=False, agent=None):
    blk = {"tool_use_id": tid, "type": "tool_result", "content": content}
    if is_error is not None: blk["is_error"] = is_error
    return base(sec, "user", parent, sidechain, agent, message={"role": "user", "content": [blk]}, toolUseResult=tur, sourceToolAssistantUUID=parent, promptId=uid())
def text(sec, t, parent=None, sidechain=False, agent=None):
    return base(sec, "assistant", parent, sidechain, agent, message={"model": "claude-x", "id": f"msg_t{next(_n)}", "type": "message", "role": "assistant",
        "content": [{"type": "text", "text": t}], "stop_reason": "end_turn", "stop_sequence": None})
def noise(sec):  # row types the adapter must ignore
    return [{"type": "queue-operation", "operation": "enqueue", "timestamp": ts(sec), "sessionId": SID},
            {"type": "attachment", "attachment": {"type": "ide_selection"}, "timestamp": ts(sec), "sessionId": SID},
            {"type": "api-request-blob", "hash": "deadbeef", "timestamp": ts(sec), "sessionId": SID},
            {"type": "pr-link", "prNumber": 1, "prUrl": "https://example.invalid/pr/1", "timestamp": ts(sec), "sessionId": SID}]
def patch(old_start, old_lines, new_start, new_lines, plus, minus, ctx=2):
    lines = [" context"] * ctx + ["-removed line"] * minus + ["+added line"] * plus + [" context"] * ctx
    return [{"oldStart": old_start, "oldLines": old_lines, "newStart": new_start, "newLines": new_lines, "lines": lines}]
def bash_result(stdout="", stderr="", interrupted=False):
    return {"stdout": stdout, "stderr": stderr, "interrupted": interrupted, "isImage": False, "noOutputExpected": False}
def write(rows, name):
    with open(name, "w") as f:
        for r in rows: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(name, len(rows), "rows")

VITEST_FAIL = "\n ❯ tests/login.spec.ts (24 tests | 2 failed) 412ms\n\n Test Files  1 failed (1)\n      Tests  2 failed | 22 passed (24)\n   Start at  10:00:14\n   Duration  1.02s\n"
VITEST_PASS = "\n ✓ tests/login.spec.ts (24 tests) 398ms\n\n Test Files  1 passed (1)\n      Tests  24 passed (24)\n   Start at  10:00:23\n   Duration  0.98s\n"

# ---------------- episode-1: the login timeout (mirrors the concept clip) ----------------
rows = []
u0 = prompt(0.0, "fix the login timeout — sessions drop after 15 min"); rows.append(u0)
rows += noise(0.1)
a1 = tool_use(2.6, "toolu_ep1_read1", "Read", {"file_path": f"{CWD}/src/auth/session.ts"}, u0["uuid"]); rows.append(a1)
rows.append(tool_result(5.0, "toolu_ep1_read1", "1\texport const TTL = 15 * 60\n2\t…", {"type": "text", "file": {"filePath": f"{CWD}/src/auth/session.ts", "content": "export const TTL = 15 * 60\n" * 20, "numLines": 20, "startLine": 1, "totalLines": 20}}, a1["uuid"]))
a2 = tool_use(9.0, "toolu_ep1_edit1", "Edit", {"replace_all": False, "file_path": f"{CWD}/src/api/login.ts", "old_string": "const ttl = TTL\nreturn ttl\nx", "new_string": "const ttl = refreshWindow(TTL)\n" * 14}, rows[-1]["uuid"]); rows.append(a2)
rows.append(tool_result(12.0, "toolu_ep1_edit1", "The file has been updated.", {"filePath": f"{CWD}/src/api/login.ts", "oldString": "…", "newString": "…", "originalFile": "…", "structuredPatch": patch(10, 7, 10, 18, 14, 3), "userModified": False, "replaceAll": False}, a2["uuid"]))
a3 = tool_use(14.0, "toolu_ep1_bash1", "Bash", {"command": "npm test", "description": "Run the test suite"}, rows[-1]["uuid"]); rows.append(a3)
rows.append(tool_result(15.0, "toolu_ep1_bash1", "Error: 2 tests failed" + VITEST_FAIL, bash_result(VITEST_FAIL, "Error: Command failed with exit code 1"), a3["uuid"], is_error=True))
a4 = tool_use(18.6, "toolu_ep1_read2", "Read", {"file_path": f"{CWD}/tests/login.spec.ts"}, rows[-1]["uuid"]); rows.append(a4)
rows.append(tool_result(19.3, "toolu_ep1_read2", "1\tit('refreshes token')…", {"type": "text", "file": {"filePath": f"{CWD}/tests/login.spec.ts", "content": "it('refreshes token within window')\n" * 30, "numLines": 30, "startLine": 1, "totalLines": 30}}, a4["uuid"]))
a5 = tool_use(21.6, "toolu_ep1_edit2", "Edit", {"replace_all": False, "file_path": f"{CWD}/src/api/login.ts", "old_string": "refreshWindow(TTL)", "new_string": "refreshWindow(TTL, { grace: 60 })"}, rows[-1]["uuid"]); rows.append(a5)
rows.append(tool_result(22.6, "toolu_ep1_edit2", "The file has been updated.", {"filePath": f"{CWD}/src/api/login.ts", "oldString": "…", "newString": "…", "originalFile": "…", "structuredPatch": patch(12, 4, 12, 4, 1, 1), "userModified": False, "replaceAll": False}, a5["uuid"]))
a6 = tool_use(23.5, "toolu_ep1_bash2", "Bash", {"command": "npm test", "description": "Re-run the test suite"}, rows[-1]["uuid"]); rows.append(a6)
rows.append(tool_result(24.5, "toolu_ep1_bash2", VITEST_PASS, bash_result(VITEST_PASS), a6["uuid"], is_error=False))
rows.append(text(27.0, "Fixed the refresh window in src/api/login.ts. All 24 tests pass.", rows[-1]["uuid"]))
write(rows, "episode-1.jsonl")

# ---------------- bash-heavy: heredocs + sed, no Edit tool at all; claims success with NO test after the last write ----------------
rows = []
u0 = prompt(0.0, "add a health endpoint"); rows.append(u0)
cmd1 = f"mkdir -p {CWD}/src/api && cat > {CWD}/src/api/health.ts <<'EOF'\nexport const health = () => ({{ ok: true }})\nEOF\necho written"
a1 = tool_use(1.0, "toolu_bh_1", "Bash", {"command": cmd1, "description": "Create health route"}, u0["uuid"]); rows.append(a1)
rows.append(tool_result(1.4, "toolu_bh_1", "written", bash_result("written\n"), a1["uuid"], is_error=False))
a2 = tool_use(3.0, "toolu_bh_2", "Bash", {"command": f"cd {CWD} && sed -i '' 's/routes = \\[/routes = [health, /' src/api/index.ts && cat src/api/index.ts | head -5", "description": "Register the route"}, rows[-1]["uuid"]); rows.append(a2)
rows.append(tool_result(3.5, "toolu_bh_2", "import …", bash_result("import { health } from './health'\nexport const routes = [health, login]\n"), a2["uuid"], is_error=False))
a3 = tool_use(5.0, "toolu_bh_3", "Bash", {"command": f"cd {CWD} && pnpm test 2>&1 | tail -20", "description": "Run tests"}, rows[-1]["uuid"]); rows.append(a3)
rows.append(tool_result(7.0, "toolu_bh_3", VITEST_PASS, bash_result(VITEST_PASS), a3["uuid"], is_error=False))
a4 = tool_use(8.0, "toolu_bh_4", "Bash", {"command": f"cat >> {CWD}/src/api/health.ts <<'EOF'\nexport const version = '1.2.3'\nEOF", "description": "Add version"}, rows[-1]["uuid"]); rows.append(a4)
rows.append(tool_result(8.3, "toolu_bh_4", "", bash_result(""), a4["uuid"], is_error=False))
a5 = tool_use(9.0, "toolu_bh_5", "Bash", {"command": f"cd {CWD} && git add -A && git commit -q -m 'health endpoint' && echo committed", "description": "Commit"}, rows[-1]["uuid"]); rows.append(a5)
rows.append(tool_result(9.6, "toolu_bh_5", "committed", bash_result("committed\n"), a5["uuid"], is_error=False))
rows.append(text(10.0, "Health endpoint added and committed. Done.", rows[-1]["uuid"]))
write(rows, "bash-heavy.jsonl")

# ---------------- subagents: one async Agent with sidechain rows, one sync Agent ----------------
rows = []
u0 = prompt(0.0, "audit the auth module"); rows.append(u0)
a1 = tool_use(1.0, "toolu_sa_1", "Agent", {"description": "Audit auth module", "prompt": "Read every file under src/auth and report risks", "run_in_background": True}, u0["uuid"]); rows.append(a1)
rows.append(tool_result(1.2, "toolu_sa_1", [{"type": "text", "text": "Async agent launched successfully."}], {"isAsync": True, "status": "async_launched", "agentId": "agent_aaa111", "description": "Audit auth module", "resolvedModel": "claude-x", "prompt": "Read every file under src/auth and report risks", "outputFile": "/tmp/x", "canReadOutputFile": True}, a1["uuid"]))
s1 = tool_use(2.0, "toolu_sa_side1", "Read", {"file_path": f"{CWD}/src/auth/session.ts"}, rows[-1]["uuid"], sidechain=True, agent="agent_aaa111"); rows.append(s1)
rows.append(tool_result(2.5, "toolu_sa_side1", "1\t…", {"type": "text", "file": {"filePath": f"{CWD}/src/auth/session.ts", "content": "x\n" * 5, "numLines": 5, "startLine": 1, "totalLines": 5}}, s1["uuid"], sidechain=True, agent="agent_aaa111"))
s2 = tool_use(3.0, "toolu_sa_side2", "Grep", {"pattern": "TODO", "path": f"{CWD}/src/auth"}, rows[-1]["uuid"], sidechain=True, agent="agent_aaa111"); rows.append(s2)
rows.append(tool_result(3.3, "toolu_sa_side2", "Found 3 files", {"mode": "files_with_matches", "numFiles": 3, "filenames": ["a", "b", "c"]}, s2["uuid"], sidechain=True, agent="agent_aaa111"))
a2 = tool_use(4.0, "toolu_sa_2", "Agent", {"description": "Check lint config", "prompt": "Is eslint configured?", "subagent_type": "Explore"}, rows[-1]["uuid"]); rows.append(a2)
rows.append(tool_result(6.0, "toolu_sa_2", [{"type": "text", "text": "No eslint config found."}], {"status": "completed", "agentId": "agent_bbb222", "description": "Check lint config", "prompt": "Is eslint configured?", "totalDurationMs": 1900}, a2["uuid"]))
rows.append(text(7.0, "Audit is running in the background; lint check complete — no ESLint config found.", rows[-1]["uuid"]))
write(rows, "subagents.jsonl")

# ---------------- secrets: planted markers that must never reach the event stream ----------------
M = dict(prompt="MARKER_PROMPT_7f3a", content="MARKER_CONTENT_9c1e", cmd="MARKER_CMD_2b8d", stdout="MARKER_STDOUT_4e5f", query="MARKER_QUERY_1a2b", old="MARKER_OLD_6d7e", new="MARKER_NEW_0f1a", agentprompt="MARKER_AGENTPROMPT_3c4d", text="MARKER_ASSISTANT_5e6f", filecontent="MARKER_FILECONTENT_7a8b")
rows = []
u0 = prompt(0.0, f"please {M['prompt']} now"); rows.append(u0)
a1 = tool_use(1.0, "toolu_sec_1", "Write", {"file_path": f"{CWD}/src/notes.ts", "content": f"export const x = '{M['content']}'\n"}, u0["uuid"]); rows.append(a1)
rows.append(tool_result(1.2, "toolu_sec_1", "File created successfully", {"type": "create", "filePath": f"{CWD}/src/notes.ts", "content": f"export const x = '{M['content']}'\n", "structuredPatch": [], "originalFile": None, "userModified": False}, a1["uuid"]))
a2 = tool_use(2.0, "toolu_sec_2", "Bash", {"command": f"echo {M['cmd']} > {CWD}/out.txt && cat {CWD}/out.txt", "description": "write marker"}, rows[-1]["uuid"]); rows.append(a2)
rows.append(tool_result(2.3, "toolu_sec_2", M["stdout"], bash_result(M["stdout"] + "\n"), a2["uuid"], is_error=False))
a3 = tool_use(3.0, "toolu_sec_3", "Grep", {"pattern": M["query"], "path": CWD}, rows[-1]["uuid"]); rows.append(a3)
rows.append(tool_result(3.2, "toolu_sec_3", "No matches", {"mode": "content", "numLines": 0, "content": ""}, a3["uuid"]))
a4 = tool_use(4.0, "toolu_sec_4", "Edit", {"replace_all": False, "file_path": f"{CWD}/src/notes.ts", "old_string": M["old"], "new_string": M["new"]}, rows[-1]["uuid"]); rows.append(a4)
rows.append(tool_result(4.2, "toolu_sec_4", "updated", {"filePath": f"{CWD}/src/notes.ts", "oldString": M["old"], "newString": M["new"], "originalFile": M["filecontent"], "structuredPatch": patch(1, 1, 1, 1, 1, 1), "userModified": False, "replaceAll": False}, a4["uuid"]))
a5 = tool_use(5.0, "toolu_sec_5", "Read", {"file_path": f"{CWD}/src/notes.ts"}, rows[-1]["uuid"]); rows.append(a5)
rows.append(tool_result(5.2, "toolu_sec_5", f"1\t{M['filecontent']}", {"type": "text", "file": {"filePath": f"{CWD}/src/notes.ts", "content": M["filecontent"], "numLines": 1, "startLine": 1, "totalLines": 1}}, a5["uuid"]))
a6 = tool_use(6.0, "toolu_sec_6", "Agent", {"description": "helper", "prompt": M["agentprompt"]}, rows[-1]["uuid"]); rows.append(a6)
rows.append(tool_result(6.5, "toolu_sec_6", [{"type": "text", "text": "ok"}], {"status": "completed", "agentId": "agent_sec", "prompt": M["agentprompt"]}, a6["uuid"]))
rows.append(text(7.0, f"{M['text']} — done.", rows[-1]["uuid"]))
write(rows, "secrets.jsonl")
json.dump(M, open("secrets.markers.json", "w"), indent=2)

# ---------------- hook payloads (per code.claude.com/docs/en/hooks) ----------------
import os; os.makedirs("hooks", exist_ok=True)
common = {"session_id": SID, "transcript_path": f"/Users/dev/.claude/projects/-Users-dev-projects-corner-shop/{SID}.jsonl", "cwd": CWD, "permission_mode": "default"}
H = {
 "session-start": {**common, "hook_event_name": "SessionStart", "source": "startup"},
 "post-tool-use-edit": {**common, "hook_event_name": "PostToolUse", "tool_name": "Edit", "tool_use_id": "toolu_hk_1", "duration_ms": 412,
    "tool_input": {"file_path": f"{CWD}/src/api/login.ts", "old_string": "a", "new_string": "b\nc", "replace_all": False},
    "tool_response": {"filePath": f"{CWD}/src/api/login.ts", "oldString": "a", "newString": "b\nc", "originalFile": "…", "structuredPatch": patch(1, 1, 1, 2, 2, 1), "userModified": False, "replaceAll": False}},
 "post-tool-use-bash-test": {**common, "hook_event_name": "PostToolUse", "tool_name": "Bash", "tool_use_id": "toolu_hk_2", "duration_ms": 1020,
    "tool_input": {"command": "npx vitest run", "description": "run tests"}, "tool_response": bash_result(VITEST_FAIL, "")},
 "post-tool-use-bash-heredoc": {**common, "hook_event_name": "PostToolUse", "tool_name": "Bash", "tool_use_id": "toolu_hk_3", "duration_ms": 80,
    "tool_input": {"command": f"cat > {CWD}/src/new.ts <<'EOF'\nexport {{}}\nEOF", "description": "new file"}, "tool_response": bash_result("")},
 "post-tool-use-subagent-tool": {**common, "hook_event_name": "PostToolUse", "tool_name": "Read", "tool_use_id": "toolu_hk_4", "agent_id": "agent_aaa111", "agent_type": "Explore",
    "tool_input": {"file_path": f"{CWD}/README.md"}, "tool_response": {"type": "text", "file": {"filePath": f"{CWD}/README.md", "content": "# corner-shop\n", "numLines": 1, "startLine": 1, "totalLines": 1}}},
 "post-tool-use-failure": {**common, "hook_event_name": "PostToolUseFailure", "tool_name": "Bash", "tool_use_id": "toolu_hk_5", "error": "Command timed out"},
 "subagent-start": {**common, "hook_event_name": "SubagentStart", "agent_id": "agent_aaa111", "agent_type": "Explore"},
 "subagent-stop": {**common, "hook_event_name": "SubagentStop", "agent_id": "agent_aaa111", "agent_type": "Explore", "stop_hook_active": False, "agent_transcript_path": "/tmp/x.jsonl", "last_assistant_message": "found 3 todos"},
 "notification-permission": {**common, "hook_event_name": "Notification", "notification_type": "permission_prompt", "message": "Claude needs your permission to use Bash"},
 "stop-claims-success": {**common, "hook_event_name": "Stop", "stop_hook_active": False, "last_assistant_message": "Refactored the handler. All tests pass ✅"},
 "stop-hedged": {**common, "hook_event_name": "Stop", "stop_hook_active": False, "last_assistant_message": "I've made the change but haven't run the tests yet."},
 "session-end": {**common, "hook_event_name": "SessionEnd", "reason": "prompt_input_exit"},
 "unknown-event": {**common, "hook_event_name": "SomethingNew"},
}
for k, v in H.items(): json.dump(v, open(f"hooks/{k}.json", "w"), indent=2)
print("hooks:", len(H))
