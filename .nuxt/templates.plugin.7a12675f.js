import Vue from 'vue'
import { library, config } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon, FontAwesomeLayers, FontAwesomeLayersText } from '@fortawesome/vue-fontawesome'

config.autoAddCss = false

    import  { faFillDrip as fortawesomefreesolidsvgicons_faFillDrip } from '@fortawesome/free-solid-svg-icons'
    library.add(fortawesomefreesolidsvgicons_faFillDrip)

    import  { faSpinner as fortawesomefreesolidsvgicons_faSpinner } from '@fortawesome/free-solid-svg-icons'
    library.add(fortawesomefreesolidsvgicons_faSpinner)

    import  { faSearch as fortawesomefreesolidsvgicons_faSearch } from '@fortawesome/free-solid-svg-icons'
    library.add(fortawesomefreesolidsvgicons_faSearch)

    import  { faEllipsisV as fortawesomefreesolidsvgicons_faEllipsisV } from '@fortawesome/free-solid-svg-icons'
    library.add(fortawesomefreesolidsvgicons_faEllipsisV)

    import  { faUpload as fortawesomefreesolidsvgicons_faUpload } from '@fortawesome/free-solid-svg-icons'
    library.add(fortawesomefreesolidsvgicons_faUpload)

    import  { faUserCircle as fortawesomefreeregularsvgicons_faUserCircle } from '@fortawesome/free-regular-svg-icons'
    library.add(fortawesomefreeregularsvgicons_faUserCircle)

    import  { faEdit as fortawesomefreeregularsvgicons_faEdit } from '@fortawesome/free-regular-svg-icons'
    library.add(fortawesomefreeregularsvgicons_faEdit)

    import  { faSave as fortawesomefreeregularsvgicons_faSave } from '@fortawesome/free-regular-svg-icons'
    library.add(fortawesomefreeregularsvgicons_faSave)

    import  { faCheckCircle as fortawesomefreeregularsvgicons_faCheckCircle } from '@fortawesome/free-regular-svg-icons'
    library.add(fortawesomefreeregularsvgicons_faCheckCircle)

Vue.component('font-awesome-icon', FontAwesomeIcon)
Vue.component('font-awesome-layers', FontAwesomeLayers)
Vue.component('font-awesome-layers-text', FontAwesomeLayersText)
