import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import ldap from './ldap';
import _ from 'lodash';
import multer from 'multer';
//import fileUpload from 'express-fileupload';
import getEmailOptions from '../modules/getEmailOptions';
import sendEmail from '../modules/sendEmail';

// OLD
//import uploadApp from './uploads_OLD';

import { Form, Admin } from './models';

try {
  mongoose.connect('mongodb://localhost:27017/scintegform', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
    useCreateIndex: true,
  });
} catch (err) {
  console.error(err);
}

// Replace update() with updateOne(), updateMany(), or replaceOne()
// Replace remove() with deleteOne() or deleteMany().
// Replace count() with countDocuments(), unless you want to count how many documents are in the whole collection (no filter). In the latter case, use estimatedDocumentCount().

const ObjectId = mongoose.Types.ObjectId;

String.prototype.toObjectId = function () {
  return new ObjectId(this.toString());
};

// Create express router
const router = express.Router();

// Transform req & res to have the same API as express
// So we can use res.status() & res.json()
const app = express();
//app.use(fileUpload());
router.use((req, res, next) => {
  Object.setPrototypeOf(req, app.request);
  Object.setPrototypeOf(res, app.response);
  req.res = res;
  res.req = req;
  next();
});

const upload = multer({
  dest: 'uploads/',
  //fileFilter,
  limits: {
    fileSize: 100000000, // 100MB
    files: 100,
  },
});

/**
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  if (!allowedTypes.includes(file.mimetype)) {
    const error = new Error('Invalid file type');
    error.code = 'LIMIT_FILE_TYPES';
    return cb(error, false);
  }
};
*/
// middleware for file upload
app.use(function (err, req, res, next) {
  if (err.code === 'LIMIT_FILE_TYPES') {
    res.send({
      status: 422,
      error: 'Only images are allowed',
    });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    res.send({
      status: 422,
      error: 'Allowed maximum individual file size is 100MB',
    });
  }
});

const JWT_SECRET = process.env.JWT_SECRET;

async function sign(user) {
  return jwt.sign(user, JWT_SECRET);
}

//AUTH

const getUserFromReqHeaders = (req) => {
  if (!req || !req.headers) {
    return null;
  }
  const authVerificationStr =
    req.headers.authorization && req.headers.authorization.length
      ? req.headers.authorization.split(' ')[1]
      : null;
  const cookieVerificationStr =
    req.headers.cookie && req.headers.cookie.length
      ? req.headers.cookie.split('Bearer%20')[1]
      : null;

  const token = authVerificationStr || cookieVerificationStr || null;

  if (!token) {
    return null;
  }
  const user = jwt.verify(token, JWT_SECRET);
  return user;
};

router.get('/user', async (req, res) => {
  const user = getUserFromReqHeaders(req);

  if (!user) {
    return res.status(401).json({
      error: 'Unauthorised',
    });
  } else {
    return res.status(200).json({ user });
  }
});

// Add POST - /api/login
router.post('/login', async (req, res) => {
  if (req.body && req.body.username && req.body.password) {
    // George, do ntalbot/george/debbie filtering here AND in the frontend
    // TODO

    ldap
      .authenticate(req.body.username, req.body.password)
      .then(async (user) => {
        const signObj = {
          username: req.body.username,
          // name: user.displayName,
        };

        sign(signObj)
          .then((token) => {
            res.status(200).json({ token: token });
          })
          .catch((err) => {
            res.status(500).json({ error: err });
          });
      })
      .catch((err) => {
        res.status(401).json({ message: 'Bad credentials: ' + err });
      });
  } else {
    res.status(401).json({ message: 'Incomplete credentials' });
  }
});

router.get('/logout', (req, res) => {
  res.sendStatus(200);
});
router.post('/logout', (req, res) => {
  res.sendStatus(200);
});

// OLD
// router.post('/uploads', uploadApp);
router.post(
  '/upload',
  // this adds file metadata to req object
  upload.single('file' /** appended to FormData obj */),
  (req, res) => {
    // https://github.com/kylefarris/clamscan#to-use-local-binary-method-of-scanning

    const { file } = req.body;

    res.send({
      status: 200,
      file,
    });
  }
);

const getFinalPath = (path) => {
  return path + '_FINAL';
};

router.post('/form/new', upload.array('files'), async (req, res) => {
  try {
    // Create new form

    const newFormData = {
      description: req.body.description,
      files: req.files.map((f) => ({
        name: f.originalname,
        size: f.size,
        mimetype: f.mimetype,
        initialPath: f.path,
        finalPath: getFinalPath(f.path),
      })),
    };

    const formResult = await Form.create(newFormData);

    // Move files to correct folder
    // TODO

    // correct email Options object for sendEmail
    // TODO
    // const emailOptions = {};

    //const emailResult = await sendEmail(emailOptions);

    res.send({ status: 200 });
  } catch (error) {
    console.log('error', error);
    res.send({ status: 500, error: error });
  }
});

// OLD
router.post('/uploads', upload.array('files'), (req, res) => {
  console.log('req.files', req.files);
  console.log('req.body.des', req.body.description);

  res.send({
    status: 200,
  });
});

// Export the server middleware
export default {
  path: '/api',
  handler: router,
};
