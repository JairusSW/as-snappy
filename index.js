const fs = require("fs");
const Bitray = require('bitray')
const loader = require('as-bind').AsBind
const imports = { /* imports go here */ };
const wasmModule = loader.instantiateSync(fs.readFileSync(__dirname + "/build/optimized.wasm"), imports);
module.exports = wasmModule.exports;

console.log(wasmModule.exports.compress(new Bitray('Hello World 🌎')))