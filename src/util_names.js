/*global CSL: true */

CSL.Util.Names = {};

CSL.Util.Names.compareNamesets = CSL.NameOutput.prototype._compareNamesets;

/**
 * Un-initialize a name (quash caps after first character)
 */
CSL.Util.Names.unInitialize = function (state, name) {
    var i, ilen, namelist, punctlist, ret;
    if (!name) {
        return "";
    }
    namelist = name.split(/(?:\-|\s+)/);
    punctlist = name.match(/(\-|\s+)/g);
    ret = "";
    for (i = 0, ilen = namelist.length; i < ilen; i += 1) {
        // if (CSL.ALL_ROMANESQUE_REGEXP.exec(namelist[i].slice(0,-1)) 
        //    && namelist[i] 
        //    && namelist[i] !== namelist[i].toUpperCase()) {

            // More or less like this, to address the following fault report:
            // http://forums.zotero.org/discussion/17610/apsa-problems-with-capitalization-of-mc-mac-etc/

            // Leaving the name string untouched because name capitalization is varied and wonderful.
            // https://github.com/Juris-M/citeproc-js/issues/43
            
            //namelist[i] = namelist[i].slice(0, 1) + namelist[i].slice(1, 2).toLowerCase() + namelist[i].slice(2);
        // }
        ret += namelist[i];
        if (i < ilen - 1) {
            ret += punctlist[i];
        }
    }
    return ret;
};

/**
 * Initialize a name.
 */
CSL.Util.Names.MarkupEngine = function(state, namelist) {
    /*
     * Markup is processed with four variables:
     * 1. Current tag position (tagPos)
     * 2. Tag offsets keyed to tagPos (tagOffsets)
     * 3. Current word position (wordPos)
     * 4. Word offsets keyed to wordPos (wordOffsets)
     * Tag and word offsets must be adjusted in tandem.
     */
    this.state = state;
    var x = CSL.Output.Formatters.tagDoppel.split(namelist);
    this.tagOffsets = x.strings.slice(0, -1).map(s => s.trim().length);
    this.tagList = x.tags;
    this.name = x.strings.join("");
    
    this.sum = function(arr, pos) {
        arr = arr.slice(0, pos+1);
        var ret = 0;
        for (var str of arr) {
            if (typeof str === "number") {
                ret += str;
            } else {
                ret += str.length;
            }
        }
        return ret;
    };
    
    this.init = function() {
        this.tagOffset = this.tagOffsets[0];
        this.tagPos = 0;
        this.HOLD = false;
    };

    this.elemInit = function(namelist, i, logger) {
        if (this.HOLD) return;
        var me = this;
        this.wordOffsets = namelist.map((s, xx) => {
            //me.state.sys.print(`${xx} ${s.length} ${s}`);
            return s.length;
        });
        //this.startLength = namelist.join("").trim().length;
        //this.startRaw = namelist.join("").trim();
        //this.endPos = namelist.slice(0, i+1).join("").trim().length;
        this.tagPos = 0;
        this.tagOffset = this.tagOffsets[0];
        this.wordOffset = this.sum(namelist, i);
        this.wordRaw = namelist.slice(0, i+1).join("");
        for (var j=0,jlen=this.tagOffsets.length;j<jlen;j++) {
            this.tagPos = j;
            this.tagOffset = this.tagOffset + this.tagOffsets[this.tagPos];
            if (this.tagOffset >= this.wordOffset) {
                this.tagPos = j;
                break;
            }
            if (j === this.tagOffsets.length-1) {
                this.HOLD = true;
            }
        }
        //if (logger) {
        //    this.state.sys.print(`    [elemInit] stringLen: ${this.sum(namelist, i)}, tagLen=${this.sum(this.tagOffsets, this.tagPos)} nextTagLen=${this.sum(this.tagOffsets, this.tagPos+1)}, tagPos=${this.tagPos}, tagOffsets=${JSON.stringify(this.tagOffsets)}`);
        //}
    };

    this.elemComplete = function(namelist, i, logger) {
        if (this.HOLD) return;
        var wordOffset = this.sum(namelist, i);
        var wordRaw = namelist.slice(0, i+1).join("");
        var tagOffsetShift = wordOffset - this.wordOffset;
        
        //if (logger) {
        //    this.state.sys.print(`    e[lemComplete] endLength=${this.endLength}, tagOffsetShift=${tagOffsetShift}, tagOffset=${this.tagOffset}`);
        //}
        
        this.tagOffsets[this.tagPos] += tagOffsetShift;
        this.state.sys.print(`    [${i}] tagOffsets(after)=${JSON.stringify(this.tagOffsets)}, tagOffsetShift=${tagOffsetShift}\n    <${this.wordRaw}>\n    <${wordRaw}>`);
    };

    this.complete = function(ret) {
        this.state.sys.print(`    OFFSETS ${JSON.stringify(this.tagOffsets)}`);
        var offset = 0;
        for (var tagOffset of this.tagOffsets) {
            offset += tagOffset;
        }
        for (var i=this.tagOffsets.length-1;i>-1;i--) {
            ret = ret.slice(0, offset) + this.tagList[i] + ret.slice(offset);
            offset = offset - this.tagOffsets[i];
        }
        return ret;
    };
};

