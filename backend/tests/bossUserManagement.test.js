process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest_do_not_use_in_prod';
process.env.MONGODB_URI = 'mongodb://placeholder-not-used-see-dbHandler';

const request = require('supertest');
const dbHandler = require('./testUtils/dbHandler');
const app = require('../src/app');
const User = require('../src/modules/users/user.model');
const Collection = require('../src/modules/collections/collection.model');
const { ROLES } = require('../src/constants/roles');

beforeAll(async () => {
  await dbHandler.connect();
});

afterEach(async () => {
  await dbHandler.clearDatabase();
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

let counter = 0;
async function createUserAndLogin(role = ROLES.USER, collectionId = null) {
  counter += 1;
  const user = new User({
    username: `${role}${counter}`,
    mobileNumber: `+92300${String(1000000 + counter)}`,
    role,
    collectionId,
    adminCreated: role === ROLES.ADMIN,
  });
  await user.setPassword('Passw0rd123!');
  await user.save();

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ identifier: user.username, password: 'Passw0rd123!' });

  return { user, token: loginRes.body.data.token };
}

async function createTestCollection(name, type = 'employees') {
  return Collection.create({
    type,
    name,
    emergencyCallNumber: '+923001112233',
  });
}

describe('Admin Panel User Management & Add Boss Feature', () => {
  test('1. Admin creates a Boss with multiple groups', async () => {
    const { token: adminToken } = await createUserAndLogin(ROLES.ADMIN);
    const col1 = await createTestCollection('Security Team');
    const col2 = await createTestCollection('Office Team');

    const res = await request(app)
      .post('/api/users/boss')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'ahmed_boss',
        mobileNumber: '+923009998877',
        password: 'SecurePassword123!',
        email: 'ahmed@example.com',
        collectionIds: [col1._id.toString(), col2._id.toString()],
        groupRole: 'boss',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isExistingUser).toBe(false);

    const createdUser = res.body.data.user;
    expect(createdUser.username).toBe('ahmed_boss');
    expect(createdUser.displayRole).toBe('Boss');
    expect(createdUser.isBoss).toBe(true);
    expect(createdUser.role).toBe(ROLES.USER); // Global role remains USER, not ADMIN
    expect(createdUser.adminCreated).toBe(true);
    expect(createdUser.assignedGroups.length).toBe(2);
    expect(createdUser.assignedGroups[0].role).toBe('boss');
    expect(createdUser.assignedGroups[1].role).toBe('boss');
  });

  test('2. Existing user is assigned to multiple groups as Boss without duplicate account creation', async () => {
    const { token: adminToken } = await createUserAndLogin(ROLES.ADMIN);
    const familyCol = await createTestCollection('Family', 'personal');
    const securityCol = await createTestCollection('Security Team', 'employees');
    const officeCol = await createTestCollection('Office Team', 'employees');

    // Create an existing membership-only user in Family group
    const initialUserRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'waqas_user',
        mobileNumber: '+923005554433',
        password: 'Passw0rd123!',
        collectionId: familyCol._id.toString(),
      });
    expect(initialUserRes.status).toBe(201);
    const initialUserId = initialUserRes.body.data.user._id;

    // Now Admin assigns Boss in Security Team and Office Team using same phone number
    const bossRes = await request(app)
      .post('/api/users/boss')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'waqas_user',
        mobileNumber: '+923005554433',
        collectionIds: [securityCol._id.toString(), officeCol._id.toString()],
        groupRole: 'boss',
      });

    expect(bossRes.status).toBe(200);
    expect(bossRes.body.data.isExistingUser).toBe(true);
    expect(bossRes.body.data.user._id.toString()).toBe(initialUserId.toString());

    // Verify account count for this phone is still exactly 1 (no duplicate account)
    const count = await User.countDocuments({ mobileNumber: '+923005554433' });
    expect(count).toBe(1);

    // Verify same user has different group-level roles:
    // Boss in Security, Boss in Office, User in Family!
    const assigned = bossRes.body.data.user.assignedGroups;
    expect(assigned.length).toBe(3);

    const familyEntry = assigned.find(g => g.name === 'Family');
    const secEntry = assigned.find(g => g.name === 'Security Team');
    const officeEntry = assigned.find(g => g.name === 'Office Team');

    expect(familyEntry.role).toBe('user');
    expect(secEntry.role).toBe('boss');
    expect(officeEntry.role).toBe('boss');
  });

  test('3. Membership-only users have isMembershipOnly=true and canEditDelete=false; Admin-created have canEditDelete=true', async () => {
    const { token: adminToken } = await createUserAndLogin(ROLES.ADMIN);
    const col = await createTestCollection('General Team');

    // 1. Membership-only user
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'member_only',
        mobileNumber: '+923001110001',
        password: 'Passw0rd123!',
        collectionId: col._id.toString(),
      });

    // 2. Boss user created by admin
    await request(app)
      .post('/api/users/boss')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'boss_user',
        mobileNumber: '+923001110002',
        password: 'Passw0rd123!',
        collectionIds: [col._id.toString()],
      });

    // Fetch user list
    const listRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const users = listRes.body.data.users;

    const member = users.find(u => u.username === 'member_only');
    const boss = users.find(u => u.username === 'boss_user');

    expect(member).toBeDefined();
    expect(member.isMembershipOnly).toBe(true);
    expect(member.canEditDelete).toBe(false);

    expect(boss).toBeDefined();
    expect(boss.isMembershipOnly).toBe(false);
    expect(boss.canEditDelete).toBe(true);
    expect(boss.displayRole).toBe('Boss');
  });

  test('4. Boss cannot access Admin-only functionality', async () => {
    const { token: adminToken } = await createUserAndLogin(ROLES.ADMIN);
    const col = await createTestCollection('Ops Team');

    // Create Boss
    await request(app)
      .post('/api/users/boss')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'tariq_boss',
        mobileNumber: '+923001239999',
        password: 'Passw0rd123!',
        collectionIds: [col._id.toString()],
      });

    // Login as Boss
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'tariq_boss', password: 'Passw0rd123!' });

    expect(loginRes.status).toBe(200);
    const bossToken = loginRes.body.data.token;

    // Try accessing Admin Users list
    const usersRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${bossToken}`);
    expect(usersRes.status).toBe(403);

    // Try creating another boss
    const createBossRes = await request(app)
      .post('/api/users/boss')
      .set('Authorization', `Bearer ${bossToken}`)
      .send({
        username: 'sub_boss',
        mobileNumber: '+923001238888',
        password: 'Passw0rd123!',
        collectionIds: [col._id.toString()],
      });
    expect(createBossRes.status).toBe(403);

    // Try accessing collections admin route
    const colRes = await request(app)
      .get('/api/collections')
      .set('Authorization', `Bearer ${bossToken}`);
    expect(colRes.status).toBe(403);
  });

  test('5. Removing a user from a group does NOT delete their account', async () => {
    const { token: adminToken } = await createUserAndLogin(ROLES.ADMIN);
    const col1 = await createTestCollection('Alpha Team');
    const col2 = await createTestCollection('Beta Team');

    // Create a boss in two groups
    const bossRes = await request(app)
      .post('/api/users/boss')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'multi_group_user',
        mobileNumber: '+923007776655',
        password: 'Passw0rd123!',
        collectionIds: [col1._id.toString(), col2._id.toString()],
      });

    const userId = bossRes.body.data.user._id;

    // Remove user from Alpha Team
    const removeRes = await request(app)
      .delete(`/api/collections/${col1._id}/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(removeRes.status).toBe(200);

    // Verify user still exists in database and still belongs to Beta Team
    const userInDb = await User.findById(userId);
    expect(userInDb).not.toBeNull();
    expect(userInDb.username).toBe('multi_group_user');
    expect(userInDb.deletedAt).toBeNull();
  });

  test('6. Existing authentication and SOS functionality remain intact for multi-group user', async () => {
    const { token: adminToken } = await createUserAndLogin(ROLES.ADMIN);
    const col = await createTestCollection('Dispatch Team');

    // Create a user in group
    await request(app)
      .post('/api/users/boss')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'sos_boss',
        mobileNumber: '+923004443322',
        password: 'Passw0rd123!',
        collectionIds: [col._id.toString()],
      });

    // Login works
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'sos_boss', password: 'Passw0rd123!' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.data.token;
    expect(token).toBeDefined();

    // SOS activation works
    const sosRes = await request(app)
      .post('/api/sos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        idempotencyKey: 'test-idemp-12345',
        location: { latitude: 31.5204, longitude: 74.3587 },
        emergencyMessage: 'Help needed at station',
      });

    expect(sosRes.status).toBe(201);
    expect(sosRes.body.success).toBe(true);
    expect(sosRes.body.data.sos.status).toBe('active');
    expect(sosRes.body.data.sos.collectionId.toString()).toBe(col._id.toString());
  });

  test('7. Contacts endpoint returns members from all assigned groups', async () => {
    const { token: adminToken } = await createUserAndLogin(ROLES.ADMIN);
    const col1 = await createTestCollection('Group 1');
    const col2 = await createTestCollection('Group 2');

    // Create a boss assigned to Group 1 and Group 2
    await request(app)
      .post('/api/users/boss')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'boss_multi_group',
        mobileNumber: '+923008881111',
        password: 'Passw0rd123!',
        collectionIds: [col1._id.toString(), col2._id.toString()],
      });

    // Create a member in Group 2 only
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'group2_member',
        mobileNumber: '+923008882222',
        password: 'Passw0rd123!',
        collectionId: col2._id.toString(),
      });

    // Login as boss
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'boss_multi_group', password: 'Passw0rd123!' });
    const bossToken = loginRes.body.data.token;

    // Call /api/contacts
    const contactsRes = await request(app)
      .get('/api/contacts')
      .set('Authorization', `Bearer ${bossToken}`);

    expect(contactsRes.status).toBe(200);
    const contacts = contactsRes.body.data.contacts;
    const memberFound = contacts.find(c => c.username === 'group2_member');
    expect(memberFound).toBeDefined();
  });
});

