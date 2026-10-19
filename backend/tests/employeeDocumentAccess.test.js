const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.JWT_SECRET = 'document-test-only-secret';
const jwt = require('jsonwebtoken');
let dbCalls = 0, uploads = 0, deletes = 0;
const employee = { id: 1, employee_id: 'TEST001', profile_image: 'https://example.invalid/photo.jpg', password: 'secret', reset_password_token: 'secret' };
function inject(relative, exports) {
 const filename = path.resolve(__dirname, relative);
 require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
inject('../config/supabase.js', { from() {
 dbCalls++;
 let single = false, updating = false;
 const chain = {};
 for (const method of ['select', 'eq']) chain[method] = () => chain;
 chain.update = () => { updating = true; return chain; };
 chain.single = chain.maybeSingle = () => { single = true; return chain; };
 chain.then = (resolve, reject) => Promise.resolve({ data: single ? employee : updating ? [employee] : [], error: null }).then(resolve, reject);
 return chain;
} });
inject('../lib/supabaseStorage.js', {
 uploadFile: async () => { uploads++; return { publicUrl: 'https://example.invalid/new.jpg' }; },
 deleteFile: async () => { deletes++; }, folderForField: () => 'test',
});
inject('../utils/profilePhotoPost.js', { createProfilePhotoPost: async () => {} });
let server, base;
const originalLog = console.log;
before(async () => {
 console.log = () => {};
 const app = require('express')();
 app.use(require('express').json());
 app.use('/api/employees', require('../routes/employeeRoutes'));
 server = app.listen(0, '127.0.0.1');
 await new Promise(resolve => server.once('listening', resolve));
 base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); console.log = originalLog; });
function token(role = 'employee', id = 'TEST001') { return jwt.sign({ employeeId: id, role }, process.env.JWT_SECRET); }
async function request(method, target, auth = token(), body) {
 return fetch(base + '/api/employees/' + target, {method, headers: auth ? {Authorization: 'Bearer ' + auth} : {}, body, redirect: 'manual'});
}
function file(field) { const form = new FormData(); form.append(field, new Blob(['fake image'], {type:'image/png'}), 'photo.png'); return form; }
test('all document actions reject other employees before database or storage access', async () => {
 for (const [method, target] of [['GET','TEST002/documents'],['GET','TEST002/documents/profile_image'],['POST','TEST002/documents'],['DELETE','TEST002/documents/profile_image']]) {
  const before = [dbCalls,uploads,deletes];
  assert.equal((await request(method,target)).status,403);
  assert.deepEqual([dbCalls,uploads,deletes],before);
 }
});
test('all document actions require authentication', async () => {
 for (const [method,target] of [['GET','TEST001/documents'],['GET','TEST001/documents/profile_image'],['POST','TEST001/documents'],['DELETE','TEST001/documents/profile_image']]) assert.equal((await request(method,target,null)).status,401);
});
test('employees can list and view their own documents', async () => {
 assert.equal((await request('GET','TEST001/documents')).status,200);
 const response = await request('GET','TEST001/documents/profile_image');
 assert.equal(response.status,302);
 assert.equal(response.headers.get('location'),employee.profile_image);
});
test('admin, sub_admin and HR retain cross-employee document access', async () => {
 for (const role of ['admin','sub_admin','hr']) {
  const auth = token(role);
  assert.equal((await request('GET','TEST002/documents',auth)).status,200);
  assert.equal((await request('GET','TEST002/documents/profile_image',auth)).status,302);
  assert.equal((await request('POST','TEST002/documents',auth,file('profile_image'))).status,200);
  assert.equal((await request('DELETE','TEST002/documents/profile_image',auth)).status,200);
 }
});
test('other roles do not gain cross-employee access', async () => {
 for(const role of ['manager','finance','desktop_support','housekeeper']) assert.equal((await request('GET','TEST002/documents',token(role))).status,403);
});
test('invalid document types cannot read or clear arbitrary employee columns', async () => {
 for(const field of ['password','role','gross_salary','profile_image,password','__proto__']) {
  for(const method of ['GET','DELETE']) {
   const before = [dbCalls,uploads,deletes];
   assert.equal((await request(method,'TEST001/documents/' + encodeURIComponent(field))).status,400);
   assert.deepEqual([dbCalls,uploads,deletes],before);
  }
 }
});
test('invalid multipart fields are rejected before any upload or database change', async () => {
 const form = file('profile_image');
 form.append('role',new Blob(['invalid'],{type:'image/png'}),'role.png');
 const before = [dbCalls,uploads,deletes];
 assert.equal((await request('POST','TEST001/documents',token(),form)).status,400);
 assert.deepEqual([dbCalls,uploads,deletes],before);
});
test('own valid uploads and deletes work without leaking authentication fields', async () => {
 const response = await request('POST','TEST001/documents',token(),file('profile_image'));
 assert.equal(response.status,200);
 const body = await response.json();
 assert.equal(body.updated_employee.password,undefined);
 assert.equal(body.updated_employee.reset_password_token,undefined);
 assert.equal((await request('DELETE','TEST001/documents/profile_image')).status,200);
});
