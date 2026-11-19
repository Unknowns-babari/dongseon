// 위키미디어 공용(Commons)에서 자유 라이선스 사진을 찾아 photos/img 에 저장하고
// photos/manifest.json 에 촬영자·라이선스·원본 페이지를 기록한다.
// GitHub Actions(.github/workflows/photos.yml)에서 실행된다. 이미 받은 키는 건너뛴다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const QF = path.join(ROOT, 'photos/queries.json');
const MF = path.join(ROOT, 'photos/manifest.json');
const IMG = path.join(ROOT, 'photos/img');
const PER_KEY = 2;
const UA = 'dongseon-student-project/1.0 (https://github.com/Unknowns-babari/dongseon)';
const OK = /^(cc0|cc[ -]by(-sa)?( \d(\.\d)?)?|public domain|pd\b|attribution)/i;
const strip = h => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

fs.mkdirSync(IMG, { recursive: true });
const queries = JSON.parse(fs.readFileSync(QF, 'utf8'));
const man = fs.existsSync(MF) ? JSON.parse(fs.readFileSync(MF, 'utf8')) : {};
const force = process.env.FORCE === '1';

let got = 0, miss = 0;
for (const [key, q] of Object.entries(queries)) {
  if (!force && man[key] && man[key].q === q && man[key].l.length) continue;
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8'
    + '&gsrsearch=' + encodeURIComponent(q + ' filetype:bitmap') + '&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=500';
  try {
    const j = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
    const pages = Object.values((j.query || {}).pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
    const picks = pages.map(p => {
      const ii = (p.imageinfo || [])[0] || {}, m = ii.extmetadata || {};
      return { src: ii.thumburl, page: ii.descriptionurl, mime: ii.mime, lic: strip((m.LicenseShortName || {}).value), by: strip((m.Artist || {}).value).slice(0, 60) || '작자 미상' };
    }).filter(x => x.src && /image\/(jpeg|png|webp)/.test(x.mime || '') && OK.test(x.lic)).slice(0, PER_KEY);
    const l = [];
    for (const x of picks) {
      const ext = /png/.test(x.mime) ? 'png' : /webp/.test(x.mime) ? 'webp' : 'jpg';
      const name = crypto.createHash('sha1').update(x.page || x.src).digest('hex').slice(0, 16) + '.' + ext;
      const fp = path.join(IMG, name);
      if (!fs.existsSync(fp)) {
        const r = await fetch(x.src, { headers: { 'User-Agent': UA } });
        if (!r.ok) continue;
        fs.writeFileSync(fp, Buffer.from(await r.arrayBuffer()));
        await sleep(150);
      }
      l.push({ f: 'img/' + name, page: x.page, lic: x.lic, by: x.by });
    }
    man[key] = { q, l };
    l.length ? got++ : miss++;
  } catch (e) {
    console.log('실패', key, e.message);
  }
  await sleep(250);
}
fs.writeFileSync(MF, JSON.stringify(man, null, 1));
console.log(`새로 받은 키 ${got}개, 사진 없음 ${miss}개, 전체 ${Object.keys(man).length}개`);
