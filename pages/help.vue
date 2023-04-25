<template>
  <div class="section">
    <div class="container">
      <h1 class="title">Contact the Webmaster</h1>
      <p>
        If you have any issues with form file upload, etc., then you can
        anonymously contact the Webmaster here.
      </p>
      <br />
      <p>
        Please keep your anonymity in mind when contacting the Webmaster - this
        form submission will not be traced back to you.
      </p>
      <br />
      <p>Both fields are required in order to submit the form.</p>
      <br />
      <form @submit.prevent="submitForm">
        <div class="field">
          <label class="label">Subject:</label>
          <div class="control">
            <input class="input" v-model.trim="subject" type="text" required />
          </div>
        </div>
        <div class="field">
          <label class="label">Message:</label>
          <div class="control">
            <textarea
              class="textarea"
              v-model.trim="message"
              required
            ></textarea>
          </div>
        </div>
        <br />
        <div class="field">
          <div class="control">
            <button
              class="button is-primary"
              type="submit"
              :disabled="!subject || !message"
            >
              Send (sends help request)
            </button>
          </div>
        </div>
      </form>
      <br />
      <nuxt-link to="/" class="button is-light"
        >Back to Home (cancels help request)</nuxt-link
      >
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      subject: '',
      message: '',
    };
  },
  methods: {
    async submitForm() {
      try {
        await this.$axios.post('/api/help', {
          subject: this.subject,
          message: this.message,
        });
        alert('Message sent successfully!');
        this.subject = '';
        this.message = '';
      } catch (error) {
        alert('An error occurred. Please try again.');
      }
    },
  },
};
</script>
