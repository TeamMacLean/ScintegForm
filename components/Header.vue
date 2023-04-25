<template>
  <div>
    <nav class="navbar" role="navigation" aria-label="main navigation">
      <div class="navbar-brand">
        <nuxt-link to="/" class="navbar-item has-text-primary">
          Scinteg Form
        </nuxt-link>
      </div>
      <div class="navbar-menu">
        <div class="navbar-end">
          <nuxt-link to="/help" class="navbar-item help-link help-text">
            Request Help
          </nuxt-link>
        </div>
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

.help-link {
  margin-left: auto;
  margin-right: 1rem;
  text-decoration: underline;
}

.has-text-primary {
  font-size: 3rem;
  font-weight: bold;
  text-decoration: underline;
}

.help-text {
  font-size: 2rem;
  font-weight: bold;
  color: blue;
}
</style>
