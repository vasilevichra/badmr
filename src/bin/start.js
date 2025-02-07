"use strict";
const app = require('../../app');
const http = require('http');

const host = process.env.HOST || 'localhost';
const port = process.env.PORT || 3000;

http
.createServer(app)
.listen(port, host, () => console.log(`Server listens http://${host}:${port}/`));