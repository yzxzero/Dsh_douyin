from pathlib import Path
import shutil,re
r=Path('D:/dafeiyu/Dsh_douyin');b=r/'data/backups/openttd-migration-20261113'
p=r/'tools/stop-live.mjs';shutil.copy2(p,b/'stop-live.mjs')
s=p.read_text(encoding='utf-8').replace('MINDUSTRY_HOME','OPENTTD_HOME').replace('mindustry','openttd').replace("'java.exe','javaw.exe'","'openttd.exe','python.exe'").replace("runtime:OPENTTD_HOME,","runtime:OPENTTD_HOME,")
p.write_text(s,encoding='utf-8')
p=r/'lib/live-processes.mjs';shutil.copy2(p,b/'live-processes.mjs')
s=p.read_text(encoding='utf-8');start=s.index("  if(['java.exe'");end=s.index("  if(name==='node.exe'",start)
s=s[:start]+'''  if(name==='openttd.exe' && normalized(args[0])===normalized(path.win32.join(runtime,'openttd.exe')))return 'game';
  if(name==='python.exe' && args.some(a=>normalized(a)===normalized(path.win32.join(root,'tools/openttd-capture.py'))))return 'game';
'''+s[end:];p.write_text(s,encoding='utf-8')
p=r/'README.md';s=p.read_text(encoding='utf-8');s=re.sub(r'已接入 Mindustry：[^\n]*','已换用 OpenTTD 官方便携版：双击「启动OpenTTD直播.cmd」。大肥鱼从城市公交起步，自动建站、购车和安排客运，直播显示原生游戏实况及真实车辆、车站、现金。观众可发“暂停经营 / 继续经营”；铁路、飞机、港口目前需手动操作。结束会保存，下一次继续该运输公司。使用说明见 integrations/openttd/README.md。',s)
s=s.replace('Mindustry','OpenTTD');p.write_text(s,encoding='utf-8')
for p in [r/'tests/viewer-memory.test.mjs',r/'tests/live-control.test.mjs']:
 shutil.copy2(p,b/p.name);s=p.read_text(encoding='utf-8').replace('mindustry','openttd').replace('Mindustry','OpenTTD').replace('MINDUSTRY','OPENTTD');p.write_text(s,encoding='utf-8')
p=r/'tests/mindustry-director.test.mjs';shutil.copy2(p,b/p.name)
s=p.read_text(encoding='utf-8').replace('Mindustry','OpenTTD').replace('mindustry','openttd')
# Keep lifecycle tests; replace assertions tied to the removed combat game.
start=s.index("test('游戏中播报") if "test('游戏中播报" in s else -1
(r/'tests/openttd-director.test.mjs').write_text(s,encoding='utf-8')
p.unlink()
for f in ['lib/mindustry.mjs','tools/build-mindustry-bridge.mjs']:
 p=r/f
 if p.exists():shutil.copy2(p,b/p.name);p.unlink()
target=r/'integrations/mindustry'
if target.exists():
 shutil.copytree(target,b/'legacy-integration',dirs_exist_ok=True)
 shutil.rmtree(target)
