<template>
  <div>
    <nav class="navbar" role="navigation" aria-label="main navigation">
      <div class="navbar-brand">
        <nuxt-link to="/" class="navbar-item">
          <b class="has-text-primary">Scinteg</b>
        </nuxt-link>
      </div>
    </nav>
  </div>
</template>

<script>
export default {
  name: 'HeaderAfterLogin',
};
</script>
<style scoped>
.navbar-menu > .navbar-item.is-active {
  background-color: #f7f7f7 !important;
}

.custom-admin-knowledge {
  margin-left: 20px;
  font-size: 1rem;
  font-weight: bold;
}

.is-green {
  color: green;
}

.is-red {
  color: red;
}

.underline {
  text-decoration: underline;
  color: purple;
}
</style>
