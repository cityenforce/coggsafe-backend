import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text, TouchableOpacity, TextInput} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

const AdminUsersScreen = require('../src/screens/admin/AdminUsersScreen').default;

const mockListUsers = jest.fn();
const mockListCollections = jest.fn();
const mockCreateOrAssignBoss = jest.fn();
const mockDeleteUser = jest.fn();

jest.mock('../src/api/resources', () => ({
  listUsers: (...args) => mockListUsers(...args),
  listCollections: (...args) => mockListCollections(...args),
  createOrAssignBoss: (...args) => mockCreateOrAssignBoss(...args),
  deleteUser: (...args) => mockDeleteUser(...args),
  updateUser: jest.fn(),
  setUserPassword: jest.fn(),
}));

const mockUsersData = [
  {
    id: 'user-1',
    _id: 'user-1',
    username: 'ahmed_boss',
    mobileNumber: '+923001234567',
    email: 'ahmed@example.com',
    status: 'active',
    role: 'user',
    displayRole: 'Boss',
    isBoss: true,
    adminCreated: true,
    canEditDelete: true,
    isMembershipOnly: false,
    assignedGroups: [
      {id: 'col-1', name: 'Security Team', role: 'boss'},
      {id: 'col-2', name: 'Office Team', role: 'boss'},
    ],
  },
  {
    id: 'user-2',
    _id: 'user-2',
    username: 'fatima_member',
    mobileNumber: '+923009876543',
    email: null,
    status: 'active',
    role: 'user',
    displayRole: 'User',
    isBoss: false,
    adminCreated: false,
    canEditDelete: false,
    isMembershipOnly: true,
    assignedGroups: [
      {id: 'col-3', name: 'Family Group', role: 'user'},
    ],
  },
];

const mockCollectionsData = [
  {id: 'col-1', _id: 'col-1', name: 'Security Team', type: 'employees'},
  {id: 'col-2', _id: 'col-2', name: 'Office Team', type: 'employees'},
  {id: 'col-3', _id: 'col-3', name: 'Family Group', type: 'personal'},
];

describe('AdminUsersScreen Component Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListUsers.mockResolvedValue({users: mockUsersData});
    mockListCollections.mockResolvedValue({collections: mockCollectionsData});
  });

  const renderScreen = async () => {
    let renderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={{insets: {top: 0, right: 0, bottom: 0, left: 0}, frame: {x: 0, y: 0, width: 360, height: 740}}}>
          <AdminUsersScreen
            token="test-admin-token"
            onBack={jest.fn()}
            onUserDetail={jest.fn()}
            currentAdmin={{username: 'AdminUser'}}
          />
        </SafeAreaProvider>
      );
    });

    await ReactTestRenderer.act(async () => {
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
    });

    return renderer;
  };

  test('renders user list with username, mobile, display role, and assigned groups', async () => {
    const renderer = await renderScreen();
    const textNodes = renderer.root.findAllByType(Text);
    const allText = textNodes.map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children || ''))).join(' ');

    expect(allText).toContain('User Management');
    expect(allText).toContain('Add Boss');
    expect(allText).toContain('ahmed_boss');
    expect(allText).toContain('fatima_member');
    expect(allText).toContain('+923001234567');
    expect(allText).toContain('+923009876543');
    expect(allText).toContain('Security Team (Boss)');
    expect(allText).toContain('Family Group (User)');
  });

  test('membership-only users show "Managed in Groups" with NO Edit or Delete buttons', async () => {
    const renderer = await renderScreen();
    const textNodes = renderer.root.findAllByType(Text);
    const allText = textNodes.map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children || ''))).join(' ');

    expect(allText).toContain('Managed in Groups');

    // Ahmed (boss, canEditDelete=true) has Edit and Delete buttons
    const editAhmed = renderer.root.findAll(el => el.type === TouchableOpacity && el.props.accessibilityLabel === 'Edit ahmed_boss');
    const deleteAhmed = renderer.root.findAll(el => el.type === TouchableOpacity && el.props.accessibilityLabel === 'Delete ahmed_boss');
    expect(editAhmed.length).toBe(1);
    expect(deleteAhmed.length).toBe(1);

    // Fatima (membership-only, canEditDelete=false) has NO Edit and NO Delete buttons
    const editFatima = renderer.root.findAll(el => el.type === TouchableOpacity && el.props.accessibilityLabel === 'Edit fatima_member');
    const deleteFatima = renderer.root.findAll(el => el.type === TouchableOpacity && el.props.accessibilityLabel === 'Delete fatima_member');
    expect(editFatima.length).toBe(0);
    expect(deleteFatima.length).toBe(0);
  });

  test('search filter works by group name', async () => {
    const renderer = await renderScreen();
    const searchInputs = renderer.root.findAllByType(TextInput);
    expect(searchInputs.length).toBeGreaterThan(0);

    // Filter by 'Security'
    await ReactTestRenderer.act(async () => {
      searchInputs[0].props.onChangeText('Security');
    });

    const textNodes = renderer.root.findAllByType(Text);
    const allText = textNodes.map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children || ''))).join(' ');

    expect(allText).toContain('ahmed_boss');
    expect(allText).not.toContain('fatima_member');
  });

  test('filter tab for Bosses displays only Boss users', async () => {
    const renderer = await renderScreen();
    const touchables = renderer.root.findAllByType(TouchableOpacity);

    // Find the Bosses filter button
    const bossFilterBtn = touchables.find(t => {
      const texts = t.findAllByType(Text);
      return texts.some(tx => tx.props.children === 'Bosses');
    });

    expect(bossFilterBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      bossFilterBtn.props.onPress();
    });

    const textNodes = renderer.root.findAllByType(Text);
    const allText = textNodes.map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children || ''))).join(' ');

    expect(allText).toContain('ahmed_boss');
    expect(allText).not.toContain('fatima_member');
  });
});
