// Isolated fake Notion server for mobile UI verification; no external requests.
const path = require('node:path');
const { createApp } = require('../server');
const userId = '11111111-1111-4111-8111-111111111111';
const properties = [{id:'title',name:'Title',type:'title'},{id:'date',name:'Date',type:'date'},{id:'appId',name:'App ID',type:'rich_text'},{id:'owner',name:'Assignee',type:'people'}];
const adapter = {
  containers:async()=>[{id:'qa-source',label:'Team tasks',writable:true,properties}],
  schema:async()=>properties,
  users:async()=>[{id:userId,label:'Demo user'}], user:async()=>({id:userId,label:'Demo user'}),
  list:async target=>[{externalId:'mine',data:{title:'Assigned to me',date:'2026-09-14'}},...(target.assigneeFilter?[]:[{externalId:'other',data:{title:'Someone else task',date:'2026-09-14'}}])],
  get:async(target,id)=>({externalId:id,inScope:!target.assigneeFilter||id==='mine',data:{title:id==='mine'?'Assigned to me':'Someone else task',date:'2026-09-14'}}),
};
const app=createApp({dir:path.resolve(__dirname,'../artifacts/uiux-qa/notion-assignee-server'),token:'qa-local-only',loginPassword:'qa-mobile-password',config:{timeZone:'Asia/Seoul'},overrides:{providers:{notion:{adapter:()=>adapter}}}});
app.store.data.teams=[{id:'qa-studio',name:'Studio',color:'#6685e8',createdAt:Date.now(),updatedAt:Date.now()}];
app.store.data.connections=[{id:'qa-notion',provider:'notion',label:'Demo Notion',enabled:true,credentials:app.store.seal({accessToken:'fake'})}];
app.store.save();app.server.listen(18787,'0.0.0.0',()=>console.log('Isolated Notion fixture ready on 18787'));
