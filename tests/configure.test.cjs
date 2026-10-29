const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
function sandbox(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'approval-config-'));fs.mkdirSync(path.join(root,'scripts'));fs.copyFileSync('scripts/configure.mjs',path.join(root,'scripts/configure.mjs'));fs.copyFileSync('manifest.json',path.join(root,'manifest.json'));return root;}
test('环境配置同时更新注入地址、图片地址和后台来源校验配置',()=>{
  const root=sandbox();try{
    fs.writeFileSync(path.join(root,'config.local.json'),JSON.stringify({origins:['https://erp.example.com','http://localhost:8080','https://erp.example.com/']}));
    const result=spawnSync(process.execPath,['scripts/configure.mjs'],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
    assert.deepEqual(manifest.content_scripts[0].matches,['https://erp.example.com/nccloud/resources/ssctp/sscuser/sscapprove/list/*','http://localhost:8080/nccloud/resources/ssctp/sscuser/sscapprove/list/*']);
    assert.deepEqual(manifest.web_accessible_resources[0].matches,['https://erp.example.com/*','http://localhost:8080/*']);
    assert.match(fs.readFileSync(path.join(root,'config.js'),'utf8'),/https:\/\/erp.example.com/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('拒绝带凭据、路径或非网页协议的配置，不部分修改 manifest',()=>{
  for(const value of ['https://user:pass@erp.example.com','https://erp.example.com/private','file:///tmp/test','https://erp.example.com/?token=example']){
    const root=sandbox();try{
      const before=fs.readFileSync(path.join(root,'manifest.json'),'utf8');
      fs.writeFileSync(path.join(root,'config.local.json'),JSON.stringify({origins:[value]}));
      const result=spawnSync(process.execPath,['scripts/configure.mjs'],{cwd:root,encoding:'utf8'});assert.equal(result.status,1);
      assert.equal(fs.readFileSync(path.join(root,'manifest.json'),'utf8'),before);
      assert.equal(fs.existsSync(path.join(root,'config.js')),false);
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  }
});
