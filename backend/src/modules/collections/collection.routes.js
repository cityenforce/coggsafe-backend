const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validateRequest = require('../../middlewares/validateRequest');
const { ROLES } = require('../../constants/roles');
const {
  createCollectionValidation,
  updateCollectionValidation,
  collectionIdParamValidation,
  listCollectionsValidation,
  listCollectionUsersValidation,
  addRemoveMemberValidation,
  contactValidation,
  removeContactValidation,
} = require('./collection.validation');
const collectionController = require('./collection.controller');

const router = express.Router();

router.use(authenticate);

// Available to every authenticated user for active-group selection.
router.get('/mine', collectionController.listMyCollections);

// Management routes are Boss/Admin-only.
router.use(authorize(ROLES.ADMIN));

router.post('/', createCollectionValidation, validateRequest, collectionController.createCollection);
router.get('/', listCollectionsValidation, validateRequest, collectionController.listCollections);
router.get('/:id', collectionIdParamValidation, validateRequest, collectionController.getCollection);
router.patch('/:id', updateCollectionValidation, validateRequest, collectionController.updateCollection);
router.delete('/:id', collectionIdParamValidation, validateRequest, collectionController.deleteCollection);
router.get('/:id/users', listCollectionUsersValidation, validateRequest, collectionController.listCollectionUsers);
router.post('/:id/members/:userId', addRemoveMemberValidation, validateRequest, collectionController.addCollectionMember);
router.delete('/:id/members/:userId', addRemoveMemberValidation, validateRequest, collectionController.removeCollectionMember);
router.get('/:id/members', collectionIdParamValidation, validateRequest, collectionController.listManagedCollectionUsers);
router.get('/:id/contacts', collectionIdParamValidation, validateRequest, collectionController.listCollectionContacts);
router.post('/:id/contacts', contactValidation, validateRequest, collectionController.addCollectionContact);
router.delete('/:id/contacts/:contactId', removeContactValidation, validateRequest, collectionController.removeCollectionContact);

module.exports = router;
