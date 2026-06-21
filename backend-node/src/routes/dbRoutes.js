const express = require('express');
const router = express.Router();
const dbController = require('../controllers/dbController');
const validator = require('../middlewares/validator');


router.post('/connect', validator.validateDbConnectRequest, dbController.dbConnect);
router.get('/schema', dbController.dbSchema);
router.get('/status', dbController.dbStatus);

module.exports = router;
