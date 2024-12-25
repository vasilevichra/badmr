const Express = require('express');
const CommonService = require('../services/common');

const router = Express.Router();
const commonService = new CommonService();

router.get('/ready/:tournament_id', (req, res) => {
  res.promise(commonService.calcReady(req.params.tournament_id));
});

module.exports = router;