CSL.Util.Names.initializeWith = function (state, name, terminator, normalizeOnly) {
    state.sys.print(`START ${JSON.stringify(name)}`);
    var i, ilen, mm, lst, ret;
    if (!name) {
        return "";
    }
    if (!terminator) {
        terminator = "";
    }

    if (["Lord", "Lady"].indexOf(name) > -1
        || (!name.replace(/^(?:<[^>]+>)*/, "").match(CSL.STARTSWITH_ROMANESQUE_REGEXP)
            && !terminator.match("%s"))) {
        return name;
    }
    if (state.opt["initialize-with-hyphen"] === false) {
        name = name.replace(/\-/g, " ");
    }

    // (1) Split the string
    name = name.replace(/\s*\-\s*/g, "-")
        .replace(/\s+/g, " ")
        .replace(/-([a-z])/g, "\u2013$1");

    for (var i=name.length-2; i>-1; i += -1) {
        if (name.slice(i, i+1) === "." && name.slice(i+1, i+2) !== " ") {
            name = name.slice(0, i) + ". " + name.slice(i+1);
        }
    }

    // Invoke markup engine only if needed
    var markupEngine = null;
    if (name.indexOf("<") > -1) {
        markupEngine = new this.MarkupEngine(state, name);
        name = markupEngine.name;
    }
    if (state.tmp.just_looking) {
        markupEngine = null;
    }
     
    // Workaround for Internet Explorer
    //namelist = namelist.split(/(\-|\s+)/);
    // Workaround for Internet Explorer
    mm = name.match(/[\-\s]+/g);
    lst = name.split(/[\-\s]+/);
    if (mm === null) {
        var mmm = lst[0].match(/[^\.]+$/);
        if (mmm && mmm[0].length === 1 && mmm[0] !== mmm[0].toLowerCase()) {
            lst[0] += ".";
        }
    }

    var namelist = [lst[0]];
    for (i = 1, ilen = lst.length; i < ilen; i += 1) {
        namelist.push(mm[i - 1]);
        namelist.push(lst[i]);
    }
    
    // Use doInitializeName or doNormalizeName, depending on requirements
    if (normalizeOnly) {
        ret = CSL.Util.Names.doNormalize(state, namelist, terminator, markupEngine);
    } else {
        ret = CSL.Util.Names.doInitialize(state, namelist, terminator, markupEngine);
    }
    ret = ret.replace(/\u2013([a-z])/g, "-$1");
    return ret;
};


CSL.Util.Names.doNormalize = function (state, namelist, terminator, markupEngine) {
    var i, ilen;
    // namelist is a flat list of given-name elements and space-like separators between them
    terminator = terminator ? terminator : "";
    // Flag elements that look like abbreviations
    var isAbbrev = [];
    if (markupEngine) {
        markupEngine.init();
    }
    //for (i = namelist.length-1; i > -1; i--) {
    for (i = 0, ilen = namelist.length; i < ilen; i += 1) {
        if (namelist[i].length > 1 && namelist[i].slice(-1) === ".") {
            if (markupEngine) {
                markupEngine.elemInit(namelist, i, true);
            }
            namelist[i] = namelist[i].slice(0, -1);
            if (markupEngine) {
                markupEngine.elemComplete(namelist, i, true);
            }
            isAbbrev.push(true);
        } else if (namelist[i].length === 1 && namelist[i].toUpperCase() === namelist[i]) {
            isAbbrev.push(true);
        } else {
            isAbbrev.push(false);
        }
    }
    
    // Step through the elements of the givenname array
    if (markupEngine) {
        markupEngine.init();
    }
    var namelistOrig = namelist.slice();
    for (i = 0, ilen=namelist.length; i<ilen; i += 2) {
    //for (i = namelist.length-1; i>-1; i += -2) {
        // If the element is not an abbreviation, leave it and its trailing spaces alone
        //state.sys.print(`    (${i})`);
        if (markupEngine) {
            markupEngine.elemInit(namelist, i);
        }
        if (isAbbrev[i]) {
            // For all elements but the last
            if (i < namelist.length - 2) {
                // Start from scratch on space-like things following an abbreviation
                namelist[i + 1] = "";

                if (!isAbbrev[i+2]) {
                    namelist[i + 1] = " ";
                }
                
                // Add the terminator to the element
                // If the following element is not a single-character abbreviation, remove a trailing zero-width non-break space, if present
                // These ops may leave some duplicate cruft in the elements and separators. This will be cleaned at the end of the function.
                if (namelistOrig[i + 2].length > 1) {
                    namelist[i] = namelist[i] + terminator.replace(/\ufeff$/, "");
                } else {
                    namelist[i] = namelist[i] + terminator;
                }
            }
            // For the last element (if it is an abbreviation), just append the terminator
            if (i === namelist.length - 1) {
                namelist[i] = namelist[i] + terminator;
            }
        } 
        if (markupEngine) {
            markupEngine.elemComplete(namelist, i);
        }
   }
    // Remove trailing cruft and duplicate spaces, and return
    var ret = namelist.join("").trim();
    if (markupEngine) {
        state.sys.print(`FINALE ${JSON.stringify(ret)} AND ${JSON.stringify(markupEngine.tagOffsets)}`);
        ret = markupEngine.complete(ret);
    }
    var ret = ret.replace(/[\u0009\u000a\u000b\u000c\u000d\u0020\ufeff\u00a0]+$/,"").replace(/\s*\-\s*/g, "-").replace(/[\u0009\u000a\u000b\u000c\u000d\u0020]+/g, " ");
    return ret;
};

