const Express = require('express'), router = Express.Router();
const GroupService = require('../services/group'), groupService = new GroupService();

router.get('/', (req, res) => {
  res.promise(groupService.getAll());
});

router.get('/select', (req, res) => {
  res.promise(groupService.select().then(g => ({results: g})));
});

module.exports = router;
