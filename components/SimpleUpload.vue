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
              type="file"
              ref="file"
              @change="selectFile"
              class="file-input"
            />

            <span class="file-cta">
              <!-- <span class="file-icon">
              <i class="folder-text-outline"></i>
            </span> -->
              <span class="file-label"> Choose a file… </span>
            </span>

            <span class="file-name" v-if="file"> {{ file.name }} </span>
          </label>
        </div>
      </div>

      <div class="field">
        <button type="submit" class="button is-secondary">
          Upload file to server
        </button>
      </div>
    </form>
  </div>
</template>

<script>
export default {
  name: 'SimpleUpload',
  data() {
    return {
      file: '',
    };
  },
  methods: {
    selectFile() {
      //let errorMsg = '';
      // allowed types - not needed

      const proposedFile = this.$refs.file.files[0];

      const tooLarge = file.size > 10000000000;

      if (tooLarge) {
        this.$buefy.toast.open({
          message: 'File is too large. Max size 10GB.',
          type: 'is-danger',
        });
      } else {
        this.file = proposedFile;
      }
    },
    async sendFile() {
      // MUST use formData for js backend
      const formData = new FormData(); // js form data obj
      formData.append('file', this.file); // append file to form data
      try {
        await this.$axios.post('/api/upload', formData);
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
      this.file = '';
    },
  },
};
</script>
<style></style>
