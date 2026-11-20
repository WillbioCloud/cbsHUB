import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
fs.mkdirSync('build/test-logs',{recursive:true});
const results=[];
for(const file of fs.readdirSync('tests').filter(file=>file.endsWith('.cjs')).sort()){
 const result=spawnSync(process.execPath,['tests/'+file],{encoding:'utf8',timeout:100000,env:process.env});
 const output=(result.stdout||'')+(result.stderr||'');
 fs.writeFileSync('build/test-logs/'+file+'.log',output);
 const status=result.status===0?'passed':file==='media-transport.cjs'&&output.includes('BLOCKED:')?'blocked':'failed';
 results.push({file,status,exit:result.status,error:result.error?.message});
 console.log(status.toUpperCase(),file);
 fs.writeFileSync('build/test-results.json',JSON.stringify(results,null,2));
}
// An environment block is not an approval of the full suite.
if(results.some(result=>result.status!=='passed'))process.exitCode=1;
