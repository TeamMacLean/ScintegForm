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
      For issues please
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
          <p>
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
          <multiple-uploads
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
        return 'Max size for individual file is 10GB!';
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
          this.description = '';
          this.files = [];
          this.uploadFiles = [];
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
          (error &&
            error.response &&
            error.response.data &&
            error.response.data.error) ||
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
  max-width: 748px;
}

.dashboard-wrapper {
  z-index: 1;
}

.multiple-uploads-wrapper {
}
</style>
