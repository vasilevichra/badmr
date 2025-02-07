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

router.post('/register', (req, res) => {
  res.promise(userService.registerAll());
});

router.post('/register/:id', (req, res) => {
  res.promise(userService.registerById(req.params.id));
});

router.post('/deregister', (req, res) => {
  res.promise(userService.deregisterAll());
});

router.post('/deregister/:id', (req, res) => {
  res.promise(userService.deregisterById(req.params.id));
});

module.exports = router;