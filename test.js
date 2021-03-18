const snappy =  require('./compress')

console.log(Buffer.from(snappy(Buffer.from('Hello World 🌎'))).toString())