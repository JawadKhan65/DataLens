process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'datalens-test-secret-with-more-than-32-characters';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const createApp = require('../src/app');
const readConfig = require('../src/config');
const User = require('../src/models/User');
const Dataset = require('../src/models/Dataset');

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
  const responses = await Promise.all([
    register('Duplicate Test', 'duplicate@example.com'),
    register('Duplicate Test', 'DUPLICATE@example.com'),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  const conflict = responses.find((response) => response.status === 409);
  assert.deepEqual(await conflict.json(), { message: 'An account with this email already exists.' });
});

test('dataset rename enforces the same 100-character limit on the server', async () => {
  const signup = await register('Rename Test User', 'rename@example.com');
  const session = await signup.json();
  const user = await User.findOne({ email: session.user.email });
  const dataset = await Dataset.create({ userId: user._id, name: 'original.csv', originalName: 'original.csv' });
  const headers = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };

  const tooLong = await fetch(`${baseUrl}/api/datasets/${dataset.id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ name: 'x'.repeat(101) }),
  });
  assert.equal(tooLong.status, 400);
  assert.match((await tooLong.json()).message, /100 characters or fewer/i);

  const validRename = await fetch(`${baseUrl}/api/datasets/${dataset.id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ name: '  renamed.csv  ' }),
  });
  assert.equal(validRename.status, 200);
  assert.equal((await validRename.json()).name, 'renamed.csv');
});

test('server config validates production requirements and port numbers', () => {
  assert.deepEqual(readConfig({ NODE_ENV: 'development' }), {
    port: 5000,
    mongodbUri: '',
    isProduction: false,
  });
  assert.throws(() => readConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) }), /MONGODB_URI/);
  assert.throws(() => readConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://localhost/app', JWT_SECRET: 'short' }), /JWT_SECRET/);
  assert.throws(() => readConfig({ PORT: '70000' }), /PORT/);
  assert.deepEqual(readConfig({
    NODE_ENV: 'production',
    PORT: '8080',
    MONGODB_URI: 'mongodb://localhost/app',
    JWT_SECRET: 'a-valid-production-secret-with-more-than-32-characters',
  }), {
    port: 8080,
    mongodbUri: 'mongodb://localhost/app',
    isProduction: true,
  });
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

test('the owner can list, open, rename, and delete a saved dataset with accurate totals', async () => {
  const signup = await register('Dataset Owner', 'dataset-owner@example.com');
  const session = await signup.json();
  const user = await User.findOne({ email: session.user.email });
  const dataset = await Dataset.create({
    userId: user._id,
    name: 'owner-data.csv',
    originalName: 'owner-data.csv',
    rowCount: 12,
    columnCount: 2,
    preview: [{ name: 'A', value: 3 }],
  });
  const headers = { Authorization: `Bearer ${session.token}` };

  const listResponse = await fetch(`${baseUrl}/api/datasets`, { headers });
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.equal(list.total, 1);
  assert.equal(list.totalDatasets, 1);
  assert.equal(list.totalRows, 12);

  const openResponse = await fetch(`${baseUrl}/api/datasets/${dataset.id}`, { headers });
  assert.equal(openResponse.status, 200);
  assert.equal((await openResponse.json()).preview.length, 1);

  const renameResponse = await fetch(`${baseUrl}/api/datasets/${dataset.id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'renamed-owner-data.csv' }),
  });
  assert.equal(renameResponse.status, 200);
  assert.equal((await renameResponse.json()).name, 'renamed-owner-data.csv');

  const deleteResponse = await fetch(`${baseUrl}/api/datasets/${dataset.id}`, {
    method: 'DELETE', headers,
  });
  assert.equal(deleteResponse.status, 200);
  assert.equal(await Dataset.findById(dataset.id), null);

  const emptyListResponse = await fetch(`${baseUrl}/api/datasets`, { headers });
  const emptyList = await emptyListResponse.json();
  assert.equal(emptyList.totalDatasets, 0);
  assert.equal(emptyList.totalRows, 0);
});

test('dataset listing searches, sorts, and paginates while keeping account totals accurate', async () => {
  const signup = await register('Listing Test User', 'listing@example.com');
  const session = await signup.json();
  const user = await User.findOne({ email: session.user.email });
  await Dataset.create([
    { userId: user._id, name: 'alpha.csv', originalName: 'alpha.csv', rowCount: 3 },
    { userId: user._id, name: 'beta.csv', originalName: 'beta.csv', rowCount: 8 },
    { userId: user._id, name: 'gamma.csv', originalName: 'gamma.csv', rowCount: 5 },
  ]);
  const headers = { Authorization: `Bearer ${session.token}` };

  const pageResponse = await fetch(`${baseUrl}/api/datasets?page=2&limit=2&sort=nameAsc`, { headers });
  assert.equal(pageResponse.status, 200);
  const page = await pageResponse.json();
  assert.deepEqual(page.items.map((item) => item.name), ['gamma.csv']);
  assert.equal(page.total, 3);
  assert.equal(page.page, 2);
  assert.equal(page.pageCount, 2);
  assert.equal(page.totalDatasets, 3);
  assert.equal(page.totalRows, 16);

  const searchResponse = await fetch(`${baseUrl}/api/datasets?search=BET&sort=rowsDesc`, { headers });
  assert.equal(searchResponse.status, 200);
  const search = await searchResponse.json();
  assert.deepEqual(search.items.map((item) => item.name), ['beta.csv']);
  assert.equal(search.total, 1);
  assert.equal(search.totalDatasets, 3);
  assert.equal(search.totalRows, 16);
});

test('health endpoint reports connected and unavailable database states', async () => {
  const healthy = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), {
    status: 'ok',
    database: 'connected',
    message: 'DataLens API is running',
  });

  const offlineServer = createApp({ databaseConnection: { readyState: 0 } }).listen(0);
  await new Promise((resolve, reject) => {
    offlineServer.once('listening', resolve);
    offlineServer.once('error', reject);
  });
  try {
    const offline = await fetch(`http://127.0.0.1:${offlineServer.address().port}/api/health`);
    assert.equal(offline.status, 503);
    const body = await offline.json();
    assert.equal(body.status, 'degraded');
    assert.equal(body.database, 'unavailable');
  } finally {
    await new Promise((resolve) => offlineServer.close(resolve));
  }
});
