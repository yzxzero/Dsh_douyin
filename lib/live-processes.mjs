import path from 'node:path';

// Windows command lines allow quoted values after '=' as well as fully quoted arguments.
export function windowsArguments(commandLine='') {
  const args=[];let word='',quoted=false,started=false;
  for(const ch of String(commandLine??'')){
    if(ch==='"'){quoted=!quoted;started=true;}
    else if(/\s/.test(ch)&&!quoted){if(started){args.push(word);word='';started=false;}}
    else{word+=ch;started=true;}
  }
  if(started)args.push(word);
  return args;
}
const normalized=value=>path.win32.normalize(String(value)).replace(/[\\/]+$/,'').toLowerCase();
// Windows 路径大小写不敏感：d:\x 与 D:\X 是同一个目录。
export const samePath=(a,b)=>Boolean(a)&&Boolean(b)&&normalized(a)===normalized(b);
export function projectProcessKind(proc,{root,runtime,jar,control}) {
  const args=windowsArguments(proc.commandLine),name=String(proc.name).toLowerCase();
  if(name==='chrome.exe') {
    for(let i=0;i<args.length;i++){
      const value=args[i].startsWith('--user-data-dir=')?args[i].slice(16):args[i]==='--user-data-dir'?args[i+1]:null;
      if(value && ['chrome-live','chrome-admin'].some(profile=>normalized(value)===normalized(path.win32.join(root,'data',profile))))return 'window';
    }
  }
  if(name==='luanti.exe' && normalized(args[0])===normalized(path.win32.join(runtime,'bin/luanti.exe')))return 'game';
  if(name==='python.exe' && args.some(a=>normalized(a)===normalized(path.win32.join(root,'tools/luanti-window-capture.py'))))return 'game';
  if(name==='node.exe' && control?.app==='dafeiyu-live' && normalized(control.root)===normalized(root) &&
      Number(proc.pid)===Number(control.pid) && Math.abs(Date.parse(proc.startedAt)-control.processStartedAt)<3000 &&
      args.slice(1).some(a=>a==='server.mjs'||normalized(a)===normalized(path.win32.join(root,'server.mjs'))))return 'server';
  return null;
}
