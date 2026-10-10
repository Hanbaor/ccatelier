// Conservative lexer gate for the minimizer, NOT a general SQL parser or a
// replacement for SQLite's prepare/query_only checks. Unsupported syntax stays
// available in ordinary Run. All named functions must be explicitly supported.
const functions=new Set(['count','min','max','sum','avg','total','coalesce','ifnull','nullif','abs','round','length','lower','upper','substr','substring','trim','ltrim','rtrim','replace','instr','typeof','cast']);
const syntaxBeforeParen=new Set(['in','exists','as','over','filter','values']);
const fail=reason=>{throw new Error(`此查询不支持最小化：${reason} 普通运行仍可使用。`)};
export function validateMinimizerSql(sql) {
  const tokens=[];let index=0,depth=0;
  while(index<sql.length){
    const start=index,c=sql[index];
    if(/\s/.test(c)){index++;continue}
    if(sql.startsWith('--',index)){const end=sql.indexOf('\n',index+2);index=end<0?sql.length:end+1;continue}
    if(sql.startsWith('/*',index)){const end=sql.indexOf('*/',index+2);if(end<0)fail('注释必须完整闭合。');index=end+2;continue}
    if(['\'', '"','`','['].includes(c)){
      const end=c==='['?']':c;let value='',closed=false;index++;
      while(index<sql.length){
        if(sql[index]===end){if(c!=='['&&sql[index+1]===end){value+=end;index+=2;continue}index++;closed=true;break}
        value+=sql[index++];
      }
      if(!closed)fail('字符串或标识符必须完整闭合。');
      tokens.push({value:value.toLowerCase(),kind:c==='\''?'string':'identifier',depth,quoted:true});continue;
    }
    if(/[a-zA-Z_]/.test(c)){
      index++;while(index<sql.length&&/[a-zA-Z0-9_$]/.test(sql[index]))index++;
      tokens.push({value:sql.slice(start,index).toLowerCase(),kind:'identifier',depth,quoted:false});continue;
    }
    const number=sql.slice(index).match(/^(?:0[xX][\da-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/);
    if(number){index+=number[0].length;tokens.push({value:number[0],kind:'number',depth});continue}
    if(c==='('){tokens.push({value:c,kind:'symbol',depth});depth++;index++;continue}
    if(c===')'){if(--depth<0)fail('必须是完整、独立的 SELECT 查询。');tokens.push({value:c,kind:'symbol',depth});index++;continue}
    if('.,*+-/%|<>=!~&'.includes(c)){tokens.push({value:c,kind:'symbol',depth});index++;continue}
    fail('此语法尚未纳入确定性子集（不支持参数）。');
  }
  if(depth!==0)fail('括号必须完整闭合。');
  let ordered=false;
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i],next=tokens[i+1];
    if(token.kind==='identifier'){
      if(/^(pragma_|sqlite_)/.test(token.value)||['current_time','current_date','current_timestamp'].includes(token.value))fail('不支持时间、连接状态或数据库元数据。');
      if(next?.value==='('&&!functions.has(token.value)&&!(syntaxBeforeParen.has(token.value)&&!token.quoted))fail(`函数或语法 ${token.value.slice(0,48)} 不在支持列表中。`);
      if(!token.quoted&&token.value==='order'&&token.depth===0&&next?.value==='by'&&!next.quoted&&next.depth===0)ordered=true;
    }
    if(token.kind==='string'&&next?.value==='(')fail('不支持字符串形式的函数名。');
  }
  if(!ordered)fail('请提供顶层 ORDER BY；隐式顺序不参与最小性验证。');
  return sql;
}
