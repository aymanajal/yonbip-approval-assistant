import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const script=String.raw`
from pathlib import Path
import zipfile,json,hashlib
root=Path.cwd()
version=json.loads((root/'manifest.json').read_text())['version']
files=['manifest.json','config.js','background.js','continuous.js','engine.js','content.js','README.md','使用说明.md','config.example.json','scripts/configure.mjs','assets/rei-background.png','assets/PROMPT.md']
out=root/'dist'/('yonbip-approval-assistant-v'+version+'.zip')
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for name in files:
        assert (root/name).is_file(),name
        z.write(root/name,'yonbip-approval-assistant/'+name)
with zipfile.ZipFile(out) as z:
    assert z.testzip() is None
print(str(out))
print('SHA256 '+hashlib.sha256(out.read_bytes()).hexdigest())
`;
const result=spawnSync('python3',['-c',script],{cwd:root,stdio:'inherit'});
if(result.error){console.error('打包需要 Python 3：'+result.error.message);process.exitCode=1;}else process.exitCode=result.status||0;
