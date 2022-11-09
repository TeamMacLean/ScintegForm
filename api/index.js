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

import {
  Form,
  Group,
  Specie,
  Genotype,
  VectorSelection,
  TdnaSelection,
  AgroStrain,
  Admin,
} from './models';

try {
  mongoose.connect('mongodb://localhost:27017/transplantform', {
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
    fileSize: 10000000000, // 10GB
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
      error: 'Allowed maximum individual file size is 10GB',
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
    ldap
      .authenticate(req.body.username, req.body.password)
      .then(async (user) => {
        let reqBodyUsername = req.body.username;
        let userMemberOf = user.memberOf;
        let userDisplayName = user.displayName;

        // This is where you alter the roles for testing
        if (
          (req.body.username === 'pikej' || req.body.username === 'deeks') &&
          req.body.radio
        ) {
          const radioValue = req.body.radio;
          if (radioValue === 'jjones') {
            reqBodyUsername = 'jjones';
            userMemberOf = [
              'CN=TSL-Data-Jonathan-Jones,OU=TSLGroups,OU=NBIGroups,DC=nbi,DC=ac,DC=uk',
              'CN=slproj_23_modify,OU=TSLGroups,OU=NBIGroups,DC=nbi,DC=ac,DC=uk',
            ];
            userDisplayName = 'Jonathan Jones (FAKE)';
          }
          if (radioValue === 'alam') {
            reqBodyUsername = 'alam';
            userMemberOf = [
              'CN=TSL-Data-Jonathan-Jones,OU=TSLGroups,OU=NBIGroups,DC=nbi,DC=ac,DC=uk',
              'CN=slproj_23_modify,OU=TSLGroups,OU=NBIGroups,DC=nbi,DC=ac,DC=uk',
            ];
            userDisplayName = 'Maheen Alam (FAKE)';
          }
          if (radioValue === 'heal') {
            reqBodyUsername = 'heal';
            userMemberOf = [
              'CN=TSL-Data-Jonathan-Jones,OU=TSLGroups,OU=NBIGroups,DC=nbi,DC=ac,DC=uk',
              'CN=slproj_23_modify,OU=TSLGroups,OU=NBIGroups,DC=nbi,DC=ac,DC=uk',
            ];
            userDisplayName = 'Robert Heal (FAKE)';
          }
        }

        const adminDocs = await Admin.find({}).sort({ date: 'descending' });
        const admins = adminDocs
          .filter((admin) => !admin.archived)
          .map((admin) => admin.name);
        const userIsAdmin = admins.includes(reqBodyUsername);

        const allLdapGroups = await Group.find({}).sort({ date: 'descending' });
        const isGroupLeaderForObj =
          allLdapGroups.find((group) => group.username === reqBodyUsername) ||
          null;
        const isResearchAssistantForObj =
          allLdapGroups.find((group) => {
            group.researchAssistants.includes(reqBodyUsername);
            const res = group.researchAssistants.includes(reqBodyUsername);
            return res;
          }) || null;
        const isResearchAssistantFor = isResearchAssistantForObj
          ? isResearchAssistantForObj.name
          : null;

        let signatories = [];
        if (userIsAdmin) {
          signatories = allLdapGroups;
        } else if (isGroupLeaderForObj) {
          signatories = [isGroupLeaderForObj];
        } else if (isResearchAssistantFor) {
          signatories = [isResearchAssistantForObj];
        } else {
          userMemberOf.forEach((ldapGroupStr) => {
            allLdapGroups.forEach((ldapGroup) => {
              const alreadySignatoryUsernames = signatories.map(
                (signatory) => signatory.username
              );
              if (
                ldapGroup.ldapGroups.includes(ldapGroupStr) &&
                !alreadySignatoryUsernames.includes(ldapGroup.username)
              ) {
                signatories.push(ldapGroup);
              }
            });
          });
        }
        const abridgedSignatories = signatories.map((signatory) => ({
          name: signatory.name,
          username: signatory.username,
          _id: signatory._id.toString(),
          researchAssistants: signatory.researchAssistants,
        }));

        // signObj cannot be too big
        const signObj = {
          username: reqBodyUsername,
          name: userDisplayName,
          isAdmin: userIsAdmin,
          isGroupLeaderForObj: isGroupLeaderForObj,
          isResearchAssistantFor: isResearchAssistantFor,
          signatories: abridgedSignatories,
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

router.post('/form/new', async (req, res) => {
  console.log('req.body');
  console.log(req.body);
  // const { description, dropFiles } = req.body;

  // save files to folder whose contents are gitignored
  // TODO

  // correct email Options object for sendEmail
  // TODO
  // const emailOptions = {};

  // await sendEmail(emailOptions).catch((err) => {
  //   console.error('email failed', err);
  //   res.send({ status: 500, error: err });
  // });

  res.send({
    status: 200,
    message: 'Form submitted successfully',
    // debugging: [description, dropFiles.length],
  });
});

// router.post('/uploads', async (req, res) => {
//   // console.log('req');
//   // console.log(req);
//   console.log('req.files');
//   console.log(req.files);
//   console.log('req.body.files');
//   console.log(req.body.files);

//   // const { description, dropFiles } = req.body;

//   // save files to folder whose contents are gitignored
//   // TODO

//   // correct email Options object for sendEmail
//   // TODO
//   // const emailOptions = {};

//   // await sendEmail(emailOptions).catch((err) => {
//   //   console.error('email failed', err);
//   //   res.send({ status: 500, error: err });
//   // });

//   res.send({
//     status: 200,
//     message: 'Upload submitted successfully',
//     // debugging: [description, dropFiles.length],
//   });
// });

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

router.post('/uploads', upload.array('files'), (req, res) => {
  console.log('req.files', req.files);

  res.send({
    status: 200,
  });
});

// Export the server middleware
export default {
  path: '/api',
  handler: router,
};
