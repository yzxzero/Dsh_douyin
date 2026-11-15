from pathlib import Path
import shutil,json
r=Path('D:/dafeiyu/Dsh_douyin');b=r/'data/backups/wesnoth-migration-20261113';b.mkdir(parents=True,exist_ok=True)
files=['server.mjs','lib/config.mjs','lib/openttd-director.mjs','public/app.js','public/admin.js','public/admin.html','public/app.css','public/index.html','public/openttd-view.js','tools/start-openttd.mjs','tools/stop-live.mjs','lib/live-processes.mjs','config.example.json','config.json','README.md']
for f in files:
 p=r/f
 if not p.exists():continue
 dest=b/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
 if f in ['config.json','README.md']:continue
 s=p.read_text(encoding='utf-8-sig').replace('OPENTTD','WESNOTH').replace('OpenTTD','Wesnoth').replace('openttd','wesnoth')
 new=r/f.replace('openttd','wesnoth');new.write_text(s,encoding='utf-8')
cfg=json.loads((r/'config.json').read_text(encoding='utf-8-sig'))
cfg['wesnoth']=cfg.get('openttd',{}).copy();cfg['broadcast']['forced']='chat'
(r/'config.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2),encoding='utf-8')
p=r/'public/admin.html';s=p.read_text(encoding='utf-8').replace('Wesnoth 游戏直播','韦诺之战 · 游戏直播').replace('暂停经营 / 继续经营','暂停战斗 / 继续战斗 / 优先进攻 / 稳住防守 / 优先占村').replace('运行本机 Wesnoth，固定策略自动修建公交站、购车并安排客运；当前从城市公交起步，铁路、飞机和港口可在原生游戏里手动经营','运行本机韦诺之战，内置 AI 控制精灵军对战兽人。观众可调整进攻、防守与占村策略；当前为本地遭遇战，逐单位走位和战役剧情分支尚未接入').replace('关闭会保存并退出当前游戏','关闭会退出当前对局').replace('正在保存并退出游戏','正在退出游戏')
p.write_text(s,encoding='utf-8')
p=r/'public/index.html';s=p.read_text(encoding='utf-8').replace('wesnoth-pet-size-2','wesnoth-live-1').replace('大肥鱼 · Wesnoth','大肥鱼 · 韦诺之战').replace('Wesnoth 游戏实况','韦诺之战游戏实况').replace('Wesnoth 实时游戏画面','韦诺之战实时游戏画面');p.write_text(s,encoding='utf-8')
p=r/'public/wesnoth-view.js';s=p.read_text(encoding='utf-8').replace("s.activity || '准备经营'","s.activity || '准备战斗'").replace("' · 公交 '+s.vehicles+' · 车站 '+s.stations+' · £'+s.money","' · 回合 '+s.turn+' · 我军 '+s.units+' · 敌军 '+s.enemies+' · 金币 '+s.gold").replace('请在操作台启动 Wesnoth','请在操作台启动韦诺之战');p.write_text(s,encoding='utf-8')
p=r/'lib/wesnoth-director.mjs';s=p.read_text(encoding='utf-8');tail=s[s.index('/** Hooks'):]
prefix='''export function gameIdleSeconds(cfg, mode) {
 return Number(mode === 'wesnoth' ? cfg.wesnoth?.idleTalkSec ?? 60 : cfg.guide?.idleEverySec ?? 30);
}
export function gameProgress(s) {
 if(!s.online || !s.playing || s.gameOver)return '';
 if(s.paused)return '本鲸先暂停战斗，和大家看看这回合的局面。';
 if(!s.ready)return '本鲸正在准备精灵军，等真实战况回来再汇报。';
 return `现在第${s.turn}回合，精灵军还有${s.units}名单位，兽人军${s.enemies}名，我军有${s.gold}金币。本鲸正在${s.activity}。`;
}
export function parseGameSuggestion(raw) {
 const t=String(raw||'').replace(/[，,。！!？?\\s]/g,'').slice(0,100);
 if(/为什么|怎么|如何|不要|别|上次|刚才/.test(t))return null;
 if(/^(?:大肥鱼)?暂停(?:游戏|战斗|自动操作)?(?:吧)?$/.test(t))return {strategy:'pause',label:'暂停战斗，一起看局面'};
 if(/^(?:大肥鱼)?(?:继续|恢复)(?:游戏|战斗|自动玩|自动操作)?(?:吧)?$/.test(t))return {strategy:'auto',label:'继续自动作战'};
 if(/^(?:大肥鱼)?(?:优先|先|全力)?进攻(?:吧)?$/.test(t))return {strategy:'attack',label:'提高进攻倾向'};
 if(/^(?:大肥鱼)?(?:稳住|优先|先)?防守(?:吧)?$/.test(t))return {strategy:'defend',label:'采取保守防守策略'};
 if(/^(?:大肥鱼)?(?:优先|先)?占(?:领)?村(?:庄)?(?:吧)?$/.test(t))return {strategy:'villages',label:'提高占领村庄的优先级'};
 return null;
}
export function roundSummary(s,reason='ended') {
 const intro=reason==='disconnected'?'游戏连接中断，本鲸按最后收到的数据汇报。':reason==='manual'?'这局先玩到这里。':s.outcome==='win'?'精灵军赢下这一战！':s.outcome==='loss'?'精灵军这一战落败了。':'这场遭遇战结束了。';
 const details=s.ready?`打到第${s.turn}回合，我军剩${s.units}名单位，敌军${s.enemies}名，金币${s.gold}。`:'这次还没有收到完整战况。';
 return intro+details+'本鲸回来陪大家聊聊这局的选择。';
}

'''
tail=tail.replace('本鲸开一局 Wesnoth，从公交运输开始。你们可以发“暂停经营”或“继续经营”，一起讨论线路。','本鲸开一局韦诺之战，精灵军对战兽人。大家可以建议优先进攻、稳住防守、优先占村，也可以暂停战斗。').replace('运输公司还在准备中','战场还在准备中').replace("if (!s.online) return await this.finish(session.stats, 'disconnected');","if (s.gameOver) return await this.finish(s, 'ended');\n        if (!s.online) return await this.finish(session.stats, 'disconnected');").replace('session.stats=s?.online ? s : session.stats','session.stats=s?.ready ? s : session.stats')
p.write_text(prefix+tail,encoding='utf-8')
p=r/'tools/wesnoth-capture.py';s=(r/'tools/openttd-capture.py').read_text(encoding='utf-8').replace('OpenTTD','Wesnoth').replace('8867','8868');p.write_text(s,encoding='utf-8')
p=r/'lib/live-processes.mjs';s=p.read_text(encoding='utf-8').replace("path.win32.join(runtime,'wesnoth.exe')","path.win32.join(runtime,'wesnoth.exe')");p.write_text(s,encoding='utf-8')
