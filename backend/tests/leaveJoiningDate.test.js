const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { calculateLeaveDays } = require('../config/leavePolicy');
test('birthday defaults use this year when eligible, including past dates', async () => {
 const { getNextBirthday } = await import('../../frontend/src/utils/nextBirthday.js');
 assert.equal(getNextBirthday('2003-04-08','2026-09-18','2026-10-19'),'2027-04-08');
 assert.equal(getNextBirthday('2003-04-08','2026-04-07','2026-10-19'),'2026-04-08');
 assert.equal(getNextBirthday('2003-04-08','2026-04-08','2026-10-19'),'2026-04-08');
 assert.equal(getNextBirthday('2003-04-08','2026-04-09','2026-10-19'),'2027-04-08');
 assert.equal(getNextBirthday('2003-10-19','','2026-10-19'),'2026-10-19');
 assert.equal(getNextBirthday('2003-12-01','','2026-10-19'),'2026-12-01');
 assert.equal(getNextBirthday('2000-02-29',null,'2026-10-19'),'2028-02-29');
 assert.equal(getNextBirthday('2003-04-08','2028-09-18','2026-10-19'),'2029-04-08');
 assert.equal(getNextBirthday('invalid','','2026-10-19'),'');
});
test('all leave types reject pre-joining dates before writes; joining date passes', async () => {
 const source=fs.readFileSync(require.resolve('../controllers/leaveController'),'utf8');
 const start=source.indexOf('exports.applyLeave = async');
 const end=source.indexOf('// ── Birthday Leave',start);
 const prefix=source.slice(start,end);
 for(const type of ['Birthday','Comp-Off','Unpaid','Annual']) {
  let touchedOtherTable=false,status,body;
  const ctx={exports:{},calculateLeaveDays,console,supabase:{from(table){if(table!=='employees')touchedOtherTable=true;const q={};q.select=q.eq=()=>q;q.single=async()=>({data:{joining_date:'2026-09-18'},error:null});return q;}}};
  vm.runInNewContext(prefix+"return res.status(299).json({success:true}); } catch(error) { throw error; } };",ctx);
  const response={status(value){status=value;return this;},json(value){body=value;return this;}};
  const req={body:{employee_id:'TEST001',leave_type:type,start_date:'2026-09-17',end_date:'2026-09-17',leave_duration:'Full Day',reporting_manager:'Test Manager',reason:'Test leave request reason'}};
  await ctx.exports.applyLeave(req,response);
  assert.equal(status,400);assert.match(body.message,/before your joining date/);assert.equal(touchedOtherTable,false);
  req.body.start_date=req.body.end_date='2026-09-18';await ctx.exports.applyLeave(req,response);assert.equal(status,299);
 }
});