CSL.Util.Names.doInitialize = function (state, namelist, terminator, markupEngine) {
    var i, ilen, m, j, jlen, lst, n;
    var namelistOrig = namelist.slice();
    if (markupEngine) {
        markupEngine.init();
    }
    for (i = 0, ilen = namelist.length; i < ilen; i += 2) {
        if (markupEngine) {
            markupEngine.elemInit(namelist, i);
        }
        n = namelist[i];
        if (!n) {
            continue;
        }
        m = n.match(CSL.NAME_INITIAL_REGEXP);
        if (!m && (!n.match(CSL.STARTSWITH_ROMANESQUE_REGEXP) && n.length > 1 && terminator.match("%s"))) {
            m = n.match(/(.)(.*)/);
        }
        if (m && m[2] && m[3]) {
            m[1] = m[1] + m[2];
            m[2] = "";
        }
        if (m && m[1].slice(0, 1) === m[1].slice(0, 1).toUpperCase()) {
            var extra = "";
            if (m[2]) {
                var s = "";
                lst = m[2].split("");
                for (j = 0, jlen = lst.length; j < jlen; j += 1) {
                    var c = lst[j];
                    if (c === c.toUpperCase()) {
                        s += c;
                    } else {
                        break;
                    }
                }
                if (s.length < m[2].length) {
                    extra = CSL.toLocaleLowerCase.call(state, s);
                }
            }
            namelist[i] = m[1] + extra;
            if (i < (ilen - 1)) {
                if (terminator.match("%s")) {
                    namelist[i] = terminator.replace("%s", namelist[i]);
                } else {
                    if (namelistOrig[i + 1].indexOf("-") > -1) {
                        namelist[i + 1] = terminator + namelist[i + 1];
                    } else {
                        namelist[i + 1] = terminator;
                    }
                }
            } else {
                if (terminator.match("%s")) {
                    namelist[i] = terminator.replace("%s", namelist[i]);
                } else {
                    namelist.push(terminator);
                }
            }
        } else if (n.match(CSL.ROMANESQUE_REGEXP) && (!m || !m[3])) {
            namelist[i] = " " + n;
        }
        if (markupEngine) {
            markupEngine.elemComplete(namelist, i);
        }
    }
    var ret = namelist.join("").trim();
    if (markupEngine) {
        ret = markupEngine.complete(ret);
    }
    ret = ret.replace(/[\u0009\u000a\u000b\u000c\u000d\u0020\ufeff\u00a0]+$/,"").replace(/\s*\-\s*/g, "-").replace(/[\u0009\u000a\u000b\u000c\u000d\u0020]+/g, " ");
    return ret;
};

CSL.Util.Names.getRawName = function (name) {
    var ret = [];
    if (name.literal) {
        ret.push(name.literal);
    } else {
        if (name.given) {
            ret.push(name.given);
        }
        if (name.family) {
            ret.push(name.family);
        }
    }
    return ret.join(" ");
};

// deleted CSL.Util.Names.initNameSlices()
// no longer used.

// deleted CSL.Util.Names,rescueNameElements()
// apparently not used.


