import { objects, gameModes } from './config.js';
import { objectSVG } from './art.js';
export function giftData(game, images = {}) {
  return { version: 1, gameName: 'シーソーゲーム：〇〇を落とすな！', gameMode: game.gameMode,
    objectType: game.objectType, result: game.summary(), images: { ...images },
    event: { name: '風に立つ', date: '2026.10.18', location: '南大沢・大平公園' } };
}
export function resultText(data) {
  const s = data.result;
  return data.gameMode === 'STAR' ? `星 ${s.starCount} 個` : data.gameMode === 'KEEP' ? `落下 ${s.dropCount} 回` : `生存 ${s.survivalTime.toFixed(1)} 秒`;
}
const decode = async src => { const img = new Image(); img.src = src; await img.decode(); return img; };
export async function drawGift(canvas,data) {
  canvas.width = 720; canvas.height = 1080;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f7f5e9'; ctx.fillRect(0,0,720,1080);
  ctx.textAlign = 'center'; ctx.fillStyle = '#315e4b'; ctx.font = 'bold 40px sans-serif'; ctx.fillText('シーソーゲーム',360,85);
  ctx.font = 'bold 32px sans-serif'; ctx.fillText(`${objects[data.objectType].label}を落とすな！`,360,140);
  const slots = [[data.images.MY_FACE,70,190,'にっこりの思い出'], [data.images.MY_DRAWING ?? data.images.MY_PHOTO,380,190,'じぶんの作品']];
  for (const [src,x,y,label] of slots) {
    ctx.fillStyle = '#e4eccf'; ctx.beginPath(); ctx.roundRect(x,y,270,290,24); ctx.fill();
    if (src) { const img = await decode(src); ctx.drawImage(img,x+10,y+10,250,250); }
    ctx.fillStyle = '#315e4b'; ctx.font = '18px sans-serif'; ctx.fillText(label,x+135,y+278);
  }
  const custom = data.images[data.objectType];
  const object = await decode(custom ?? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(objectSVG(data.objectType)));
  ctx.drawImage(object,295,520,130,140);
  ctx.font = 'bold 30px sans-serif'; ctx.fillText(gameModes[data.gameMode].label,360,705);
  ctx.font = 'bold 52px sans-serif'; ctx.fillText(resultText(data),360,780);
  ctx.font = '28px sans-serif'; ctx.fillText('よく がんばったね！',360,842);
  ctx.font = 'bold 36px sans-serif'; ctx.fillText(data.event.name,360,924);
  ctx.font = '24px sans-serif'; ctx.fillText(data.event.date,360,970); ctx.fillText(data.event.location,360,1015);
  return canvas;
}
