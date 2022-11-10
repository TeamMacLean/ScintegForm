import mongoose from 'mongoose';
const { Schema, models, model } = mongoose;

const Admin =
  models.Admin ||
  model(
    'Admin',
    new Schema(
      {
        // this is the username of the admin, name is more convenient as a field name
        name: {
          type: String,
          required: true,
          unique: true,
        },
        archived: {
          type: Boolean,
          required: true,
          default: false,
        },
      },
      {
        timestamps: true,
        toJSON: { virtuals: true },
      }
    )
  );

const Form =
  models.Form ||
  model(
    'Form',
    new Schema(
      {
        description: {
          type: String,
          required: true,
        },
        files: {
          type: [
            {
              name: {
                type: String,
                required: true,
              },
              initialPath: {
                type: String,
                required: true,
              },
              finalPath: {
                type: String,
                required: true,
              },
              size: {
                type: Number,
                required: true,
              },
              mimetype: {
                type: String,
                required: true,
              },
            },
          ],
        },
      },
      {
        timestamps: true,
        toJSON: { virtuals: true },
      }
    )
  );

export { Form, Admin };
