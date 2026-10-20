import Express from 'express';
const router = Express.Router();

// const StateService = require('../../services/state'), stateService = new StateService();
import Promise from 'bluebird';

router.get('/:id', (req, res) => {
  Promise.all([
    // userService.getById(userId),              // 0
  ])
  .then((promises) => {
    return res.render('tournament/new/rules', {
      id: req.params.id,
    });
  });
});

export default router;