const collectionService = require('./collection.service');
const userService = require('../users/user.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const httpStatus = require('../../constants/httpStatus');

const createCollection = asyncHandler(async (req, res) => {
  const { type, name, emergencyCallNumber } = req.body;
  const collection = await collectionService.createCollection({ type, name, emergencyCallNumber, ownerId: req.user.id });
  ApiResponse.send(res, { statusCode: httpStatus.CREATED, message: 'Collection created', data: { collection } });
});

const listCollections = asyncHandler(async (req, res) => {
  const { items, meta } = await collectionService.listCollections(req.query);
  ApiResponse.send(res, {
    statusCode: httpStatus.OK,
    message: 'Collections retrieved',
    data: { collections: items, meta },
  });

});

const listMyCollections = asyncHandler(async (req, res) => {
  const collections = await collectionService.listMine(req.user.id);
  ApiResponse.send(res, {statusCode: httpStatus.OK, message: 'Your collections retrieved', data: {collections}});
});

const getCollection = asyncHandler(async (req, res) => {
  const collection = await collectionService.getCollectionById(req.params.id);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Collection retrieved', data: { collection } });
});

const deleteCollection = asyncHandler(async (req, res) => {
  await collectionService.deleteCollection(req.params.id);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Collection deleted', data: {} });
});

const updateCollection = asyncHandler(async (req, res) => {
  const { type, name, emergencyCallNumber } = req.body;
  const collection = await collectionService.updateCollection(req.params.id, { type, name, emergencyCallNumber });
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Collection updated', data: { collection } });
});

/**
 * GET /api/collections/:id/users
 * "Manage users inside a collection" is served by reusing
 * user.service.listUsers scoped to this collection, rather than
 * duplicating query/pagination logic here.
 */
const listCollectionUsers = asyncHandler(async (req, res) => {
  await collectionService.getCollectionById(req.params.id); // 404s if the collection doesn't exist
  const { items, meta } = await userService.listUsers({ ...req.query, collectionId: req.params.id });
  ApiResponse.send(res, {
    statusCode: httpStatus.OK,
    message: 'Collection users retrieved',
    data: { users: items, meta },
  });
});

const addCollectionMember = asyncHandler(async (req, res) => {
  const user = await collectionService.addMember(req.params.id, req.params.userId, req.user.id);
  ApiResponse.send(res, {statusCode: httpStatus.OK, message: 'Collection member added', data: {user}});
});

const removeCollectionMember = asyncHandler(async (req, res) => {
  await collectionService.removeMember(req.params.id, req.params.userId, req.user.id);
  ApiResponse.send(res, {statusCode: httpStatus.OK, message: 'Collection member removed', data: {}});
});

const listManagedCollectionUsers = asyncHandler(async (req, res) => {
  const users = await collectionService.listMembers(req.params.id, req.user.id);
  ApiResponse.send(res, {statusCode: httpStatus.OK, message: 'Collection users retrieved', data: {users}});
});

const listCollectionContacts = asyncHandler(async (req, res) => {
  const contacts = await collectionService.listEmergencyContacts(req.params.id, req.user.id);
  ApiResponse.send(res, {statusCode: httpStatus.OK, message: 'Emergency contacts retrieved', data: {contacts}});
});

const addCollectionContact = asyncHandler(async (req, res) => {
  const contact = await collectionService.addEmergencyContact(req.params.id, req.user.id, req.body);
  ApiResponse.send(res, {statusCode: httpStatus.CREATED, message: 'Emergency contact added', data: {contact}});
});

const removeCollectionContact = asyncHandler(async (req, res) => {
  await collectionService.removeEmergencyContact(req.params.id, req.params.contactId, req.user.id);
  ApiResponse.send(res, {statusCode: httpStatus.OK, message: 'Emergency contact removed', data: {}});
});

module.exports = {
  createCollection, listCollections, listMyCollections, getCollection, updateCollection,
  deleteCollection, listCollectionUsers, addCollectionMember, removeCollectionMember,
  listManagedCollectionUsers, listCollectionContacts, addCollectionContact, removeCollectionContact,
};
