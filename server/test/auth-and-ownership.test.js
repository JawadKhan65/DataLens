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
