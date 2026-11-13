const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const createApp = require('../src/app');
const User = require('../src/models/User');
const Dataset = require('../src/models/Dataset');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'datalens-test-secret-with-more-than-32-characters';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';

const databaseName = `datalens_test_${Date.now()}_${process.pid}`;
const databaseUri = `mongodb://127.0.0.1:27017/${databaseName}`;
let server;
let baseUrl;

before(async () => {
  await mongoose.connect(databaseUri, { dbName: databaseName });
  server = createApp().listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function register(name, email) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'secure-test-password' }),
  });
  return response;
}

async function uploadCsv(token, fileName, contents) {
  const form = new FormData();
  form.append('file', new Blob([contents], { type: 'text/csv' }), fileName);
  return fetch(`${baseUrl}/api/datasets/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

test('dataset routes require a valid signed-in user', async () => {
  const response = await fetch(`${baseUrl}/api/datasets`);
  assert.equal(response.status, 401);

  const invalidTokenResponse = await fetch(`${baseUrl}/api/datasets`, {
    headers: { Authorization: 'Bearer invalid-token' },
  });
  assert.equal(invalidTokenResponse.status, 401);
});

test('signup stores a password hash and login returns a usable session', async () => {
  const signup = await register('Test User', 'TEST@example.com');
  assert.equal(signup.status, 201);
  const session = await signup.json();
  assert.ok(session.token);
  assert.equal(session.user.email, 'test@example.com');
  assert.equal('password' in session.user, false);

  const storedUser = await User.findOne({ email: 'test@example.com' });
  assert.ok(storedUser.password !== 'secure-test-password');

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'TEST@example.com', password: 'secure-test-password' }),
  });
  assert.equal(login.status, 200);
  assert.ok((await login.json()).token);
});

test('a user cannot list, open, rename, or delete another user dataset', async () => {
  const firstResponse = await register('First User', 'first@example.com');
  const secondResponse = await register('Second User', 'second@example.com');
  const firstSession = await firstResponse.json();
  const secondSession = await secondResponse.json();
  const firstUser = await User.findOne({ email: firstSession.user.email });

  const dataset = await Dataset.create({
    userId: firstUser._id,
    name: 'private.csv',
    originalName: 'private.csv',
    rowCount: 4,
    columnCount: 1,
    columns: [{ name: 'value', type: 'numeric' }],
  });

  const secondHeaders = { Authorization: `Bearer ${secondSession.token}` };
  const listResponse = await fetch(`${baseUrl}/api/datasets`, { headers: secondHeaders });
  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json()).total, 0);

  const openResponse = await fetch(`${baseUrl}/api/datasets/${dataset.id}`, { headers: secondHeaders });
  assert.equal(openResponse.status, 404);

  const renameResponse = await fetch(`${baseUrl}/api/datasets/${dataset.id}`, {
    method: 'PATCH',
    headers: { ...secondHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'stolen.csv' }),
  });
  assert.equal(renameResponse.status, 404);

  const deleteResponse = await fetch(`${baseUrl}/api/datasets/${dataset.id}`, {
    method: 'DELETE', headers: secondHeaders,
  });
  assert.equal(deleteResponse.status, 404);
  assert.ok(await Dataset.findById(dataset.id));
});

test('duplicate signups are rejected without returning account details', async () => {
  const first = await register('Duplicate Test', 'duplicate@example.com');
  const second = await register('Duplicate Test', 'DUPLICATE@example.com');
  assert.equal(first.status, 201);
  assert.equal(second.status, 409);
  assert.deepEqual(await second.json(), { message: 'An account with this email already exists.' });
});

test('CSV analysis handles numeric threshold, missing and invalid values', async () => {
  const signup = await register('CSV Test User', 'csv-analysis@example.com');
  const session = await signup.json();
  const response = await uploadCsv(session.token, 'edge-cases.csv', [
    'name,value,group',
    'A,1,x',
    'B,3,y',
    'C,5,x',
    'D,bad,y',
    'E,9,z',
    'F,,x',
  ].join('\n'));

  assert.equal(response.status, 200);
  const report = await response.json();
  const valueColumn = report.columns.find((column) => column.name === 'value');
  assert.equal(report.rowCount, 6);
  assert.equal(report.columnCount, 3);
  assert.equal(valueColumn.type, 'numeric');
  assert.equal(valueColumn.missingCount, 2);
  assert.equal(valueColumn.invalidCount, 1);
  assert.equal(valueColumn.mean, 4.5);
  assert.equal(valueColumn.median, 4);
  assert.equal(valueColumn.min, 1);
  assert.equal(valueColumn.max, 9);
  assert.equal(valueColumn.standardDeviation, 2.96);
  assert.equal(report.preview.length, 6);
});

test('CSV upload gives clear errors for empty data, duplicate headers, and uneven rows', async () => {
  const signup = await register('CSV Validation User', 'csv-validation@example.com');
  const session = await signup.json();

  const emptyData = await uploadCsv(session.token, 'empty.csv', 'name,value\n');
  assert.equal(emptyData.status, 400);
  assert.match((await emptyData.json()).message, /no data rows/i);

  const duplicateHeaders = await uploadCsv(session.token, 'duplicates.csv', 'name,name\nA,B\n');
  assert.equal(duplicateHeaders.status, 400);
  assert.match((await duplicateHeaders.json()).message, /duplicate column name/i);

  const unevenRows = await uploadCsv(session.token, 'uneven.csv', 'name,value\nA,1\nB\n');
  assert.equal(unevenRows.status, 400);
  assert.match((await unevenRows.json()).message, /different number of values/i);
});

test('upload rejects files without a CSV filename', async () => {
  const signup = await register('File Type User', 'file-type@example.com');
  const session = await signup.json();
  const response = await uploadCsv(session.token, 'notes.txt', 'name,value\nA,1\n');

  assert.equal(response.status, 400);
  assert.equal((await response.json()).message, 'Only CSV files are allowed.');
});
