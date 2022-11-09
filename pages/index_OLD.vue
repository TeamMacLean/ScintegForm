<template>
  <div>
    <h3 class="title is-3">
      Report scientific misconduct at The Sainsbury Laboratory - {{ API_URL }}
    </h3>
    <!-- <h4 class="title is-5">
      Report ID (randomly generated): {{ randomlyGeneratedID }}
    </h4> -->
    <h4 class="title is-6">
      Please fill in the form below to report scientific misconduct. The form is
      anonymous, and the description and uploaded files sent will be forwarded
      by email to Nick Talbot (Executive Director) and Debbie Feather (Head of
      Administration).
    </h4>
    <!-- <p>
      For issues please
      <a href="mailto:george.deeks@tsl.ac.uk">email the Webmaster.</a>
    </p> -->
    <form id="myForm" class="form-wrapper" @submit.prevent="submit">
      <b-field label="Description of incident(s)">
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
      <div>
        <b-field label="Upload supporting file(s)">
          <div class="description-wrapper">
            <p>
              Please be mindful that large uploads will take a while for the
              server to process on submission. Max total upload size is 1GB.
            </p>
            <div class="dashboard-wrapper">
              <div id="Dashboard"></div>
            </div>
          </div>
        </b-field>

        <br />
      </div>
      <hr />
      <b-button
        class="submit-button"
        :disabled="isSubmitDisabled"
        type="submit"
        @click="submitForm"
        >Submit</b-button
      >
    </form>
  </div>
</template>

<script>
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import Dashboard from '@uppy/dashboard';
import Form from '@uppy/form';

import '@uppy/core/dist/style.css';
import '@uppy/dashboard/dist/style.css';

export default {
  components: {
    Dashboard,
  },
  data() {
    const apiUrl = process.env.API_URL || 'http://localhost:3000';
    return {
      description: '',
      uppyInstance: null,
      uploadedFiles: [],
      //randomlyGeneratedID: uuidv4().slice(0, 8),
      API_URL: apiUrl,
      uppy: null,
      files: [],
    };
  },
  mounted() {
    this.uppy = new Uppy({
      debug: true,
      autoProceed: true,
      allowMultipleUploadBatches: true,
      restrictions: {
        requiredMetaFields: [],
        maxFileSize: 10000 * 100000, // 10GB
        maxNumberOfFiles: 1000,
        minNumberOfFiles: 0,
      },
      meta: {},
      locale: {},
      infoTimeout: 5000,
      id: 'uppy',
    })
      .use(Tus, {
        endpoint: this.API_URL + '/api/uploads',
        // formData: true,
        // fieldName: 'files',
        //resume: true,
        //bundle: true,
        limit: 10,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'X-HTTP-Method-Override': 'POST',
          'Access-Control-Allow-Methods':
            'GET, POST, OPTIONS, PUT, PATCH, DELETE',
          'Access-Control-Allow-Headers':
            'Authorization, Origin, Content-Type, Accept',
          'Access-Control-Allow-Credentials': 'true',
        },
      })
      .use(Form, {
        target: '#myForm',
        resultName: 'uppyResult',
        getMetaFromForm: true,
        addResultToForm: true,
        submitOnSuccess: false, // true if you need the form to ACTUALLY be submitted once all files have been uploaded
        triggerUploadOnSubmit: true, // true means start upload, overriding when form is submitted
      })
      .use(Dashboard, {
        id: 'Dashboard',
        trigger: null,
        target: '#Dashboard',
        inline: true,
        width: 750,
        height: 550,
        thumbnailWidth: 280,
        showLinkToFileUploadResult: false,
        hideUploadButton: false,
        hideRetryButton: false,
        hidePauseResumeButton: false,
        hideCancelButton: false,
        hideProgressAfterFinish: false,
        note: null,
        doneButtonHandler: null,
        closeAfterFinish: false,
        disableStatusBar: false,
        disableInformer: false,
        disableThumbnailGenerator: false,
        disablePageScrollWhenModalOpen: true,
        animateOpenClose: true,
        fileManagerSelectionType: 'files',
        proudlyDisplayPoweredByUppy: true,
        showSelectedFiles: true,
        showRemoveButtonAfterComplete: false,
        showNativePhotoCameraButton: false,
        showNativeVideoCameraButton: false,
        browserBackButtonClose: false,
        theme: 'light',
        autoOpenFileEditor: false,
        disableLocalFiles: false,
        height: 470,
        showProgressDetails: true,
        metaFields: [
          { id: 'name', name: 'Name', placeholder: 'file name' },
          { id: 'caption', name: 'Caption', placeholder: 'add description' },
        ],
      })
      .on('complete', (result) => {
        console.log(
          'Upload complete! We’ve uploaded these files:',
          result.successful
        );
      });
  },
  beforeUnmount() {
    this.uppy.close();
  },
  methods: {
    submitForm() {
      this.$buefy.dialog.confirm({
        title: 'Complete request',
        message: `Are you sure you wish to submit this report as is? You will not be able to edit it once submitted.`,
        trapFocus: true,
        confirmText: 'Confirm Submission',
        cancelText: 'Cancel',
        onConfirm: () => {
          return this.$axios
            .post('/api/form/new', {
              description: this.description,
              dropFiles: this.uppy.getFiles(),
            })
            .then((res) => {
              if (res.status === 200) {
                this.$buefy.toast.open({
                  message: `Request submitted successfully! ${res.data.debugging[0]} ${res.data.debugging[1]}`,
                  type: 'is-success',
                });
                this.description = '';
                this.dropFiles = [];
              } else {
                this.$buefy.toast.open({
                  message:
                    'Unsuccessful form submission. Please contact web admin and/or try again.\n' +
                    res.data.error,
                  type: 'is-danger',
                });
              }
            })
            .catch((err) => {
              this.$buefy.toast.open({
                message:
                  'Unexpected error occurred. Please contact web admin and/or try again.\n' +
                  err,
                type: 'is-danger',
              });
            });
        },
      });
    },
    deleteDropFile(index) {
      const dropFilesCopy = [...this.dropFiles];
      dropFilesCopy.splice(index, 1);
      this.dropFiles = dropFilesCopy;
    },
  },
  computed: {
    isSubmitDisabled() {
      return !this.description;
    },
    allUploadsComplete() {
      this.uppyInstance.getFiles().filter((file) => {
        return !file.progress.uploadComplete;
      }).length < 1;
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
</style>
