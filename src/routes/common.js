const Express = require('express');
const CommonService = require('../services/common');

const router = Express.Router();
const commonService = new CommonService();

router.get('/ready', (req, res) => {
  res.promise(commonService.calcReady());
});

router.get('/1', (req, res) => {
  throw new Error('This is synchronous error!');
});

module.exports = router;