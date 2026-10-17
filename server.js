const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json", ".png":"image/png", ".jpg":"image/jpeg", ".glb":"model/gltf-binary", ".gltf":"model/gltf+json", ".bin":"application/octet-stream", ".svg":"image/svg+xml", ".ico":"image/x-icon" };
const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent((req.url || "/").split("?")[0]);
  if (pathname === "/") pathname = "/index.html";
  const safe = path.normalize(path.join(ROOT, pathname));
  if (!safe.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(safe, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(safe)] || "application/octet-stream", "Cache-Control":"no-cache" });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });
const rooms = new Map();
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(Number(v)) ? Number(v) : 0));
const mapObstacles=[[-22,-17,13,5],[-11,-14,12,5],[-21,-5,12,5],[-7,-23,11,5],[9,-18,11,5],[23,-22,11,5],[20,-12,11,5],[8,1,11,5],[-17,9,11,5],[20,16,13,5],[-7,21,11,5],[9,23,10,5]];
function canOccupy(x,z,r=.48){if(Math.abs(x)>29.2||Math.abs(z)>29.2)return false;for(const [cx,cz,w,d] of mapObstacles){if(x>cx-w/2-r&&x<cx+w/2+r&&z>cz-d/2-r&&z<cz+d/2+r)return false;}return true;}
function isBlockedShot(sx,sz,ex,ez){const dx=ex-sx,dz=ez-sz;for(const [cx,cz,w,d] of mapObstacles){const minX=cx-w/2-.12,maxX=cx+w/2+.12,minZ=cz-d/2-.12,maxZ=cz+d/2+.12;let tMin=0,tMax=1;for(const [origin,delta,min,max] of [[sx,dx,minX,maxX],[sz,dz,minZ,maxZ]]){if(Math.abs(delta)<1e-8){if(origin<min||origin>max){tMin=2;break;}}else{let a=(min-origin)/delta,b=(max-origin)/delta;if(a>b)[a,b]=[b,a];tMin=Math.max(tMin,a);tMax=Math.min(tMax,b);if(tMin>tMax)break;}}if(tMin<=tMax&&tMax>=0&&tMin<=1)return true;}return false;}
function cleanName(v) { return String(v || "Player").replace(/[<>]/g, "").trim().slice(0, 18) || "Player"; }
function roomCode() { return crypto.randomBytes(3).toString("hex").toUpperCase(); }
function send(ws, obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function players(room, includeAvatar=true) { return [...room.players.values()].map(p => ({ id:p.id, name:p.name, team:p.team, x:p.x, y:p.y, z:p.z, yaw:p.yaw, pitch:p.pitch, hp:p.hp, score:p.score, ...(includeAvatar?{avatar:p.avatar}:{}), bot:!!p.bot })); }
function broadcast(room, obj) { const packet = JSON.stringify(obj); for (const p of room.players.values()) if (!p.bot && p.ws?.readyState === WebSocket.OPEN) p.ws.send(packet); }
function publicRoom(room) { return { type:"state", room:room.code, players:players(room,false), started:room.started }; }
function chooseTeam(room) {
  const t = { T:0, CT:0 }; for (const p of room.players.values()) if (!p.bot) t[p.team] = (t[p.team] || 0) + 1;
  return t.T <= t.CT ? "T" : "CT";
}
function spawn(p) { p.x = p.team === "T" ? -3 : 3; p.y = 1.6; p.z = p.team === "T" ? -3 : 3; p.hp=100; p.pitch=0; }
function join(ws, msg) {
  let code = String(msg.room || "").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
  if (!code) { code = roomCode(); while (rooms.has(code)) code = roomCode(); }
  let room = rooms.get(code);
  if (!room) { room = { code, players:new Map(), started:true, created:Date.now() }; rooms.set(code, room); }
  if ([...room.players.values()].filter(p=>!p.bot).length >= 16) return send(ws,{type:"error",message:"Комната заполнена (максимум 16 игроков)."});
  const id = crypto.randomUUID();
  const p = { id, ws, name:cleanName(msg.name), team:msg.team==="T"||msg.team==="CT"?msg.team:chooseTeam(room), x:0,y:1.6,z:0,yaw:0,pitch:0,hp:100,score:0,avatar:typeof msg.avatar==="string"&&msg.avatar.length<180000&&/^data:image\/(jpeg|png|webp);base64,/.test(msg.avatar)?msg.avatar:"",lastDash:0,lastShot:0,bot:false };
  spawn(p); room.players.set(id,p); ws.playerId=id; ws.roomCode=code;
  send(ws,{type:"joined",id,room:code,players:players(room)});
  broadcast(room, publicRoom(room));
}
function remove(ws) {
  const room=rooms.get(ws.roomCode); if (!room) return;
  room.players.delete(ws.playerId);
  if (![...room.players.values()].some(p=>!p.bot)) rooms.delete(room.code);
  else broadcast(room, publicRoom(room));
}
function tickBots(room) {
  const now=Date.now();
  for (const b of room.players.values()) {
    if (!b.bot) continue;
    const target=[...room.players.values()].filter(p=>!p.bot&&p.team!==b.team).sort((a,c)=>Math.hypot(a.x-b.x,a.z-b.z)-Math.hypot(a.x-c.x,a.z-c.z))[0];
    if (target) {
      const dx=target.x-b.x, dz=target.z-b.z, d=Math.hypot(dx,dz)||1;
      if (d>7) { const nx=b.x+dx/d*0.055,nz=b.z+dz/d*0.055;if(canOccupy(nx,b.z))b.x=nx;if(canOccupy(b.x,nz))b.z=nz; }
      b.yaw=Math.atan2(-dx,-dz);
      if (d<18 && now-b.lastShot>650) { b.lastShot=now; target.hp-=12; if(target.hp<=0){target.score++;spawn(target);broadcast(room,{type:"feed",text:`${b.name} выбил ${target.name}`});} }
    }
  }
}
wss.on("connection", ws => {
  ws.on("message", raw => {
    let m; try { m=JSON.parse(raw.toString()); } catch { return; }
    if (m.type==="join") return join(ws,m);
    const room=rooms.get(ws.roomCode), p=room?.players.get(ws.playerId); if(!room||!p) return;
    if (m.type==="move") {
      const now=Date.now();
      const tx=clamp(m.x,-29,29), tz=clamp(m.z,-29,29);
      const dx=tx-p.x, dz=tz-p.z, distance=Math.hypot(dx,dz);
      // Reject impossible teleport-like movement while allowing short dash bursts.
      const maxStep=m.dash?1.35:0.62;
      if(distance<=maxStep){
        if(canOccupy(tx,p.z))p.x=tx;
        if(canOccupy(p.x,tz))p.z=tz;
      }
      p.y=1.6;
      p.yaw=clamp(m.yaw,-Math.PI*100,Math.PI*100); p.pitch=clamp(m.pitch,-1.35,1.35);
      if (m.dash && now-p.lastDash>1000) p.lastDash=now;
      
    } else if (m.type==="team" && (m.team==="T"||m.team==="CT")) {
      p.team=m.team; spawn(p); broadcast(room,publicRoom(room));
    } else if (m.type==="name") { p.name=cleanName(m.name); broadcast(room,publicRoom(room)); }
    else if (m.type==="avatar" && typeof m.avatar==="string" && m.avatar.length<180000 && /^data:image\/(jpeg|png|webp);base64,/.test(m.avatar)) { p.avatar=m.avatar; broadcast(room,{type:"roster",players:players(room,true)}); }
    else if (m.type==="bot") {
      const bots=[...room.players.values()].filter(x=>x.bot).length;
      if (bots>=8) return send(ws,{type:"error",message:"В комнате максимум 8 ботов."});
      const bot={id:"bot-"+crypto.randomUUID(),name:cleanName(m.name||`BOT-${bots+1}`),team:m.team==="T"||m.team==="CT"?m.team:(p.team==="T"?"CT":"T"),x:0,y:1.6,z:0,yaw:0,pitch:0,hp:100,score:0,avatar:"",lastShot:0,bot:true};
      spawn(bot); room.players.set(bot.id,bot); broadcast(room,publicRoom(room));
    } else if (m.type==="shoot") {
      const now=Date.now(); if(now-p.lastShot<170) return; p.lastShot=now;
      // Server-side hit validation: ray approximation from shooter view against enemy player positions.
      const dx=-Math.sin(p.yaw), dz=-Math.cos(p.yaw), maxDist=38;
      let best=null, bestAlong=maxDist;
      for(const q of room.players.values()) {
        if(q.id===p.id||q.team===p.team||q.hp<=0) continue;
        const vx=q.x-p.x, vz=q.z-p.z, along=vx*dx+vz*dz;
        if(along<=0||along>bestAlong) continue;
        const side=Math.abs(vx*dz-vz*dx);
        const verticalOffset=Math.abs(Math.tan(p.pitch||0)*along);
        if(side < 0.9 && verticalOffset<1.7 && !isBlockedShot(p.x,p.z,q.x,q.z)) {best=q;bestAlong=along;}
      }
      if(best) {
        best.hp-=34;
        if(best.hp<=0) { p.score++; spawn(best); broadcast(room,{type:"feed",text:`${p.name} выбил ${best.name}`}); }
        broadcast(room,{type:"hit",id:best.id,hp:best.hp,by:p.id});
      }
    } else if (m.type==="respawn") spawn(p);
  });
  ws.on("close",()=>remove(ws));
  ws.on("error",()=>remove(ws));
});
const heartbeat=setInterval(()=>{ for(const room of rooms.values()){tickBots(room); broadcast(room,publicRoom(room));} },100);
server.on("close",()=>clearInterval(heartbeat));
wss.on("connection",ws=>{ws.isAlive=true;ws.on("pong",()=>{ws.isAlive=true;});});
const heartbeatSockets=setInterval(()=>{for(const ws of wss.clients){if(ws.isAlive===false){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},30000);
server.on("close",()=>clearInterval(heartbeatSockets));
server.listen(PORT,HOST,()=>console.log(`Serega V3 listening on http://${HOST}:${server.address().port}`));
