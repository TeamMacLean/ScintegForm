<template>
  <div>
    <div>
      TODO explain that you must upload all files before submitting, and max is
      10GB
    </div>
    <div>
      <div class="field">
        <div class="file is-boxed is-primary">
          <label class="file-label">
            <input
              multiple
              type="file"
              ref="files"
              @change="selectFiles"
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
    </div>
  </div>
</template>

<script>
import _ from 'lodash';
export default {
  name: 'MultipleUploads',
  props: [
    'files',
    'onSelectFiles',
    'onDeleteFile',
    'uploadFiles',
    'validateFile',
  ],
  methods: {
    selectFiles() {
      const theFiles = this.$refs.files.files;
      const imminentThisUploadFiles = [...this.uploadFiles, ...theFiles];
      const imminentThisFiles = [
        ...this.files,
        ..._.map(theFiles, (file) => {
          return {
            name: file.name,
            size: file.size,
            type: file.type,
            invalidMessage: this.validateFile(file),
          };
        }),
      ];
      this.onSelectFiles(imminentThisFiles, imminentThisUploadFiles);
    },
    deleteFile(index) {
      const oldThisFiles = [...this.files];
      const oldThisUploadFiles = [...this.uploadFiles];

      const newThisFiles = _.filter(oldThisFiles, (file, i) => i !== index);
      const newThisUploadFiles = _.filter(
        oldThisUploadFiles,
        (file, i) => i !== index
      );

      this.onDeleteFile(newThisFiles, newThisUploadFiles);
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
