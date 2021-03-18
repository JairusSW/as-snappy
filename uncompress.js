
let WORD_MASK = [0, 0xff, 0xffff, 0xffffff, 0xffffffff]

function copyBytes (fromArray, fromPos, toArray, toPos, length) {
  let i
  for (i = 0; i < length; i++) {
    toArray[toPos + i] = fromArray[fromPos + i]
  }
}

function selfCopyBytes (array, pos, offset, length) {
  let i
  for (i = 0; i < length; i++) {
    array[pos + i] = array[pos - offset + i]
  }
}

class SnappyDecompressor {
    constructor(data) {
        this.array = data
        this.pos = 0
    }
    readUncompressedLength() {
        let result = 0
        let shift = 0
        let c, val
        while (shift < 32 && this.pos < this.array.length) {
          c = this.array[this.pos]
          this.pos += 1
          val = c & 0x7f
          if (((val << shift) >>> shift) !== val) {
            return -1
          }
          result |= val << shift
          if (c < 128) {
            return result
          }
          shift += 7
        }
        return -1
    }

    uncompressToBuffer(outBuffer) {
        let array = this.array
        let arrayLength = array.length
        let pos = this.pos
        let outPos = 0
      
        let c, len, smallLen
        let offset
      
        while (pos < array.length) {
          c = array[pos]
          pos += 1
          if ((c & 0x3) === 0) {
            // Literal
            len = (c >>> 2) + 1
            if (len > 60) {
              if (pos + 3 >= arrayLength) {
                return false
              }
              smallLen = len - 60
              len = array[pos] + (array[pos + 1] << 8) + (array[pos + 2] << 16) + (array[pos + 3] << 24)
              len = (len & WORD_MASK[smallLen]) + 1
              pos += smallLen
            }
            if (pos + len > arrayLength) {
              return false
            }
            copyBytes(array, pos, outBuffer, outPos, len)
            pos += len
            outPos += len
          } else {
            switch (c & 0x3) {
              case 1:
                len = ((c >>> 2) & 0x7) + 4
                offset = array[pos] + ((c >>> 5) << 8)
                pos += 1
                break
              case 2:
                if (pos + 1 >= arrayLength) {
                  return false
                }
                len = (c >>> 2) + 1
                offset = array[pos] + (array[pos + 1] << 8)
                pos += 2
                break
              case 3:
                if (pos + 3 >= arrayLength) {
                  return false
                }
                len = (c >>> 2) + 1
                offset = array[pos] + (array[pos + 1] << 8) + (array[pos + 2] << 16) + (array[pos + 3] << 24)
                pos += 4
                break
              default:
                break
            }
            if (offset === 0 || offset > outPos) {
              return false
            }
            selfCopyBytes(outBuffer, outPos, offset, len)
            outPos += len
          }
        }
        return true
    }
}

function uncompress (data) {

    const compresser = new SnappyDecompressor(data)

    const length = compresser.readUncompressedLength()

    const uint8 = new Uint8Array(length)

    compresser.uncompressToBuffer(uint8)

    return uint8

}

module.exports = uncompress