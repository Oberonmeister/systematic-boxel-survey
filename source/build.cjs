const fs=require('node:fs'),path=require('node:path');
const base=__dirname;
let html=fs.readFileSync(path.join(base,'template.html'),'utf8');
for(const [tag,file] of [['MODEL','model.js'],['BRIDGE','bridge.js'],['UI','ui.js']])html=html.replace('/* '+tag+' */',()=>fs.readFileSync(path.join(base,file),'utf8').replace(/<\/script/gi,'<\\/script'));
fs.writeFileSync(path.join(base,'..','Systematic-Boxel-Survey.html'),html);
console.log('Built Systematic-Boxel-Survey.html ('+Buffer.byteLength(html)+' bytes)');
