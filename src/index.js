const express = require('express');
const router = require('./router');

const host = '127.0.0.1';
const port = 7000;

app = express();
app.use('/api', router);
app.listen(port, host, () => console.log(`Server listens http://${host}:${port}/api/court`));

// https://github.com/6pac/SlickGrid?tab=readme-ov-file
// https://stackabuse.com/a-sqlite-tutorial-with-node-js/
// https://habr.com/ru/companies/ruvds/articles/458324/