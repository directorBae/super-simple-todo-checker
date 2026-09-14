// Isolated test data; never opens the user's configured server or external accounts.
const path = require('node:path');
const fs = require('node:fs');
const { createApp } = require('../server');
const dir = path.resolve(__dirname, '../artifacts/uiux-qa/test-server');
const app = createApp({ dir, token: 'qa-local-only', config: {}, loginPassword: 'qa-mobile-password' });
const now = Date.now(), date = new Date().toLocaleDateString('en-CA');
app.store.data.teams = [{ id:'qa-studio',name:'Studio',color:'#6685e8',createdAt:now,updatedAt:now }, { id:'qa-personal',name:'Personal',color:'#4d9d86',createdAt:now,updatedAt:now }];
app.store.data.todos = ['Review draft','Call team'].map((title,i)=>({id:'qa-'+i,title,date,teamId:'qa-studio',status:'todo',kind:'todo',sortOrder:(i+1)*1024,createdAt:now,updatedAt:now,origin:{type:'legacy'},revision:1}));
app.store.save();
app.server.listen(18787,'0.0.0.0',async()=>{
 const r=await fetch('http://127.0.0.1:18787/pair/create',{method:'POST',headers:{Authorization:'Bearer qa-local-only'}});
 const invitation=await r.json();fs.writeFileSync(path.join(dir,'invitation.json'),JSON.stringify(invitation));console.log('Isolated QA server ready on 18787.');
});
