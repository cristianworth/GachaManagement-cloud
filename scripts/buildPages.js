import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { buildDemo } from './buildDemo.js';

const root = fileURLToPath(new URL('../',import.meta.url));
const output = resolve(root,'.local-deliveries/public-demo');

export async function buildPages({demoDirectory, name = 'pages'} = {}) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid Pages build name.');
    const destination = resolve(output,name);
    const demo = demoDirectory ?? await buildDemo();
    if (!destination.startsWith(output + sep) || destination === demo || demo.startsWith(destination + sep)) throw new Error('Invalid Pages destination.');
    await rm(destination,{recursive:true,force:true});
    await mkdir(destination,{recursive:true});
    // The normal application retains its existing assets/configuration. The /demo subtree is isolated.
    for (const directory of ['js','css','img']) await cp(resolve(root,directory),resolve(destination,directory),{recursive:true});
    for (const file of ['index.html','404.html']) await writeFile(resolve(destination,file),await readFile(resolve(root,file)));
    await cp(demo,resolve(destination,'demo'),{recursive:true});
    await writeFile(resolve(destination,'.nojekyll'),'');
    return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(await buildPages());
