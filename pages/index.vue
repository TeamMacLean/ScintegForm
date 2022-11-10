<template>
  <div>
    <h3 class="title is-3">
      Report scientific misconduct at The Sainsbury Laboratory
    </h3>
    <!-- <h4 class="title is-5">
      Report ID (randomly generated): {{ randomlyGeneratedID }}
    </h4> -->
    <br />
    <h4 class="subtitle">
      Please fill in the form below to report scientific misconduct. The form is
      anonymous. On submission, an email is sent to Nick Talbot (Executive
      Director) and Debbie Feather (Head of Administration), who will
      investigate what you have filled out below.
    </h4>
    <p>
      If you experience any issues, then please
      <a href="mailto:george.deeks@tsl.ac.uk">email the Webmaster.</a>
    </p>

    <hr />

    <form
      id="myForm"
      class="form-wrapper"
      @submit.prevent="submitForm"
      enctype="multipart/form-data"
    >
      <b-field label="*Description of incident(s) (mandatory)">
        <div class="description-wrapper">
          <p class="pb5">
            You do not need to duplicate text found in files you wish to upload,
            however an overview of your misconduct report is necessary here.
          </p>
          <b-input
            required
            class="description-input"
            v-model="description"
            maxlength="20000"
            type="textarea"
          ></b-input>
        </div>
      </b-field>
      <hr />
      <div class="container">
        <!-- contains form, so rename to SimpleUploadForm -->
        <div class="multiple-uploads-wrapper">
          <div class="label">Upload supporting files (optional)</div>
          <div class="pb10">
            Upload supporting documents here, for example: images, PDF files,
            Microsoft Word files, etc. 100MB is the maximum size of each file.
            Do not upload audio or zipped files. You can upload up to 100 files.
            Despite this generous limit, please try to keep the total size of
            what you are uploading to under 100MB, and preferably under 10
            files. Please also consider using a LAN cable whilst on the NBI
            network to upload files, to increase the network speed. Please check
            the total size of the files you intend to upload before proceeding.
          </div>
          <!-- <div>You can achieve this usually by
            zipping all your files into one compressed file (you can search
            online how to if you are not sure).</div> -->
          <multiple-uploads
            class="pb5"
            :files="files"
            :upload-files="uploadFiles"
            :on-select-files="onSelectFiles"
            :on-delete-file="onDeleteFile"
            :validate-file="validateFile"
          />
        </div>
        <div>
          {{ this.files.length }} file{{ this.files.length === 1 ? '' : 's' }}
          currently to be submitted.
        </div>
      </div>

      <hr />
      <b-button
        class="submit-button"
        native-type="submit"
        :disabled="isSubmitDisabled"
      >
        Submit
      </b-button>
    </form>
  </div>
</template>

<script>
import MultipleUploads from '~/components/MultipleUploads.vue';

const apiUrl = process.env.API_URL || 'http://localhost:3000';

export default {
  name: 'Index',
  auth: false,
  components: {
    MultipleUploads,
  },
  data() {
    return {
      description: 'This is a test description',
      //randomlyGeneratedID: uuidv4().slice(0, 8),
      API_URL: apiUrl,
      files: [],
      uploadFiles: [],
    };
  },
  methods: {
    onSelectFiles(files, uploadFiles) {
      this.files = files;
      this.uploadFiles = uploadFiles;
    },
    onDeleteFile(files, uploadFiles) {
      this.files = files;
      this.uploadFiles = uploadFiles;
    },
    validateFile(file) {
      const MAX_SIZE = 100000000; // 100MB
      if (file.size > MAX_SIZE) {
        return 'Max size for individual file is 100MB!';
      } else {
        return '';
      }
    },
    async submitForm() {
      // this.$buefy.dialog.confirm({
      //   title: 'Complete request',
      //   message: `Are you sure you wish to submit this report as is? You will not be able to edit it once submitted.`,
      //   trapFocus: true,
      //   confirmText: 'Confirm Submission',
      //   cancelText: 'Cancel',
      //   onConfirm: async () => {
      const formData = new FormData();

      _.forEach(this.uploadFiles, (file) => {
        if (this.validateFile(file) === '') {
          formData.append('files', file);
        }
      });

      formData.append('description', this.description);

      try {
        const response = await this.$axios.post('/api/form/new', formData);

        if (response.data.status === 200) {
          this.$buefy.toast.open({
            message: `Request submitted successfully!`,
            type: 'is-success',
          });
          this.$router.push({
            name: 'success',
            params: {
              description: this.description,
              fileNames: this.uploadFiles.map((f) => f.name),
            },
          });
        } else {
          throw new Error(
            response && response.data && response.data.error
              ? response.data.error
              : 'Unforeseen error'
          );
        }
      } catch (error) {
        console.error(error);
        const errorMsg =
          error.response.data.error ||
          error.message ||
          error ||
          'An error occurred';

        this.$buefy.toast.open({
          message: errorMsg,
          type: 'is-danger',
        });
      }

      // },
      // });
    },
    async sendFile() {
      try {
        await this.$axios.post('/api/uploads', formData);
      } catch (error) {}

      this.$buefy.toast.open({
        message: 'File uploaded successfully!',
        type: 'is-success',
      });
      this.files = [];
      this.uploadFiles = [];
    },
  },
  computed: {
    isSubmitDisabled() {
      if (this.files.some((file) => !!file.invalidMessage)) {
        return true;
      } else {
        return !this.description;
      }
    },
  },
};
</script>

<style scoped>
.form-wrapper {
  padding-top: 0.25rem;
}
.submit-button {
  margin-top: 0rem;
}

.description-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.description-input {
}

.dashboard-wrapper {
  z-index: 1;
}

.multiple-uploads-wrapper {
}

.pb5 {
  padding-bottom: 5px;
}
.pb10 {
  padding-bottom: 10px;
}
</style>
