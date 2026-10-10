const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto').webcrypto;
const core=()=>import('../source/atelier/js/code-reference-core.mjs');
test('SHA-256 preserves whitespace, blank lines, tabs and Unicode; only CRLF is normalized',async()=>{
 const {digestCode,normalizeCode}=await core();assert.equal(normalizeCode(' a\r\n\t中\n\n'),' a\n\t中\n\n');
 assert.equal(await digestCode('abc',crypto),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.equal(await digestCode(' a\r\n\t中\n\n',crypto),await digestCode(' a\n\t中\n\n',crypto));
 assert.notEqual(await digestCode(' a',crypto),await digestCode('a',crypto));await assert.rejects(digestCode('x',{}),/不支持/);
});
test('strict versioned full-digest fragments reject malformed and unsafe ranges',async()=>{
 const {parseCodeReference,codeReferenceURL}=await core(),block='a'.repeat(64),ref={block,start:2,end:8};
 const url=codeReferenceURL('https://example.test/prefix/post/?private=secret#chapter',ref);assert.equal(url,`https://example.test/prefix/post/#cc-code=v1.${block}.2-8`);
 assert.deepEqual(parseCodeReference(new URL(url).hash),{version:1,...ref});assert.equal(parseCodeReference('#章节'),null);
 for(const hash of ['#cc-code=%E0%A4%A',`#cc-code=v2.${block}.1-2`,`#cc-code=v1.${block}.0-2`,`#cc-code=v1.${block}.2-1`,`#cc-code=v1.${block}.01-2`,`#cc-code=v1.${block}.1-9999999999`,'#cc-code='+'x'.repeat(10000)])assert.throws(()=>parseCodeReference(hash));
});
test('only a unique unchanged block and in-bounds range can resolve',async()=>{
 const {resolveCodeReference}=await core(),entry={digest:'x',code:'one\n\ntwo'},ref={block:'x',start:2,end:3};
 assert.equal(resolveCodeReference(ref,[{digest:'y',code:'unrelated'},entry]),entry);
 for(const blocks of [[],[{digest:'changed',code:entry.code}],[entry,entry]])assert.throws(()=>resolveCodeReference(ref,blocks),/无法唯一定位/);
 assert.throws(()=>resolveCodeReference({...ref,end:4},[entry]));
});
