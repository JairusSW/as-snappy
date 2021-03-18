const uncompress = require('./uncompress')

const compress = require('./compress')

const compressed = compress(Buffer.from('Hello World 🌎'))

const uncompressed = uncompress(compressed)

console.log('Compressed: ', compressed)

console.log('Decompressed:', Buffer.from(uncompressed).toString())