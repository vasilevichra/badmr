const Express = require('express');
const UserService = require('../services/user');

const router = Express.Router();
const userService = new UserService();

router.get('/archived', (req, res) => {
  res.promise(userService.getArchived());
});

router.post('/archive/:id', (req, res) => {
  res.promise(userService.archive(req.params.id));
});

router.post('/archive', (req, res) => {
  res.promise(userService.archiveAll());
});

router.post('/unarchive/:id', (req, res) => {
  res.promise(userService.unarchive(req.params.id));
});

router.post('/unarchive', (req, res) => {
  res.promise(userService.unarchiveAll());
});

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