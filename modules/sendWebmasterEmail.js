'use strict';
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

const { SMTP_HOST, SMTP_PORT } = process.env;

const sendWebmasterEmail = async (id) => {
  return new Promise((resolve, reject) => {
    let transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
    });

    console.log('reached 2');

    transporter.sendMail(
      {
        from: 'TSL Transplant Website <scinteg@tsl.ac.uk>',
        to: 'deeks@nbi.ac.uk',
        subject: 'New Scinteg submission', // Subject line
        html: `<div><div>New submission:</div><div>db.forms.find({_id : ObjectId("${id}")});</div><div>You MUST forward this on appropriately, making files available in an easily-accessible folder or via email.</div></div>`,
      },
      (error, info) => {
        if (error) {
          console.log('reached 5');
          console.error(error);
          reject(
            new Error(
              `Something went wrong in the sendMail method. Error: ${error.message}`
            )
          );
        } else {
          console.log('reached 4');
          console.log('Message sent:', info);
          resolve(`Message sent: ${info.messageId}`);
        }
      }
    );
  });
};

export default sendWebmasterEmail;
