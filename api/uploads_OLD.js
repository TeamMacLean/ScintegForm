import cors from 'cors';
import fileUpload from 'express-fileupload';
import tus from 'tus-node-server';
import _path from 'path';
import express from 'express';

const UPLOAD_PATH = _path.join(process.cwd(), 'jeff');

const tusServer = new tus.Server();

tusServer.datastore = new tus.FileStore({
  // directory: UPLOAD_PATH,
  // this uploads the file temporarily locally
  // on form submission we will move this temp file to actual upload location
  path: '/temporary_uploads',
  //relativeLocation: true,
});

console.log('tusserver', tusServer.options, tusServer, Object.keys(tusServer));

tusServer.on('*', (event) => {
  console.log('EVENT!', event);
});
tusServer.on(tus.EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
  // Fired when a PATCH request finishes writing the file
  console.log('EVENT_UPLOAD_COMPLETE', event);
});

tusServer.on(tus.EVENTS.EVENT_FILE_CREATED, (event) => {
  console.log('EVENT_FILE_CREATED', event);
});
tusServer.on(tus.EVENTS.EVENT_ENDPOINT_CREATED, (event) => {
  console.log('EVENT_ENDPOINT_CREATED', event);
});

const HEADERS = [
  'Authorization',
  'Content-Type',
  'Location',
  'Tus-Extension',
  'Tus-Max-Size',
  'Tus-Resumable',
  'Tus-Version',
  'Upload-Defer-Length',
  'Upload-Length',
  'Upload-Metadata',
  'Upload-Offset',
  'X-Requested-With',
  // 'Access-Control-Allow-Methods',
  // 'Access-Control-Allow-Origin',
  // 'Access-Control-Allow-Credentials',
  // 'Access-Control-Allow-Headers',
  //'X-HTTP-Method-Override',
];

const EXPOSED_HEADERS = HEADERS.join(', ');
var corsOptions = {
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
  exposedHeaders: EXPOSED_HEADERS,
};

const app = express();
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// handle CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, OPTIONS, PUT, PATCH, DELETE'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Origin, Content-Type, Accept'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

app.all('*', function (req, res, next) {
  tusServer.handle.bind(tusServer)(req, res, next);
});

module.exports = app;
