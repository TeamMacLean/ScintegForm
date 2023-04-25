import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import ldap from './ldap';
import _ from 'lodash';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const { WEBMASTER, WEBMASTER_TESTING, SMTP_HOST, SMTP_PORT } = process.env;

const emailRecipientsStr = process.env.EMAIL_RECIPIENTS; // Get the string value of the environment variable
const emailRecipientsArr = emailRecipientsStr.split(',').map((s) => s.trim()); // Split the string into an array and remove whitespace

const webmasterEmail = `${WEBMASTER}@nbi.ac.uk`;

// OLD
//import uploadApp from './uploads_OLD';

import { Form, Admin } from './models';

const _path = path;

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
  // The buffer stream can be converted into binary data if we use dest param in multer
  // more: https://medium.com/geekculture/file-upload-and-download-in-node-js-c524a8050c8f
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

router.post('/form/new', upload.array('files'), async (req, res) => {
  try {
    const uploadDir = path.join(__dirname, '..', 'uploads');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
      console.log('Created upload directory: ' + uploadDir);
    }

    // Create new form
    const newFormData = {
      description: req.body.description,
      files: req.files.map((f) => ({
        name: f.originalname,
        size: f.size,
        mimetype: f.mimetype,
        initialPath: f.path,
        finalPath: _path.join(uploadDir, `${f.filename}_FINAL`),
        fieldname: f.fieldname,
        originalname: f.originalname,
        encoding: f.encoding,
      })),
    };

    const formResult = await Form.create(newFormData);

    // Move files to the correct folder
    newFormData.files.forEach(async (file) => {
      const { initialPath, finalPath } = file;
      if (!fs.existsSync(initialPath)) {
        console.error(`Error: File not found: ${initialPath}`);
        return;
      }

      try {
        await fs.promises.rename(initialPath, finalPath);
        console.log(`File moved from ${initialPath} to ${finalPath}`);
      } catch (error) {
        console.error(`Error moving file: ${initialPath} to ${finalPath}`);
        console.error(error);
      }
    });

    // Send email with attachments
    const formId = mongoose.Types.ObjectId(formResult._id).toString();

    let transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
    });

    let attachments = newFormData.files.map((file) => {
      return {
        filename: file.name,
        path: file.finalPath,
        contentType: file.mimetype,
      };
    });

    const emailRecipients = emailRecipientsArr.map((r) => {
      if (WEBMASTER_TESTING) {
        return `${WEBMASTER}+${r}@nbi.ac.uk`;
      } else {
        return `${r}@nbi.ac.uk`;
      }
    });

    console.log('Sending email to', emailRecipients);

    const emailContent = () => {
      var filesStr =
        req.files && req.files.length
          ? req.files.map((f) => f.originalname).join(', ')
          : '(No files submitted by complainant)';
      const body = `
        <table cellpadding="20" cellspacing="0" style="width:100%; font-family: Arial, sans-serif; font-size: 14px;">
          <tr>
            <td style="padding: 20px; border-top: 1px solid #ccc; border-left: 1px solid #ccc; border-right: 1px solid #ccc;">Dear Nick and Debbie,</td>
          </tr>
          <tr>
            <td style="padding: 20px; border-left: 1px solid #ccc; border-right: 1px solid #ccc;">A complaint has been submitted on the Scinteg website regarding scientific misconduct at TSL. This email alerts you to all the submitted details:</td>
          </tr>
          <tr>
            <td style="padding: 20px; border-left: 1px solid #ccc; border-right: 1px solid #ccc;">
              <table cellpadding="5" cellspacing="0" style="width:100%; font-family: Arial, sans-serif; font-size: 14px;">
                <tr>
                  <td style="width: 120px;"><strong>Description:</strong></td>
                  <td>${req.body.description}</td>
                </tr>
                <tr>
                  <td style="width: 120px;"><strong>Files attached:</strong></td>
                  <td>${filesStr}</td>
                </tr>
                <tr>
                  <td style="width: 120px;"><strong>Form Submission ID:</strong></td>
                  <td>${formId}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px; border-left: 1px solid #ccc; border-right: 1px solid #ccc;">If you encounter any issues with this email and/or its contents, please forward it to the webmaster at ${webmasterEmail}.</td>
          </tr>
          <tr>
            <td style="padding: 20px; border-left: 1px solid #ccc; border-right: 1px solid #ccc;">Thank you for your attention to this matter.</td>
          </tr>
          <tr>
            <td style="padding: 20px; border-left: 1px solid #ccc; border-right: 1px solid #ccc; border-bottom: 1px solid #ccc;">Best regards,<br/>The Scinteg website</td>
          </tr>
        </table>
      `;

      return body;
    };

    let mailOptions = {
      from: 'TSL Transplant Website <scinteg@tsl.ac.uk>',
      to: emailRecipients,
      bcc: webmasterEmail,
      subject: `Scinteg form submission - ACTION REQUIRED`,
      html: emailContent(),
      attachments: attachments,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Email sent successfully for form ID: ${formId}`);
      res
        .status(200)
        .send({
          status: 200,
          message: 'Email sent successfully',
          formId: formId,
        });
    } catch (error) {
      console.error(`Error sending email for form ID: ${formId}`);
      console.error(error);
      res.status(500).send('An error occurred');
    }
  } catch (error) {
    console.error(`Error creating form`);
    console.error(error);
    res.send({ status: 500, error: error });
  }
});

// HELP

router.post('/help', async (req, res) => {
  const { subject, message } = req.body;

  let transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
  });

  let mailOptions = {
    from: 'TSL Transplant Website <scinteg@tsl.ac.uk>',
    to: webmasterEmail,
    subject: `Scinteg anonymous query: ${subject}`, // Subject line
    text: message,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).send('Email sent successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred');
  }
});

// Export the server middleware
export default {
  path: '/api',
  handler: router,
};
