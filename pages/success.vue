<template>
  <div>
    <div v-if="!description">
      <p>
        No submission info provided. Perhaps you landed on this page by mistake?
      </p>
      <br />
      <p>
        If you become worried about any technical issues that may have hindered
        your submission and thus its investigation, then please click 'Request
        Help' in the top left corner.
      </p>
    </div>
    <div v-else>
      <h3 class="title is-3">Successful submission!</h3>
      <br />
      <h5 class="title is-5 pb20">Submitted information:</h5>

      <h6 class="subtitle">Description:</h6>
      <p>{{ this.description }}</p>
      <br />
      <div v-if="fileNames.length">
        <h6 class="subtitle">Files uploaded:</h6>
        <div v-for="(fileName, index) in fileNames" :key="index">
          <p>{{ fileName }}</p>
        </div>
      </div>
      <div v-else>
        <h6 class="subtitle">(No supporting files uploaded.)</h6>
      </div>
      <br />
      <h5 class="title is-5">What happens next?</h5>
      <p class="pb1rem">
        An email has been sent to Nick Talbot (Executive Director) and Debbie
        Feather (Head of Administration), who will investigate the information
        that you have provided in the form.
      </p>
      <p class="pb1rem">
        Feel free to capture a screenshot of this page for your records, and
        also note the current time for future reference.
      </p>
      <p>
        If you become worried about any technical issues that may have hindered
        your submission and thus its investigation, then please click 'Request
        Help' in the top right corner.
      </p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Success',
  auth: false,
  data() {
    console.log(this.$route.params);
    const { description, fileNames } = this.$route.params;

    return {
      description,
      fileNames,
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
          this.$router.push({
            name: 'success',
            params: {
              description: this.description,
              fileNames: this.files.map((f) => f.filename),
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

.pb20 {
  padding-bottom: 20px;
}

.pb1rem {
  padding-bottom: 1rem;
}
</style>
