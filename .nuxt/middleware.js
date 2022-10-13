const middleware = {}

middleware['authinflate'] = require('../middleware/authinflate.js')
middleware['authinflate'] = middleware['authinflate'].default || middleware['authinflate']

export default middleware
