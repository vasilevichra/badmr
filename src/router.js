const router = require('express-promise-json-router')();
const Service = require('./service');
const service = new Service();
router.route('/court')
.get((req, res) => {
  return service.getAvailableCourts()
  .catch((err) => {
    console.log('Error: ')
    console.log(JSON.stringify(err))
  });
})
.post((req, res) => {
})
.put((req, res) => {
})
.delete((req, res) => {
});

module.exports = router;