const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
test('leave reason rejects short, blank, non-string and oversized values before database access',async()=>{
 const source=fs.readFileSync(require.resolve('../controllers/leaveController'),'utf8');
 const start=source.indexOf('exports.applyLeave = async');const end=source.indexOf('// Guards against malformed dates',start);
 const context={exports:{}};
 vm.runInNewContext(source.slice(start,end)+'return res.status(299).json({reason:trimmedReason}); } catch(error) { throw error; } };',context);
 for(const [reason,expected] of [[' ',400],['123456789',400],['x'.repeat(501),400],[{},400],['1234567890',299],['x'.repeat(500),299],['  1234567890  ',299]]){
  let status,body;
  await context.exports.applyLeave({body:{employee_id:'TEST001',leave_type:'Unpaid',start_date:'2026-10-20',reason}},{status(n){status=n;return this;},json(v){body=v;return this;}});
  assert.equal(status,expected);
  if(expected===299)assert.equal(body.reason,reason.trim());
 }
});
