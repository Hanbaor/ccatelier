// Reproduce the local, deliberately small Three.js WebGL entry. Never fetches.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),esbuild=require('esbuild');
const VERSION='0.186.0',ESBUILD='0.28.1';
const INPUTS={'build/three.core.js':'9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6','build/three.module.js':'9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea',LICENSE:'8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc'};
const symbols=['WebGLRenderer','Scene','OrthographicCamera','Group','Mesh','InstancedMesh','CylinderGeometry','TorusGeometry','CircleGeometry','SphereGeometry','LatheGeometry','MeshStandardMaterial','MeshBasicMaterial','AmbientLight','DirectionalLight','HemisphereLight','Vector2','Matrix4','CanvasTexture','SRGBColorSpace','ACESFilmicToneMapping','DoubleSide'];
async function build(){
 const at=process.argv.indexOf('--package'),directory=at<0?path.resolve(path.dirname(require.resolve('three')),'..'):path.resolve(process.argv[at+1]);
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
 if(manifest.name!=='three'||manifest.version!==VERSION||esbuild.version!==ESBUILD)throw Error('Expected three '+VERSION+' and esbuild '+ESBUILD);
 const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,file))).digest('hex');
 for(const [file,hash] of Object.entries(INPUTS))if(sha(file)!==hash)throw Error('Pinned Three.js input differs: '+file);
 const entry='export { '+symbols.join(',')+' } from '+JSON.stringify(path.join(directory,'build/three.module.js'))+';';
 const result=await esbuild.build({stdin:{contents:entry,resolveDir:directory},bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,write:false,legalComments:'inline'});
 const bytes=result.outputFiles[0].contents,gzip=zlib.gzipSync(bytes,{level:9}).length;
 if(bytes.length>650000||gzip>180000)throw Error('Optional renderer exceeds its build-byte budget');
 const destination=path.resolve(__dirname,'../source/atelier/vendor/three/'+VERSION);
 fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'livehouse-three.js'),bytes);fs.copyFileSync(path.join(directory,'LICENSE'),path.join(destination,'LICENSE'));
 const provenance={package:'three',version:VERSION,license:'MIT',source:'https://registry.npmjs.org/three/-/three-'+VERSION+'.tgz',release:'https://github.com/mrdoob/three.js/releases/tag/r186',esbuild:ESBUILD,entryExports:symbols,inputs:{'build/three.core.js':sha('build/three.core.js'),'build/three.module.js':sha('build/three.module.js'),LICENSE:sha('LICENSE')},artifact:{bytes:bytes.length,gzipBytes:gzip,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},measurement:'Local minified and gzip build bytes. Not a measured network transfer or runtime benchmark.'};
 fs.writeFileSync(path.join(destination,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');console.log(JSON.stringify(provenance.artifact));
}
build().catch(error=>{console.error(error.message);process.exitCode=1;});
