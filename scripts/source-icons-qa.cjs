// Isolated visual fixture. Never opens real integrations or the user's database.
const path = require('node:path');
const { createApp } = require('../server');
const app = createApp({dir:path.resolve(__dirname,'../artifacts/uiux-qa/source-icons-server'),token:'qa-local-only',loginPassword:'qa-mobile-password',config:{}});
const now=Date.now(), db=app.store.data;
db.teams=[{id:'logo-team',name:'Studio',color:'#6685e8',createdAt:now,updatedAt:now}];
db.todos=[['Design review',['notion','google','notion']],['Afternoon appointment',['apple']],['Client meeting',['google']],['Write a quick note',[]]].map(([title,sources],i)=>({id:'source-qa-'+i,title,kind:'todo',teamId:'logo-team',date:'2026-09-14',status:'todo',sortOrder:i,createdAt:now,updatedAt:now,revision:1,origin:{type:'legacy'}}));
db.targets=['notion','google','apple'].map(provider=>({id:provider,provider,label:provider,teamId:'logo-team',readEnabled:false,writeEnabled:false}));
db.links=[['notion','google','notion'],['apple'],['google'],[]].flatMap((sources,i)=>sources.map((provider,j)=>({id:`source-link-${i}-${j}`,todoId:'source-qa-'+i,targetId:provider,externalId:`external-${i}-${j}`,remoteBase:{title:db.todos[i].title},localBase:{title:db.todos[i].title}})));
db.connections=[];app.store.save();app.server.listen(18787,'0.0.0.0',()=>console.log('Source icons visual fixture ready on 18787'));
