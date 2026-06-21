const express = require('express');
const router = express.Router();
const queryController = require('../controllers/queryController');
const validator = require('../middlewares/validator');


router.post('/chat', validator.validateChatRequest, queryController.chat);
router.post('/analyze', validator.validateQueryRequest, queryController.analyzeSql);
router.post('/nlp-to-sql', validator.validateNLPRequest, queryController.nlpToSqlEndpoint);
router.post('/suggest', validator.validateNLPRequest, queryController.suggestQuery);
router.post('/explain-simple', validator.validateQueryRequest, queryController.explainSimpleEndpoint);
router.post('/optimize', validator.validateQueryRequest, queryController.optimizeSql);
router.post('/quality', validator.validateQueryRequest, queryController.codeQualityEndpoint);
router.post('/classify', validator.validateQueryRequest, queryController.classifySql);
router.post('/tables-info', validator.validateQueryRequest, queryController.tablesInfo);
router.post('/industry-sql', validator.validateNLPRequest, queryController.industryStandard);
router.post('/execute', validator.validateQueryRequest, queryController.executeSql);

module.exports = router;
