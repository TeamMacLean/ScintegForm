(window.webpackJsonp=window.webpackJsonp||[]).push([[10],{367:function(t,e,r){var content=r(390);content.__esModule&&(content=content.default),"string"==typeof content&&(content=[[t.i,content,""]]),content.locals&&(t.exports=content.locals);(0,r(47).default)("cb94e2e6",content,!0,{sourceMap:!1})},389:function(t,e,r){"use strict";r(367)},390:function(t,e,r){var n=r(46)(!1);n.push([t.i,"#login[data-v-64660069]{display:flex;align-items:center;justify-content:center;height:calc(100vh - 55px)}#login .card[data-v-64660069]{width:24rem;border-radius:4px;margin-top:-100px}#login .regular-checkbox[data-v-64660069]{margin-right:2px}",""]),t.exports=n},401:function(t,e,r){"use strict";r.r(e);var n=r(2),o=(r(14),r(9),{data:function(){return{submitting:!1,error:null,credentials:{username:"",password:""}}},methods:{onSubmit:function(){var t=this;return Object(n.a)(regeneratorRuntime.mark((function e(){var r;return regeneratorRuntime.wrap((function(e){for(;;)switch(e.prev=e.next){case 0:(r=t).submitting=!0,t.$auth.loginWith("local",{data:{username:r.credentials.username,password:r.credentials.password}}).then((function(e){r.submitting=!1,t.$router.push({path:t.$nuxt.context.from.path})})).catch((function(t){r.submitting=!1,r.error=t,console.error(t)})).finally((function(){r.submitting=!1}));case 3:case"end":return e.stop()}}),e)})))()}}}),c=(r(389),r(29)),component=Object(c.a)(o,(function(){var t=this,e=t.$createElement,r=t._self._c||e;return r("div",{attrs:{id:"login"}},[r("div",{staticClass:"card"},[r("div",{directives:[{name:"show",rawName:"v-show",value:!t.$store.state.user,expression:"!!!$store.state.user"}],staticClass:"card-header"},[r("p",{staticClass:"card-header-title"},[t._v("Please Sign In")])]),t._v(" "),r("div",{staticClass:"card-content"},[t.$store.state.user?r("div",[t._v("You are logged in!")]):r("form",{on:{submit:function(e){return e.preventDefault(),t.onSubmit.apply(null,arguments)}}},[r("div",{staticClass:"field has-addons"},[r("p",{staticClass:"control is-expanded"},[r("input",{directives:[{name:"model",rawName:"v-model",value:t.credentials.username,expression:"credentials.username"}],staticClass:"input",attrs:{id:"username",type:"text",name:"username",title:"username",placeholder:"Username",required:"",autofocus:""},domProps:{value:t.credentials.username},on:{input:function(e){e.target.composing||t.$set(t.credentials,"username",e.target.value)}}})]),t._v(" "),t._m(0)]),t._v(" "),r("div",{staticClass:"field"},[r("div",{staticClass:"control"},[r("input",{directives:[{name:"model",rawName:"v-model",value:t.credentials.password,expression:"credentials.password"}],staticClass:"input",attrs:{id:"password",type:"password",name:"password",title:"password",placeholder:"Password",required:""},domProps:{value:t.credentials.password},on:{input:function(e){e.target.composing||t.$set(t.credentials,"password",e.target.value)}}})])]),t._v(" "),t.submitting?r("div",[t._v("Submitting ....")]):t._e(),t._v(" "),r("button",{staticClass:"button is-primary is-fullwidth is-outlined",attrs:{type:"submit"}},[t._v("\n          Sign in\n        ")])]),t._v(" "),t.error?r("div",{staticStyle:{color:"red"}},[t._v(t._s(t.error))]):t._e()])])])}),[function(){var t=this,e=t.$createElement,r=t._self._c||e;return r("p",{staticClass:"control"},[r("a",{staticClass:"button is-static"},[t._v(" @nbi.ac.uk ")])])}],!1,null,"64660069",null);e.default=component.exports}}]);