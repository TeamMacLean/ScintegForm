<template>
  <div>
    <h3 class="title is-3">Anonymous incident report: {{ date }}</h3>
    <p>
      If you experience any issues with retrieving this report, then please
      <a href="mailto:george.deeks@tsl.ac.uk">email the Webmaster.</a>
    </p>

    <hr />

    <b-field label="Description of incident(s)">
      <div class="description-wrapper">
        <p class="pb5">
          {{ description || 'No description found' }}
        </p>
      </div>
    </b-field>
    <div class="container">
      <div class="label">Supporting file(s)</div>
      <div v-if="!files.length"><p>Sorry, no files were detected.</p></div>
      <div v-else>
        <div class="file-wrapper" v-for="(file, index) in files" :key="index">
          <div class="file-column">{{ file.name }}</div>
          <div class="file-column">
            <div>{{ file.size }} bytes</div>
          </div>
          <b-button type="is-primary" @click="downloadFile(file)"
            >Download</b-button
          >
        </div>
      </div>
    </div>
    <hr />
    <b-button type="is-danger" @click="deleteSubmission"
      >Delete submission</b-button
    >
  </div>
</template>

<script>
import moment from 'moment';
import MultipleUploads from '~/components/MultipleUploads.vue';

const apiUrl = process.env.API_URL || 'http://localhost:3000';

export default {
  name: 'Index',
  auth: true,
  components: {
    MultipleUploads,
  },
  data() {
    return {
      description:
        'I really want to enjoy the atmosphere created at the workplace but unfortunately some miscreants have ruined the experience for me.',
      files: [
        { name: 'Jeremiah', size: 3083 },
        { name: 'Ezekiel', size: 9393 },
      ],
      date: moment().format('DD-MM-YYYY'),
    };
  },
  methods: {
    downloadFile(file) {
      const url = `${apiUrl}/api/submissions/${this.$route.params.id}/files/${file.name}`;
      window.open(url, '_blank');
    },
    deleteSubmission() {
      this.$buefy.dialog.confirm({
        title: 'Delete submission',
        message: 'Are you sure you want to delete this submission?',
        confirmText: 'Delete',
        type: 'is-danger',
        hasIcon: true,
        onConfirm: () => {
          this.$axios
            .$delete(`${apiUrl}/api/submissions/${this.$route.params.id}`)
            .then(() => {
              this.$router.push('/');
            })
            .catch((err) => {
              this.$buefy.toast.open({
                message: err.response.data.message,
                type: 'is-danger',
              });
            });
        },
      });
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

.multiple-files-wrapper {
}

.pb5 {
  padding-bottom: 5px;
}
.pb10 {
  padding-bottom: 10px;
}

.file-wrapper {
  display: flex;
}

.file-wrapper > * {
  flex-grow: 1;
  margin-bottom: 5px;
  align-items: center;
  text-align: center;
  vertical-align: middle;
}

.file-column {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex: 1;
}
</style>
