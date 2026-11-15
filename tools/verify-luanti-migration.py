from pathlib import Path
import shutil
r=Path('D:/dafeiyu/Dsh_douyin');b=r/'data/backups/luanti-migration-20261113'
for f in ['tests/live-control.test.mjs','tests/viewer-memory.test.mjs']:
 p=r/f;dest=b/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
 s=p.read_text(encoding='utf-8-sig').replace('wesnoth','luanti').replace('Wesnoth','Luanti').replace('WESNOTH','LUANTI')
 if f.endswith('live-control.test.mjs'):
  s=s.replace('\\\\luanti.exe','\\\\bin\\\\luanti.exe')
 p.write_text(s,encoding='utf-8')
s=(r/'tests/wesnoth-director.test.mjs').read_text(encoding='utf-8-sig').replace('wesnoth','luanti').replace('Wesnoth','Luanti').replace('暂停战斗','暂停建造').replace('继续战斗','继续建造')
s=s.replace("ready:true,activity:'按默认策略作战',turn:4,units:3,enemies:2,gold:82","ready:true,activity:'搭建宫殿',phase:'building',placed:82,completed:2").replace('/第4回合.*3名单位.*2名.*82金币/','/82块方块.*2座建筑/')
s=s.replace('ready:true,turn:7,units:12,enemies:8,gold:28','ready:true,placed:28,completed:3').replace('/第7回合.*12名单位.*8名.*28/','/3座建筑.*28块方块/')
s=s.replace('ready:true,turn:3,units:3,enemies:2,gold:100','ready:true,completed:3,placed:100').replace('/3名单位/','/3座建筑/').replace('/没有收到完整战况/','/没有收到完整建造数据/')
(r/'tests/luanti-director.test.mjs').write_text(s,encoding='utf-8')
p=r/'README.md';s=p.read_text(encoding='utf-8-sig');start=s.index('当前试玩韦诺之战');end=s.index('\n',start)
s=s[:start]+'当前试玩 Minetest / Luanti「肥鱼海底建造计划」：双击「启动Minetest海底直播.cmd」。官方 Luanti 5.18.0 便携版配套 Minetest Game；创造模式下每轮投票 30 秒，按固定蓝图逐块搭建宫殿、鱼塘或花园。弹幕支持“投票 宫殿 / 投票 鱼塘 / 投票 花园 / 暂停建造 / 继续建造”。世界持久保存，三张蓝图全部建好后进入展示模式，不重复虚增计数。人物保留上移位置及 1.65 倍显示大小。详见 integrations/luanti/README.md。'+s[end:]
p.write_text(s,encoding='utf-8')
