<template>
  <div>
    <div>
      TODO explain that you must upload all files before submitting, and max is
      10GB
    </div>
    <form @submit.prevent="sendFile" enctype="multipart/form-data">
      <div class="field">
        <div class="file is-boxed is-primary">
          <label class="file-label">
            <input
              multiple
              type="file"
              ref="files"
              @change="selectFile"
              class="file-input"
            />

            <span class="file-cta">
              <!-- <span class="file-icon">
              <i class="folder-text-outline"></i>
            </span> -->
              <span class="file-label"> Choose a file… </span>
            </span>
          </label>
        </div>

        <div>Number of files to be uploaded to server: {{ files.length }}</div>

        <div class="field">
          <div class="item-wrapper" v-for="(file, index) in files" :key="index">
            <a @click.prevent="deleteFile(index)" class="delete"></a>
            <div
              :class="`file-name-wrapper ${
                file.invalidMessage && 'has-text-danger'
              }`"
            >
              {{
                file.name +
                (file.invalidMessage ? ` (${file.invalidMessage})` : '')
              }}
            </div>
          </div>
        </div>
      </div>

      <div class="field">
        <button
          :disabled="isSubmitDisabled"
          type="submit"
          class="button is-secondary"
        >
          Upload files to server
        </button>
      </div>
    </form>
  </div>
</template>

<script>
import _ from 'lodash';
export default {
  name: 'MultipleUploads',
  data() {
    return {
      files: [],
      uploadFiles: [],
    };
  },
  methods: {
    validate(file) {
      const MAX_SIZE = 100000000; // 100MB
      if (file.size > MAX_SIZE) {
        return 'Max size for individual file is 10GB!';
      } else {
        return '';
      }
    },
    selectFile() {
      const files = this.$refs.files.files;
      this.uploadFiles = [...this.uploadFiles, ...files];

      this.files = [
        ...this.files,
        ..._.map(files, (file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
          invalidMessage: this.validate(file),
        })),
      ];
    },
    deleteFile(index) {
      this.files.splice(index, 1);
      this.uploadFiles.splice(index, 1);
    },
    async sendFile() {
      const formData = new FormData();
      _.forEach(this.uploadFiles, (file) => {
        if (this.validate(file) === '') {
          formData.append('files', file);
        }
      });

      try {
        await this.$axios.post('/api/uploads', formData);
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
      if (this.files.length === 0) {
        return true;
      } else if (this.files.some((file) => !!file.invalidMessage)) {
        return true;
      } else {
        return false;
      }
    },
  },
};
</script>
<style>
.item-wrapper {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.file-name-wrapper {
  padding-left: 10px;
  text-align: center;
}
</style>
