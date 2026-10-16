const test = require('node:test');
const assert = require('node:assert/strict');
const { saveOnboardingApproval } = require('../utils/onboardingApproval');

function database(error, writes) {
    return { from(table) {
        assert.equal(table, 'employee_offer_links');
        return { update(values) {
            writes.push(values);
            return { async eq(column, id) {
                assert.equal(column, 'id'); assert.equal(id, 'offer-1');
                return { error };
            } };
        } };
    } };
}
test('stores approved status with the employee link', async () => {
    const writes = [];
    const values = { status: 'approved', created_employee_id: 'EMP1' };
    await saveOnboardingApproval(database(null, writes), 'offer-1', values);
    assert.deepEqual(writes, [values]);
});
test('does not silently report success when schema/status persistence fails', async () => {
    const error = { code: 'PGRST204', message: 'created_employee_id missing' };
    await assert.rejects(saveOnboardingApproval(database(error, []), 'offer-1', {}), failure => {
        assert.match(failure.message, /account was created.*offer status could not be saved/);
        assert.match(failure.message, /Do not create another account/);
        assert.equal(failure.cause, error);
        return true;
    });
});
