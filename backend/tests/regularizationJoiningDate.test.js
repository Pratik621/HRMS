const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
let joiningDate='2026-09-18', employeeExists=true, attendanceCalls=0;
function inject(file,exports){const filename=path.resolve(__dirname,file);require.cache[filename]={id:filename,filename,loaded:true,exports};}
inject('../config/supabase.js',{from(table){
 if(table!=='employees')attendanceCalls++;
 const chain={};
 for(const name of ['select','eq','order','limit'])chain[name]=()=>chain;
 chain.maybeSingle=async()=>({data:table==='employees'&&employeeExists?{joining_date:joiningDate}:null,error:null});
 return chain;
}});
inject('../controllers/attendanceController.js',{_shared:{nowIST:()=> '2026-10-19T12:00:00',toUTCMs:Date.parse}});
inject('../services/regularizationService.js',{ELEVATED_ROLES:['admin','hr','sub_admin']});
inject('../lib/supabaseStorage.js',{uploadFile:()=>{throw Error('Unexpected upload');}});
inject('../utils/employeeLookup.js',{});
inject('../services/notificationService.js',{});
const {createRequest}=require('../controllers/regularizationController');
async function run(date,role='employee',type='other'){
 let status,body;
 await createRequest({params:{employee_id:'TEST001'},user:{employeeId:'TEST001',role},body:{attendance_date:date,request_type:type,reason:'A sufficiently detailed test reason'}},{status(code){status=code;return this;},json(value){body=value;return this;}});
 return {status,body};
}
test('pre-joining dates are blocked for employees and elevated roles before attendance writes',async()=>{
 for(const role of ['employee','admin','hr','sub_admin']){
  const before=attendanceCalls;
  const result=await run('2026-09-17',role,'wfh');
  assert.equal(result.status,400);
  assert.match(result.body.message,/before your joining date/);
  assert.equal(attendanceCalls,before);
 }
});
test('joining day and later dates pass the employment gate',async()=>{
 for(const date of ['2026-09-18','2026-09-19']){
  const before=attendanceCalls;
  const result=await run(date);
  assert.equal(result.status,404);
  assert.match(result.body.message,/No attendance record/);
  assert.ok(attendanceCalls>before);
 }
});
test('missing employee and joining date fail without touching attendance',async()=>{
 const before=attendanceCalls;
 employeeExists=false;
 assert.equal((await run('2026-09-19')).status,404);
 employeeExists=true;joiningDate=null;
 assert.equal((await run('2026-09-19')).status,400);
 joiningDate='2026-09-18';
 assert.equal(attendanceCalls,before);
});
