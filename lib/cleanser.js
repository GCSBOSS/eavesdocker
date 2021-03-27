const { Transform } = require('stream');

function whilst(_test, _fn, callback) {
    var results = [];

    function next(err, ...rest) {
        if(err) return callback(err);
        results = rest;
        if(err === false) return;
        _test(check);
    }

    function check(err, truth) {
        if(err) return callback(err);
        if(err === false) return;
        if(!truth) return callback(null, ...results);
        _fn(next);
    }

    return _test(check);
}

const HEADER_LENGTH = 8;

class Cleanser extends Transform {
    constructor(options) { super(options) }
    cleanse (chunk, enc, cb) {
        if(!chunk || !chunk.length)
            return cb() ;
        let header = 0
        let endOfData = 0

        whilst(
            () => {
                if(chunk.length <= HEADER_LENGTH)
                    return false
                header = chunk.slice(0, HEADER_LENGTH)
                endOfData = HEADER_LENGTH + header.readUInt32BE(4)
                return chunk.length >= endOfData
            },
            whilstCb => {
                const content = chunk.slice(HEADER_LENGTH, endOfData)
                if(content.length)
                    this.push(content, enc);
                // move chunk along itself
                chunk = chunk.slice(endOfData)

                setTimeout(whilstCb, 0)
            }, () => {
                if(chunk.length)
                    this.buffer = Buffer.from(chunk)
                cb()
            })
    }
    _transform (chunk, enc, cb) {
        if(this.buffer) {
            chunk = Buffer.concat([this.buffer, chunk])
            delete this.buffer
        }
        this.cleanse(chunk, enc, cb)
    }

    _flush (cb) { this.cleanse(this.buffer, 'buffer', cb) }
}
module.exports = Cleanser
