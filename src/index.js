const http = require('http');
const Service = require('./service')

function main() {
  const service = new Service();
  service.calcReady()
  .catch((err) => {
    console.log('Error: ')
    console.log(JSON.stringify(err))
  });
}

const server = http.createServer((req, res) => {
  res.write('>>>>>')
  res.end()
})

server.listen(3000, () => {
  main()
  console.log('Server running on port 3000');
});


// https://www.npmjs.com/package/@whtsky/vue-good-table?activeTab=readme
// https://stackabuse.com/a-sqlite-tutorial-with-node-js/
// https://habr.com/ru/companies/ruvds/articles/458324/