const fs = require('fs');
const gm = require('gm');
const path = require('path');
const mime = require('mime');
const util = require('util');
const stat = util.promisify(fs.stat);
const mkdir = util.promisify(fs.mkdir);
const events = require('events');

class Pdf2Img extends events.EventEmitter {
    constructor(opts) {
        super();
        this.options = {
            type: 'jpg',
            size: 1024,
            density: 600,
            quality: 100,
            outputdir: null,
            outputname: null,
            page: null
        };

        if (opts) {
            this.setOptions(opts);
        }
    }

    setOptions(opts) {
        this.options.type = opts.type || this.options.type;
        this.options.size = opts.size || this.options.size;
        this.options.density = opts.density || this.options.density;
        this.options.quality = opts.quality || this.options.quality;
        this.options.outputdir = opts.outputdir || this.options.outputdir;
        this.options.outputname = opts.outputname || this.options.outputname;
        this.options.page = opts.page || this.options.page;
    }

    async convert(input) {
        try {
            await this.validate(input);
            let pages = await this.getPagesCount(input);
            return this.convertPdf(input, pages);
        } catch (err) {
            console.error(err);
            throw err;
        }
    }

    async validate(input) {
        if (!input) {
            throw new Error('Invalid input file path.');
        }

        if (mime.getType(input) !== 'application/pdf') {
            throw new Error('Unsupported file type.');
        }

        await this.checkFile(input);
    }

    async checkFile(input) {
        try {
            let statInput = await stat(input);
            if (!statInput.isFile()) {
                throw '';
            }
        } catch (error) {
            throw new Error('Input file not found.');
        }
    }

    getPagesCount(input) {
        return new Promise((resolve, reject) => {
            this.emit(this.options.outputname, 'Detecting pages');

            gm(input).identify('%p ', (err, value) => {
                if (err) return reject(err);

                let pageCount = String(value).split(' ');

                if (!pageCount.length) {
                    return reject('Invalid page number.');
                } else {
                    this.emit(this.options.outputname, `Detected ${pageCount.length} pages`);

                    // Convert selected page
                    if (this.options.page !== null) {
                        if (this.options.page < pageCount.length) {
                            return resolve([this.options.page]);
                        } else {
                            return reject('Invalid page number.');
                        }
                    } else {
                        return resolve(pageCount);
                    }
                }
            });
        });
    }

    async convertPdf(input, pages) {
        try {
            let stdout = [];
            let output = this.getOutput(input);
            await this.setOutDir(output);
            this.setOutName(output);

            for (let page of pages) {
                this.emit(this.options.outputname, `Converting page ${parseInt(page)} of ${pages.length}`);
                let inputStream = fs.createReadStream(input);
                let outputFile = `${this.options.outputdir}${this.options.outputname}_${page}.${this.options.type}`;
                let result = await this.convertPdf2Img(inputStream, outputFile, parseInt(page));
                stdout.push(result);
            }

            return {
                result: 'success',
                message: stdout
            };
        } catch (err) {
            throw new Error(err);
        }
    }

    getOutput(input) {
        return path.basename(input, path.extname(path.basename(input)));
    }

    async setOutDir(output) {
        if (this.options.outputdir) {
            this.options.outputdir = this.options.outputdir + path.sep;
        } else {
            this.options.outputdir = output + path.sep;
        }

        await this.checkDirectory();
    }

    async checkDirectory() {
        try {
            let statDir = await stat(this.options.outputdir);
            if (!statDir.isDirectory()) {
                throw '';
            }
        } catch (err) {
            await mkdir(this.options.outputdir);
        }
    }

    setOutName(output) {
        if (this.options.outputname) {
            this.options.outputname = this.options.outputname;
        } else {
            this.options.outputname = output;
        }
    }

    async convertPdf2Img(inputStream, output, page) {
        return new Promise((resolve, reject) => {
            inputStream.on('error', (error) => {
                return reject(error);
            })
            let filename = `${inputStream.path}[${(page - 1)}]`;
            gm(inputStream, filename)
                .density(this.options.density, this.options.density)
                .resize(this.options.size)
                .quality(this.options.quality)
                .write(output, (err) => {
                    if (err) {
                        return reject('Wasn\'t able to write the output file.');
                    }

                    stat(output).then(statOut => {
                        if ((statOut.size / 1000) === 0) {
                            return reject('Zero sized output image detected.');
                        }

                        return resolve({
                            page: page,
                            name: path.basename(output),
                            size: statOut.size / 1000.0,
                            path: output
                        });
                    });
                });
        });
    }
}

module.exports = Pdf2Img;
