(window.webpackJsonp=window.webpackJsonp||[]).push([[6],{362:function(t,e,r){var content=r(380);content.__esModule&&(content=content.default),"string"==typeof content&&(content=[[t.i,content,""]]),content.locals&&(t.exports=content.locals);(0,r(47).default)("620f6c8b",content,!0,{sourceMap:!1})},363:function(t,e,r){var content=r(382);content.__esModule&&(content=content.default),"string"==typeof content&&(content=[[t.i,content,""]]),content.locals&&(t.exports=content.locals);(0,r(47).default)("491575b4",content,!0,{sourceMap:!1})},379:function(t,e,r){"use strict";r(362)},380:function(t,e,r){var n=r(46)(!1);n.push([t.i,".deleted-wrapper[data-v-709cee64]{z-index:-1;opacity:1%}.row-wrapper[data-v-709cee64]{display:flex;flex-direction:row;flex-wrap:wrap}.row-wrapper>*[data-v-709cee64]{flex:1}.row-wrapper[data-v-709cee64]>:not(:first-child){margin-left:20px}",""]),t.exports=n},381:function(t,e,r){"use strict";r(363)},382:function(t,e,r){var n=r(46)(!1);n.push([t.i,".username-message[data-v-5cd94472]{font-size:.75rem}.entire-field[data-v-5cd94472]{display:flex;flex-direction:column}.label-and-input[data-v-5cd94472]{display:flex;flex-direction:row;align-items:center}.custom-b-input[data-v-5cd94472]{margin-left:10px}.custom-label[data-v-5cd94472]{margin-bottom:0!important}.custom-label[data-v-5cd94472],.wrap-warning[data-v-5cd94472]{display:flex;flex-direction:column}.wrap-warning[data-v-5cd94472]{color:red}.display-construct-cards-wrapper[data-v-5cd94472]{display:flex;flex-direction:column;flex-wrap:wrap;justify-content:space-between}.display-construct-cards-wrapper>div[data-v-5cd94472],.status-wrapper[data-v-5cd94472]{margin-bottom:20px}.status-wrapper[data-v-5cd94472]{border:1px solid #000;border-radius:5px;padding:10px}.faded[data-v-5cd94472]{opacity:1%}.strikethrough[data-v-5cd94472]{background:linear-gradient(to top left,transparent 0,transparent calc(50% - .8px),#000 50%,transparent calc(50% + .8px),transparent),linear-gradient(to top right,transparent 0,transparent calc(50% - .8px),#000 50%,transparent calc(50% + .8px),transparent)}hr[data-v-5cd94472]{opacity:0}.component-wrapper[data-v-5cd94472]{padding:5px}.dangerous[data-v-5cd94472]{color:red}.finished[data-v-5cd94472]{color:green;font-weight:700}.shortNameInputWrapper[data-v-5cd94472]{display:flex;flex-direction:row;justify-content:flex-start}.padding[data-v-5cd94472]{padding-left:10px;padding-right:30px}.shortNamesWrapper[data-v-5cd94472]{padding-top:10px;padding-bottom:10px}.shortNamesWrapper>*[data-v-5cd94472]{margin-bottom:10px}.row-wrapper[data-v-5cd94472]{display:flex;flex-direction:row;flex-wrap:wrap}.row-wrapper>*[data-v-5cd94472]{flex:1}.row-wrapper[data-v-5cd94472]>:not(:first-child){margin-left:20px}.printAndCompleteWrapper[data-v-5cd94472]{display:flex;flex-direction:row;align-items:flex-start}.pl10[data-v-5cd94472]{padding-left:10px}.pb10[data-v-5cd94472]{padding-bottom:10px}.mb20[data-v-5cd94472]{margin-bottom:20px}.ml10[data-v-5cd94472]{margin-left:10px}",""]),t.exports=n},397:function(t,e,r){"use strict";r.r(e);var n={name:"FormConstructCard",props:["theIndex","card","status"],computed:{getWrapperClass:function(){return"deleted"===this.status?"deleted-wrapper":""}}},o=(r(379),r(29)),c={middleware:"auth",components:{DisplayConstructCard:Object(o.a)(n,(function(){var t=this,e=t.$createElement,r=t._self._c||e;return r("div",{class:t.getWrapperClass},[r("div",{staticClass:"card"},[r("header",{staticClass:"card-header"},[r("p",{staticClass:"card-header-title"},[t._v("Construct #"+t._s(t.theIndex+1))]),t._v(" "),t._m(0)]),t._v(" "),r("div",{staticClass:"card-content"},[r("div",{staticClass:"row-wrapper"},[r("b-field",{attrs:{label:"Construct Name"}},[r("div",[t._v(t._s(t.card.constructName))])]),t._v(" "),r("b-field",{attrs:{label:"Short Name"}},[r("div",[t._v(t._s(t.card.shortName||"[None set]"))])]),t._v(" "),r("b-field",{attrs:{label:"Binary Vector Backbone"}},[r("div",[t._v(t._s(t.card.binaryVectorBackbone))])])],1),t._v(" "),r("div",{staticClass:"row-wrapper"},[r("b-field",{attrs:{label:"Vector Selection"}},[r("div",[t._v(t._s(t.card.vectorSelection))])]),t._v(" "),r("b-field",{attrs:{label:"T-DNA Selection"}},[r("div",[t._v(t._s(t.card.tdnaSelection))])]),t._v(" "),r("b-field",{attrs:{label:"AgroStrain"}},[r("div",[t._v(t._s(t.card.agroStrain))])])],1)])])])}),[function(){var t=this.$createElement,e=this._self._c||t;return e("button",{staticClass:"card-header-icon",attrs:{"aria-label":"more options"}},[e("span",{staticClass:"icon"},[e("i",{staticClass:"fas fa-angle-down",attrs:{"aria-hidden":"true"}})])])}],!1,null,"709cee64",null).exports},mounted:function(){var t;this.sessionIsAdmin=!(!(t=this)||!t.$auth)&&t.$auth.$state.user.isAdmin,this.sessionUsername=function(t){return!(!t||!t.$auth)&&t.$auth.$state.user.username}(this),this.sessionIsSignatory=function(t){return!!(t&&t.$auth&&t.$auth.$state&&t.$auth.$state.user&&t.$auth.$state.user.username&&t.signatoryObj&&t.signatoryObj.username)&&t.$auth.$state.user.username===t.signatoryObj.username}(this),this.authorisedToApprove=function(t){if(!(t&&t.$auth&&t.$auth.$state&&t.$auth.$state.user&&t.signatoryObj))return!1;var e=t.$auth.$state.user,r=e.username,n=e.isAdmin;return function(t,e,r){return!!r||t===e}(t.signatoryObj.username,r,n)}(this),this.authorisedToView=function(t){if(!t||!t.$auth||!t.signatoryObj)return!1;var e=t.$auth.$state.user,r=e.username,n=e.isAdmin;return function(t,e,r,n){return!!n||(t===r||e===r)}(t.signatoryObj.username,t.username,r,n)}(this),this.loading=!1},asyncData:function(t){var e=t.route,r=t.$axios;t.error;if(!e.query.id)return{error:"No TRF ID provided"};var n=e.query.id;return r.get("/api/form",{params:{trfId:n}}).then((function(t){if(200===t.status&&t.data.trfId===e.query.id){var r=t.data;return{creatorIsGroupLeader:r.creatorIsGroupLeader,notes:r.notes,status:r.status,_id:r._id,date:r.date,username:r.username,creatorIsAdmin:r.creatorIsAdmin,signatoryObj:r.signatoryObj,species:r.species,genotype:r.genotype,constructs:r.constructs,trfId:r.trfId,error:"",completedMsg:"",completingInProgressSteps:!1,printable:!1,sessionIsAdmin:!1,sessionUsername:!1,sessionIsSignatory:!1,authorisedToApprove:!1,authorisedToView:!1,loading:!0}}var n=t.data.error||"Not getting form from TRF ID";return console.error(n),{error:"No TRF found from URL params",creatorIsGroupLeader:!1,notes:null,status:null,_id:null,date:null,username:null,creatorIsAdmin:null,signatoryObj:null,species:null,genotype:null,constructs:null,trfId:null,completedMsg:"",completingInProgressSteps:!1,printable:!1,sessionIsAdmin:!1,sessionUsername:!1,sessionIsSignatory:!1,authorisedToApprove:!1,authorisedToView:!1,loading:!1}})).catch((function(t){return console.error(t),{error:"No TRF found"}}))},methods:{handlePrint:function(){var t=this;this.printable=!0,setTimeout(window.print,300),window.onafterprint=function(){t.printable=!1}},handleDeleteRequest:function(){var t=this;this.$buefy.dialog.confirm({title:"Delete request",message:"Are you sure you want to delete this request?",confirmText:"Delete",cancelText:"Cancel operation",type:"is-danger",hasIcon:!0,onConfirm:function(){return t.$axios.post("/api/form/delete",{trfId:t.trfId,signatoryObj:t.signatoryObj,username:t.username}).then((function(e){200===e.status?(t.status="deleted",t.$buefy.toast.open({message:"Request deleted",type:"is-success"})):t.throwUnexpectedErrorForUser("Status was not 200")})).catch((function(e){t.throwUnexpectedErrorForUser(e)}))}})},throwUnexpectedErrorForUser:function(t){this.$buefy.toast.open({message:"Unexpected error. Please contact system admin.",type:"is-danger"}),console.error(t)},handleApprove:function(){var t=this;this.$buefy.dialog.confirm({title:"Approve request",message:"Are you sure you want to approve this request?",confirmText:"Approve",cancelText:"Cancel",type:"is-success",hasIcon:!0,onConfirm:function(){return t.$axios.post("/api/form/approve",{trfId:t.trfId}).then((function(e){200===e.status?(t.status="approved",t.$buefy.toast.open({message:"Request approved",type:"is-success"})):t.throwUnexpectedErrorForUser("Status was not 200")})).catch((function(e){t.throwUnexpectedErrorForUser(e)}))}})},handleInitiateSetInProgress:function(){this.completingInProgressSteps=!0},cancelSetInProgress:function(){this.completingInProgressSteps=!1},handleCompleteSetInProgress:function(){var t=this;this.$buefy.dialog.confirm({title:"Set into progress",message:"<p>Are you sure you want to set this request into progress with any shortnames you have assigned?</p>",confirmText:"Set In Progress",cancelText:"Cancel",type:"is-success",hasIcon:!0,onConfirm:function(){return t.$axios.post("/api/form/inprogress",{trfId:t.trfId,constructs:t.constructs}).then((function(e){200===e.status?(t.status="in progress",t.$buefy.toast.open({message:"Request set in progress!",type:"is-success"})):t.throwUnexpectedErrorForUser("Status was not 200")})).catch((function(e){t.throwUnexpectedErrorForUser(e)}))}})},handleComplete:function(){var t=this;this.$buefy.dialog.prompt({title:"Complete request",message:"Add short note to completed email sent to user?<br /><i>Click or press return to send</i>",inputAttrs:{placeholder:"Optional",maxlength:200,required:!1},trapFocus:!0,confirmText:"Confirm Completion",cancelText:"Cancel",onConfirm:function(e){return t.$axios.post("/api/form/completed",{trfId:t.trfId,completedMsg:e.trim(),username:t.username}).then((function(e){200===e.status?(t.status="completed",t.$buefy.toast.open({message:"Request set as complete!",type:"is-success"})):t.throwUnexpectedErrorForUser("Status was not 200")})).catch((function(e){t.throwUnexpectedErrorForUser(e)}))}})},handleDeny:function(){var t=this;this.$buefy.dialog.confirm({title:"Deny request",message:"Are you sure you want to deny this request?",confirmText:"Deny",cancelText:"Cancel",type:"is-danger",hasIcon:!0,onConfirm:function(){return t.$axios.post("/api/form/deny",{trfId:t.trfId}).then((function(e){200===e.status?(t.status="denied",t.$buefy.toast.open({message:'Request has been successfully updated as "Denied"',type:"is-successful"})):t.throwUnexpectedErrorForUser("Status was not 200")})).catch((function(e){t.throwUnexpectedErrorForUser(e)}))}})}},computed:{getWrapperClass:function(){return function(t){switch(t){case"completed":case"denied":return"faded";case"deleted":return"strikethrough faded";default:return""}}(this.status)},getTitleClass:function(){var t=function(t){switch(t){case"completed":return" finished";case"deleted":case"denied":return" dangerous";default:return""}}(this.status);return"title is-2".concat(t)},getTitleText:function(){if(!this.trfId)return"No TRF ID";var t=function(t){switch(t){case"completed":return": COMPLETED";case"deleted":return": DELETED";case"denied":return": DENIED";default:return""}}(this.status);return"TRF Form #".concat(this.trfId).concat(t)}}},d=(r(381),Object(o.a)(c,(function(){var t=this,e=t.$createElement,r=t._self._c||e;return r("div",[r("div",{class:t.getWrapperClass},[r("div",{staticClass:"component-wrapper"},[r("h1",{class:t.getTitleClass},[t._v("\n        "+t._s(t.getTitleText)+"\n      ")]),t._v(" "),t.loading?r("b-loading",{attrs:{"is-full-page":""}}):t.error?r("div",[r("p",{staticClass:"pb10"},[t._v("\n          "+t._s(t.error)+"\n        ")])]):t.authorisedToView?r("div",[r("div",{directives:[{name:"show",rawName:"v-show",value:!t.printable,expression:"!printable"}],staticClass:"status-wrapper"},[r("h4",{staticClass:"title is-4"},[t._v("\n            Status:\n            "+t._s(this.status.charAt(0).toUpperCase()+this.status.slice(1))+"\n          ")]),t._v(" "),(t.sessionIsAdmin||t.sessionIsSignatory)&&"pending approval"===t.status?r("div",[r("b-button",{attrs:{type:"is-success is-light"},on:{click:t.handleApprove}},[t._v("Approve")]),t._v(" "),r("b-button",{attrs:{type:"is-danger is-light"},on:{click:t.handleDeny}},[t._v("Deny")])],1):t._e(),t._v(" "),t.sessionIsAdmin&&"approved"===t.status&&!t.completingInProgressSteps?r("div",[r("b-button",{attrs:{type:"is-success"},on:{click:t.handleInitiateSetInProgress}},[t._v("Initiate 'Set In Progress'")])],1):t._e(),t._v(" "),t.sessionIsAdmin&&"approved"===t.status&&t.completingInProgressSteps?r("div",{staticClass:"shortNamesFormWrapper"},[r("h3",{staticClass:"title is-5"},[t._v("Assign shortnames (Optional)")]),t._v(" "),r("div",{staticClass:"shortNamesWrapper"},t._l(t.constructs,(function(e,n){return r("div",{key:n,staticClass:"shortNameInputWrapper"},[r("b",[t._v("Shortname:")]),t._v(" "),r("b-input",{staticClass:"padding",attrs:{maxlength:"10"},model:{value:e.shortName,callback:function(r){t.$set(e,"shortName",r)},expression:"card.shortName"}}),t._v(" "),r("div",{staticClass:"longNameWrapper"},[r("b",[t._v("Longname:")]),t._v(" "+t._s(e.constructName)+"\n                ")])],1)})),0),t._v(" "),r("b-button",{attrs:{type:"is-danger"},on:{click:t.cancelSetInProgress}},[t._v("Cancel")]),t._v(" "),r("b-button",{attrs:{type:"is-success"},on:{click:t.handleCompleteSetInProgress}},[t._v("Complete Set 'In Progress'")])],1):t._e(),t._v(" "),t.sessionIsAdmin&&"in progress"===t.status?r("div",{staticClass:"printAndCompleteWrapper"},[r("div",{staticClass:"printWrapper"},[r("b-button",{attrs:{type:"is-success is-light"},on:{click:t.handlePrint}},[t._v("Print request")])],1),t._v(" "),r("b-button",{staticClass:"ml10",attrs:{type:"is-success"},on:{click:t.handleComplete}},[t._v("Complete request")])],1):t._e()]),t._v(" "),r("div",{staticClass:"row-wrapper mb20"},[r("b-field",{attrs:{label:"Date"}},[r("div",[t._v(t._s(this.date))])]),t._v(" "),r("b-field",{attrs:{label:"Username"}},[r("div",[t._v(t._s(this.username))])]),t._v(" "),r("b-field",{attrs:{label:"Signatory"}},[r("div",[t._v(t._s(this.signatoryObj.name))])]),t._v(" "),r("b-field",{attrs:{label:"Species"}},[r("div",[t._v(t._s(this.species))])]),t._v(" "),r("b-field",{attrs:{label:"Genotype"}},[r("div",[t._v(t._s(this.genotype))])])],1),t._v(" "),r("h3",{staticClass:"title is-4"},[t._v("Constructs")]),t._v(" "),r("h3",{staticClass:"title is-6"},[t._v("In priority order")]),t._v(" "),r("div",{staticClass:"display-construct-cards-wrapper"},t._l(t.constructs,(function(e,n){return r("DisplayConstructCard",{key:n,attrs:{theIndex:n,card:e,status:t.status}})})),1),t._v(" "),r("b-field",{attrs:{label:"Notes"}},[r("div",[t._v(t._s(t.notes||"[No notes]"))])]),t._v(" "),r("hr")],1):r("div",[r("p",[t._v("\n          You are not authorised to view this TRF. Please contact us if you\n          think this is in error.\n        ")])])],1)]),t._v(" "),"deleted"===t.status||t.printable||t.error?t._e():r("b-button",{attrs:{type:"is-danger"},on:{click:t.handleDeleteRequest}},[t._v("Delete request")])],1)}),[],!1,null,"5cd94472",null));e.default=d.exports}}]);