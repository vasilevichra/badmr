"use strict";
const app = require('../../app');
const http = require('http');

const host = process.env.HOST || '127.0.0.1';
const port = process.env.PORT || 3000;

const server = http.createServer(app);
server.listen(port, host, () => console.log(`Server listens http://${host}:${port}/api/common/ready`));