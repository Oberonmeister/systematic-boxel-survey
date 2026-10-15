const test=require('node:test'),assert=require('node:assert/strict'),C=require('./model.js'),fixture=require('./hierarchy.catalogue-fixture.json');
// Independently decode the numeric address, without using the name parser.
function addressGrid(text){const id=BigInt(text),m=Number(id&7n);return{mass:C.MASSES[m],side:128/2**m,grid:[30-2*m,17-m,3].map((shift,i)=>Number((id>>BigInt(shift))&((1n<<BigInt(i===1?13-m:14-m))-1n)))};}
test('the real Pyurks anchor address agrees with its name-derived local grid',()=>{
 const decoded=addressGrid(fixture.anchor.id64),anchor=C.parseName(fixture.anchor.name);assert.equal(decoded.mass,anchor.mass);assert.deepEqual(decoded.grid.map(v=>v%decoded.side),anchor.xyz);
});
test('independent catalogue data confirms eight physical children but different naming regions',()=>{
 const parent=addressGrid(fixture.anchor.id64),anchor=C.parseName(fixture.anchor.name);assert.equal(fixture.children.length,8);
 for(const child of fixture.children){const generated=C.descendant(anchor,'c',child.index);assert.equal(C.systemName(generated,0),child.generated);assert.ok(child.systems.length);
  for(const sample of child.systems){const actual=addressGrid(sample.id64);assert.equal(actual.mass,'c');assert.deepEqual(actual.grid.map(v=>Math.floor(v/2)),parent.grid);assert.deepEqual(actual.grid.map(v=>v%actual.side),generated.xyz);assert.deepEqual(actual.grid.map(v=>v%2),[child.index&1,(child.index>>1)&1,(child.index>>2)&1]);assert.equal(C.parseName(sample.name).sector,'NGC 2244 Sector');assert.notEqual(C.parseName(sample.name).key,generated.key);}
 }
});
