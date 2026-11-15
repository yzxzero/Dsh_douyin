from pathlib import Path
import json,shutil
r=Path('D:/dafeiyu/Dsh_douyin');b=r/'data/backups/luanti-migration-20261113';b.mkdir(parents=True,exist_ok=True)
files=['server.mjs','lib/config.mjs','lib/wesnoth-director.mjs','public/app.js','public/admin.js','public/admin.html','public/app.css','public/index.html','public/wesnoth-view.js','tools/start-wesnoth.mjs','tools/stop-live.mjs','lib/live-processes.mjs','config.example.json','config.json','README.md']
for f in files:
 p=r/f;dest=b/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
 if f in ['config.json','README.md']:continue
 s=p.read_text(encoding='utf-8-sig').replace('WESNOTH','LUANTI').replace('Wesnoth','Luanti').replace('wesnoth','luanti')
 new=r/f.replace('wesnoth','luanti');new.write_text(s,encoding='utf-8')
cfg=json.loads((r/'config.json').read_text(encoding='utf-8-sig'));cfg['luanti']=cfg.get('wesnoth',{}).copy();cfg['broadcast']['forced']='chat'
(r/'config.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2),encoding='utf-8')
p=r/'public/index.html';s=p.read_text(encoding='utf-8').replace('luanti-live-1','luanti-ocean-1').replace('韦诺之战','肥鱼海底建造计划');p.write_text(s,encoding='utf-8')
p=r/'public/admin.html';s=p.read_text(encoding='utf-8').replace('韦诺之战 · 游戏直播','Minetest / Luanti · 海底建造直播').replace('暂停战斗 / 继续战斗 / 优先进攻 / 稳住防守 / 优先占村','投票 宫殿 / 投票 鱼塘 / 投票 花园 / 暂停建造 / 继续建造').replace('运行本机韦诺之战，内置 AI 控制精灵军对战兽人。观众可调整进攻、防守与占村策略；当前为本地遭遇战，逐单位走位和战役剧情分支尚未接入','运行官方 Luanti 和 Minetest Game，创造模式海底建造。每轮投票 30 秒，同一显示名可修改一票；最高票决定固定蓝图，无票时轮换默认蓝图。建成后保存世界并开启下一轮；不是生存采集或语言模型自由设计建筑');p.write_text(s,encoding='utf-8')
p=r/'public/luanti-view.js';s=p.read_text(encoding='utf-8').replace('准备战斗','准备世界').replace("' · 回合 '+s.turn+' · 我军 '+s.units+' · 敌军 '+s.enemies+' · 金币 '+s.gold","' · 放置 '+s.placed+' 块 · 建成 '+s.completed+' 座'+(s.phase==='voting'?' · 宫殿 '+s.votes.palace+' / 鱼塘 '+s.votes.pond+' / 花园 '+s.votes.garden+' · '+s.voteRemainingSec+'秒':'')").replace('请在操作台启动韦诺之战','请在操作台启动海底建造');p.write_text(s,encoding='utf-8')
p=r/'lib/live-processes.mjs';s=p.read_text(encoding='utf-8').replace("path.win32.join(runtime,'luanti.exe')","path.win32.join(runtime,'bin/luanti.exe')");p.write_text(s,encoding='utf-8')
p=r/'tools/luanti-capture.py';s=(r/'tools/wesnoth-capture.py').read_text(encoding='utf-8').replace('Wesnoth','Luanti').replace('8868','8869');p.write_text(s,encoding='utf-8')
p=r/'lib/luanti-director.mjs';s=p.read_text(encoding='utf-8');tail=s[s.index('/** Hooks'):]
prefix='''export function gameIdleSeconds(cfg,mode){return Number(mode==='luanti'?cfg.luanti?.idleTalkSec??60:cfg.guide?.idleEverySec??30);}
export function gameProgress(s){
 if(!s.online||!s.playing||s.gameOver)return '';
 if(s.paused)return '本鲸先暂停建造，和大家聊聊海底世界。';
 if(!s.ready)return '海底世界正在加载，本鲸等真实建造数据回来再汇报。';
 if(s.phase==='voting')return `这轮还有${s.voteRemainingSec}秒，宫殿${s.votes.palace}票、鱼塘${s.votes.pond}票、花园${s.votes.garden}票。发“投票 宫殿”“投票 鱼塘”或“投票 花园”一起选。`;
 return `本鲸正在${s.activity}，本次已放置${s.placed}块方块，累计建成${s.completed}座建筑。这里是创造模式，按固定蓝图自动搭建。`;
}
export function parseGameSuggestion(raw){
 const t=String(raw||'').replace(/[，,。！!？?\\s]/g,'').slice(0,100);
 if(/为什么|怎么|如何|不要|别|上次|刚才/.test(t))return null;
 const vote=t.match(/^(?:大肥鱼)?投票(?:建|造)?(宫殿|鱼塘|花园|海底花园)$/);
 if(vote)return {strategy:vote[1]==='宫殿'?'palace':vote[1]==='鱼塘'?'pond':'garden',vote:true,label:'登记建造投票'};
 if(/^(?:大肥鱼)?暂停(?:游戏|建造|自动操作)?(?:吧)?$/.test(t))return {strategy:'pause',label:'暂停建造'};
 if(/^(?:大肥鱼)?(?:继续|恢复)(?:游戏|建造|自动玩|自动操作)?(?:吧)?$/.test(t))return {strategy:'auto',label:'继续建造'};
 return null;
}
export function roundSummary(s,reason='ended'){
 const intro=reason==='disconnected'?'游戏连接中断，本鲸按最后收到的数据汇报。':'这次海底建造先到这里。';
 return intro+(s.ready?`世界累计建成${s.completed}座建筑，本次放置${s.placed}块方块。`:'这次还没有收到完整建造数据。')+'本鲸回房间陪大家聊天。';
}

'''
tail=tail.replace('本鲸开一局韦诺之战，精灵军对战兽人。大家可以建议优先进攻、稳住防守、优先占村，也可以暂停战斗。','本鲸开启肥鱼海底建造计划！创造模式下，大家投票选宫殿、鱼塘或者花园，本鲸按蓝图逐块搭建。').replace('战场还在准备中','世界还在准备中')
tail=tail.replace('if(this.suggesting || this.lastSuggestionAt &&','if(!idea.vote && (this.suggesting || this.lastSuggestionAt &&').replace("Number(this.h.config().suggestionGapSec ?? 10)*1000)\n", "Number(this.h.config().suggestionGapSec ?? 10)*1000))\n")
tail=tail.replace("await this.h.command({action:'strategy',strategy:idea.strategy});","await this.h.command({action:'strategy',strategy:idea.strategy,voter:String(username)});")
tail=tail.replace('return {text:`听${String(username).slice(0,18)}的，接下来${idea.label}。`,applied:true};','return {text:idea.vote?`已登记${String(username).slice(0,18)}的投票，等本轮结束按最高票开建。`:`听${String(username).slice(0,18)}的，接下来${idea.label}。`,applied:true};')
p.write_text(prefix+tail,encoding='utf-8')
