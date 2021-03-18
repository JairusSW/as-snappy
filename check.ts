let BLOCK_LOG = 16
let BLOCK_SIZE = 1 << BLOCK_LOG

let MAX_HASH_TABLE_BITS = 14
let globalHashTables: Array<Uint8Array> = new Array(MAX_HASH_TABLE_BITS + 1)

function hashFunc (key: number, hashFuncShift: number): number {
  return (key * 0x1e35a7bd) >>> hashFuncShift
}

function load32 (array: Uint8Array, pos: number): number {
  return array[pos] + (array[pos + 1] << 8) + (array[pos + 2] << 16) + (array[pos + 3] << 24)
}

function equals32 (array: Uint8Array, pos1: number, pos2: number): boolean {
  return array[pos1] === array[pos2] &&
         array[pos1 + 1] === array[pos2 + 1] &&
         array[pos1 + 2] === array[pos2 + 2] &&
         array[pos1 + 3] === array[pos2 + 3]
}

function copyBytes (fromArray: Uint8Array, fromPos: number, toArray: Uint8Array, toPos: number, length: number): void {
  let i
  for (i = 0; i < length; i++) {
    toArray[toPos + i] = fromArray[fromPos + i]
  }
}

function emitLiteral (input: Uint8Array, ip: number, len: number, output: Uint8Array, op: number): number {
  if (len <= 60) {
    output[op] = (len - 1) << 2
    op += 1
  } else if (len < 256) {
    output[op] = 60 << 2
    output[op + 1] = len - 1
    op += 2
  } else {
    output[op] = 61 << 2
    output[op + 1] = (len - 1) & 0xff
    output[op + 2] = (len - 1) >>> 8
    op += 3
  }
  copyBytes(input, ip, output, op, len)
  return op + len
}

function emitCopyLessThan64 (output: Uint8Array, op: number, offset: number, len: number): number {
  if (len < 12 && offset < 2048) {
    output[op] = 1 + ((len - 4) << 2) + ((offset >>> 8) << 5)
    output[op + 1] = offset & 0xff
    return op + 2
  } else {
    output[op] = 2 + ((len - 1) << 2)
    output[op + 1] = offset & 0xff
    output[op + 2] = offset >>> 8
    return op + 3
  }
}

function emitCopy (output: Uint8Array, op: number, offset: number, len: number): number {
  while (len >= 68) {
    op = emitCopyLessThan64(output, op, offset, 64)
    len -= 64
  }
  if (len > 64) {
    op = emitCopyLessThan64(output, op, offset, 60)
    len -= 60
  }
  return emitCopyLessThan64(output, op, offset, len)
}

function compressFragment (input: Uint8Array, ip: number, inputSize: number, output: Uint8Array, op: number): number {
  let hashTableBits = 1
  while ((1 << hashTableBits) <= inputSize &&
         hashTableBits <= MAX_HASH_TABLE_BITS) {
    hashTableBits += 1
  }
  hashTableBits -= 1
  let hashFuncShift = 32 - hashTableBits

  if (typeof globalHashTables[hashTableBits] === 'undefined') {
    globalHashTables[hashTableBits] = new Uint8Array(1 << hashTableBits)
  }
  let hashTable = globalHashTables[hashTableBits]
  let i
  for (i = 0; i < hashTable.length; i++) {
    hashTable[i] = 0
  }

  let ipEnd = ip + inputSize
  let ipLimit
  let baseIp = ip
  let nextEmit = ip

  let hash, nextHash
  let nextIp, candidate, skip
  let bytesBetweenHashLookups
  let base, matched, offset
  let prevHash, curHash
  let flag = true

  let INPUT_MARGIN = 15
  if (inputSize >= INPUT_MARGIN) {
    ipLimit = ipEnd - INPUT_MARGIN

    ip += 1
    nextHash = hashFunc(load32(input, ip), hashFuncShift)

    while (flag) {
      skip = 32
      nextIp = ip
      do {
        ip = nextIp
        hash = nextHash
        bytesBetweenHashLookups = skip >>> 5
        skip += 1
        nextIp = ip + bytesBetweenHashLookups
        if (ip > ipLimit) {
          flag = false
          break
        }
        nextHash = hashFunc(load32(input, nextIp), hashFuncShift)
        candidate = baseIp + hashTable[hash]
        hashTable[hash] = ip - baseIp
      } while (!equals32(input, ip, candidate))

      if (!flag) {
        break
      }

      op = emitLiteral(input, nextEmit, ip - nextEmit, output, op)

      do {
        base = ip
        matched = 4
        while (ip + matched < ipEnd && input[ip + matched] === input[candidate + matched]) {
          matched += 1
        }
        ip += matched
        offset = base - candidate
        op = emitCopy(output, op, offset, matched)

        nextEmit = ip
        if (ip >= ipLimit) {
          flag = false
          break
        }
        prevHash = hashFunc(load32(input, ip - 1), hashFuncShift)
        hashTable[prevHash] = ip - 1 - baseIp
        curHash = hashFunc(load32(input, ip), hashFuncShift)
        candidate = baseIp + hashTable[curHash]
        hashTable[curHash] = ip - baseIp
      } while (equals32(input, ip, candidate))

      if (!flag) {
        break
      }

      ip += 1
      nextHash = hashFunc(load32(input, ip), hashFuncShift)
    }
  }

  if (nextEmit < ipEnd) {
    op = emitLiteral(input, nextEmit, ipEnd - nextEmit, output, op)
  }

  return op
}

function putletint (value: number, output: Uint8Array, op: number): number {
  do {
    output[op] = value & 0x7f
    value = value >>> 7
    if (value > 0) {
      output[op] += 0x80
    }
    op += 1
  } while (value > 0)
  return op
}

function compressToBuffer (array: Uint8Array, outBuffer: Uint8Array): number {
  let length = array.length
  let pos = 0
  let outPos = 0

  let fragmentSize

  outPos = putletint(length, outBuffer, outPos)
  while (pos < length) {
    fragmentSize = Math.min(length - pos, BLOCK_SIZE)
    outPos = compressFragment(array, pos, fragmentSize, outBuffer, outPos)
    pos += fragmentSize
  }

  return outPos
}

export function compress(data: Uint8Array): Uint8Array {
  let maxLength = (32 + data.length + Math.floor(data.length / 6))
  let array = new Uint8Array(maxLength)
  let length = compressToBuffer(data, array)
  return array.slice(0, length)
}

console.log(compress(Buffer.from('Hello World 🌎')))