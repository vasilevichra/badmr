const Express = require('express');
const UserService = require('../services/user');

const router = Express.Router();
const userService = new UserService();

router.get('/', (req, res) => {
  res.promise(userService.getAll());
});

router.get('/:id', (req, res) => {
  res.promise(userService.getById(req.params.id));
});

module.exports = router;