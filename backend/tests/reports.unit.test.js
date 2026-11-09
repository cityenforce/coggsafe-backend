const sosService = require('../src/modules/sos/sos.service');
const Sos = require('../src/modules/sos/sos.model');
const { ROLES } = require('../src/constants/roles');
const { SOS_STATUS, COMPONENT_STATUS } = require('../src/constants/sosConstants');

describe('SOS Reports Service (Unit Tests)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockAdmin = {
    id: '64a000000000000000000001',
    role: ROLES.ADMIN,
    username: 'admin_user',
    email: 'admin@coggsafe.com',
  };

  const mockUser = {
    id: '64a000000000000000000002',
    role: ROLES.USER,
    username: 'regular_user',
    email: 'user@coggsafe.com',
  };

  const sampleSosRecord = {
    _id: '64a000000000000000000099',
    userId: {
      _id: '64a000000000000000000002',
      username: 'regular_user',
      mobileNumber: '+1234567890',
      email: 'user@coggsafe.com',
    },
    collectionId: {
      _id: '64a000000000000000000088',
      name: 'Alpha Team',
      type: 'employees',
    },
    status: SOS_STATUS.ACTIVE,
    emergencyMessage: 'Help needed at construction site',
    createdAt: new Date('2026-11-08T10:00:00.000Z'),
    activatedAt: new Date('2026-11-08T10:00:05.000Z'),
    location: {
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 5.2,
      capturedAt: new Date('2026-11-08T10:00:05.000Z'),
      source: 'GPS',
      status: COMPONENT_STATUS.SUCCESS,
    },
    components: {
      frontImage: { status: COMPONENT_STATUS.SUCCESS, storageRef: 'front.jpg', mimeType: 'image/jpeg' },
      backImage: { status: COMPONENT_STATUS.FAILED, error: 'Camera busy' },
      audio: { status: COMPONENT_STATUS.SUCCESS, storageRef: 'audio.mp4', mimeType: 'audio/mp4' },
      sms: { status: COMPONENT_STATUS.SUCCESS },
      call: { status: COMPONENT_STATUS.SUCCESS },
      email: { status: COMPONENT_STATUS.SUCCESS },
      push: { status: COMPONENT_STATUS.SUCCESS },
    },
  };

  function mockSosFind(returnedRecords = [sampleSosRecord]) {
    const chain = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(returnedRecords),
    };
    return jest.spyOn(Sos, 'find').mockReturnValue(chain);
  }

  it('enforces User isolation: regular user can never query another user records', async () => {
    const findSpy = mockSosFind();
    jest.spyOn(Sos, 'countDocuments').mockResolvedValue(1);

    const query = {
      period: 'daily',
      date: '2026-11-08',
      userId: '64a000000000000000000999', // malicious attempt to access another user's SOS
    };

    const result = await sosService.getSosReports(query, mockUser);

    expect(findSpy).toHaveBeenCalled();
    const appliedFilter = findSpy.mock.calls[0][0];

    // Must strictly equal mockUser.id, NOT the attempted query userId!
    expect(appliedFilter.userId).toBe(mockUser.id);
    expect(result.reportMeta.generatedBy.username).toBe(mockUser.username);
  });

  it('allows Admin to filter by a specific user or query all users', async () => {
    const findSpy = mockSosFind();
    jest.spyOn(Sos, 'countDocuments').mockResolvedValue(1);

    // 1. Admin without userId filter: all users included
    await sosService.getSosReports({ period: 'daily', date: '2026-11-08' }, mockAdmin);
    let appliedFilter = findSpy.mock.calls[0][0];
    expect(appliedFilter.userId).toBeUndefined();

    // 2. Admin with specific userId filter
    await sosService.getSosReports({ period: 'daily', date: '2026-11-08', userId: '64a000000000000000000002' }, mockAdmin);
    appliedFilter = findSpy.mock.calls[1][0];
    expect(appliedFilter.userId).toBe('64a000000000000000000002');
  });

  it('correctly filters by status and dates for Daily reports', async () => {
    const findSpy = mockSosFind();
    jest.spyOn(Sos, 'countDocuments').mockResolvedValue(1);

    await sosService.getSosReports({ period: 'daily', date: '2026-11-08', status: 'active' }, mockAdmin);
    const appliedFilter = findSpy.mock.calls[0][0];

    expect(appliedFilter.status).toBe('active');
    expect(appliedFilter.createdAt.$gte).toBeInstanceOf(Date);
    expect(appliedFilter.createdAt.$lte).toBeInstanceOf(Date);
  });

  it('formats individual SOS report cards with full details', async () => {
    mockSosFind([sampleSosRecord]);
    jest.spyOn(Sos, 'countDocuments').mockResolvedValue(1);

    const result = await sosService.getSosReports({ period: 'daily', date: '2026-11-08' }, mockAdmin);

    expect(result.records).toHaveLength(1);
    const card = result.records[0];

    expect(card.id).toBe(sampleSosRecord._id);
    expect(card.user.name).toBe('regular_user');
    expect(card.user.mobileNumber).toBe('+1234567890');
    expect(card.emergencyMessage).toBe('Help needed at construction site');
    expect(card.location.latitude).toBe(37.7749);
    expect(card.location.longitude).toBe(-122.4194);
    expect(card.location.coordinatesText).toBe('37.774900, -122.419400');
    expect(card.media.frontImage.available).toBe(true);
    expect(card.media.backImage.available).toBe(false);
    expect(card.media.audio.available).toBe(true);
    expect(card.channels.sms).toBe(COMPONENT_STATUS.SUCCESS);
  });
});

