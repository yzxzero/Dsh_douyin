from pathlib import Path
import shutil
r=Path('D:/dafeiyu/Dsh_douyin');b=r/'data/backups/wesnoth-migration-20261113'
for f in ['tests/live-control.test.mjs','tests/viewer-memory.test.mjs']:
 p=r/f;dest=b/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
 s=p.read_text(encoding='utf-8-sig').replace('openttd','wesnoth').replace('OpenTTD','Wesnoth').replace('OPENTTD','WESNOTH');p.write_text(s,encoding='utf-8')
s=(r/'tests/openttd-director.test.mjs').read_text(encoding='utf-8-sig').replace('openttd','wesnoth').replace('OpenTTD','Wesnoth').replace('暂停经营','暂停战斗').replace('继续经营','继续战斗')
s=s.replace("ready:true,activity:'经营公交',vehicles:3,stations:2,money:82000","ready:true,activity:'按默认策略作战',turn:4,units:3,enemies:2,gold:82").replace('/3辆公交.*2座车站.*82000英镑/','/第4回合.*3名单位.*2名.*82金币/')
s=s.replace('ready:true,vehicles:12,stations:8,money:28000','ready:true,turn:7,units:12,enemies:8,gold:28').replace('/12辆公交.*8座车站.*28000英镑/','/第7回合.*12名单位.*8名.*28/')
s=s.replace('ready:true,vehicles:3,stations:2,money:100','ready:true,turn:3,units:3,enemies:2,gold:100').replace('/3辆公交/','/3名单位/').replace('/没有收到完整经营数据/','/没有收到完整战况/')
(r/'tests/wesnoth-director.test.mjs').write_text(s,encoding='utf-8')
p=r/'README.md';s=p.read_text(encoding='utf-8-sig');start=s.index('已换用 OpenTTD');end=s.index('\n',start)
s=s[:start]+'当前试玩韦诺之战 1.18.8：双击「启动韦诺之战直播.cmd」。内置 AI 控制精灵军对战兽人，直播同步原生画面与真实回合、单位和金币。观众可发“暂停战斗 / 继续战斗 / 优先进攻 / 稳住防守 / 优先占村”。当前每次启动新的本地遭遇战，尚未接入逐单位走位或剧情分支。人物沿用游戏时的上移位置及 1.65 倍大小。OpenTTD 程序及运输公司存档保留在独立目录。详见 integrations/wesnoth/README.md。'+s[end:]
p.write_text(s,encoding='utf-8')
