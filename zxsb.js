(function() {
    
    if (!('Proxy' in window)) {
        window.setTimeout(function() {
            document.documentElement.textContent = "I'm sorry, ZX.Spectrum.Bitmap needs support for EcmaScript 6 Proxy objects to work.";
        }, 1);
        return;
    }
    
    var DEBUGOUTPUT = true;
    
    var WIDTH = 256;
    var HEIGHT = 192;
    var BLOCKWIDTH = (WIDTH >> 3);
    var BLOCKHEIGHT = (HEIGHT >> 3);
    
    var ATTROFFSET = BLOCKWIDTH * HEIGHT;
    var TOTALSIZE = BLOCKWIDTH * HEIGHT + BLOCKWIDTH * BLOCKHEIGHT;
    
    /*
    
    Address: (x = pixel)
    y7  y6 y2 y1 y0  y5 y4 y3 x7  x6 x5 x4 x3
    y: 0..191
    x: 0..255
    
    Address: (x = block)
    y7  y6 y2 y1 y0  y5 y4 y3 x4  x3 x2 x1 x0
    y: 0..191
    x: 0..31
    
    Address: (x = block, y = block)
    y4  y3  0  0  0  y2 y1 y0 x4  x3 x2 x1 x0
    y: 0..23
    x: 0..31
    
    Block index : x + (y / 8) * 32    = x + (y & 0xfe0) * 4:
                  y7 y6 y5 y4 y3 x4 x3 x2 x1 x0
                  Address & 0xff   |    (Address & 0x1800 >> 3)
    
    */
    
    var blockIndexFromOffset = function (offset) {
        if (offset < 0 || offset >= ATTROFFSET) return -1;
        return (offset & 0x00ff) | ((offset & 0x1800) >> 3);
    }
    
    var getPointInfo = function(x, y) {
        x &= 255;
        y &= 255;
        
        if (y > 191) return null;
        
        var xBlock = x >> 3;
        var yBlock = y >> 3;
        
        return {
            "x" : x,
            "y" : y,
            "blockX" : xBlock,
            "blockY" : yBlock,
            "attrIndex" : 6144 + (xBlock | (yBlock << 5)),
            "bitmapIndex" : xBlock | ((y & 0x0007) << 8) | ((y & 0x0038) << 2) | ((y & 0x00c0) << 5),
            "attrAddress" : 16384 + 6144 + (xBlock | (yBlock << 5)),
            "bitmapAddress" : 16384 + (xBlock | ((y & 0x0007) << 8) | ((y & 0x0038) << 2) | ((y & 0x00c0) << 5)),
            "bit" : 0x80 >> (x & 7)
        };
    };
    
    var $defaults = function(provided, defaults) {
        var output = {};
        
        for (var key in defaults) {
            if (provided && key in provided) {
                output[key] = provided[key];
            } else {
                output[key] = defaults[key];
            }
        }
        
        return output;
    };
    
//    var colorTable = ['#000000', '#0000cd', '#cd0000', '#cd00cd', '#00cd00', '#00cdcd', '#cdcd00', '#cdcdcd', '#000000', '#0000ff', '#ff0000', '#ff00ff', '#00ff00', '#00ffff', '#ffff00', '#ffffff'];
    var colorTable = [0, 0, 0, 0, 0, 205, 205, 0, 0, 205, 0, 205, 0, 205, 0, 0, 205, 205, 205, 205, 0, 205, 205, 205, 
                      0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 255, 255];
    
    var ZX = {};
    
    var Spectrum = ZX['Spectrum'] = {};
    
    var Bitmap = Spectrum['Bitmap'] = function Bitmap(options) {
        var i;
        
        var opts = $defaults(options, {
            "target" : null,
            "clear": false
        });
        
        var data = new Uint8ClampedArray(TOTALSIZE);
        
        if ('clear' in opts && opts['clear'] !== false) {
            for (i = 0; i < TOTALSIZE; ++i) {
                data[i] = opts['clear'];
            }
        } else {
            for (i = 0; i < TOTALSIZE; ++i) {
                data[i] = (Math.random() * 256) & 0xff;
            }
        }
        
        var dirty = new Array(BLOCKWIDTH * BLOCKHEIGHT);
        var hasDirt = true;
        var dirtMinBlock = 0;
        var dirtMaxBlock = ATTROFFSET - 1;
        
        for (i = 0; i < BLOCKWIDTH * BLOCKHEIGHT; ++i) dirty[i] = true;
        
        var dataProxy = this['data'] = new Proxy(data, {
            "set" : function(target, property, value, receiver) {
                if (property >= 0 && property < TOTALSIZE) {
                    data[property] = value;
                    
                    var dirtIndex;
                    if (property >= ATTROFFSET) {
                        dirtIndex = property - ATTROFFSET;
                    } else {
                        dirtIndex = blockIndexFromOffset(property);
                    }
                    
                    dirty[dirtIndex] = true;
                    if (dirtIndex < dirtMinBlock) dirtMinBlock = dirtIndex;
                    if (dirtIndex > dirtMaxBlock) dirtMaxBlock = dirtIndex;
                    
                    hasDirt = true;
                    
                    return true;
                }
                return false;
            }
        });
        
        var canvas;
        
        if (opts.target) {
            canvas = opts.target;
            canvas.width = 256;
            canvas.height = 192;
        } else {
            canvas = document.createElement('CANVAS');
            canvas.width = 256;
            canvas.height = 192;
            document.body.appendChild(canvas);
        }
        
        var context = canvas.getContext('2d');
        
        var flashPhase = 0;
        var lastFlashPhase = 0;
        
        var refreshFunc = function() {
            flashPhase = (flashPhase + 1) & 0x3f;
            var flashChange = (flashPhase ^ lastFlashPhase) & 0x20;
            lastFlashPhase = flashPhase;
            if (!(hasDirt || flashChange)) return;
            
            if (flashChange) {
                dirtMinBlock = 0;
                dirtMaxBlock = BLOCKWIDTH * BLOCKHEIGHT;
            }
            
            var imageData = context.getImageData(0, 0, 256, 192);
            var targetData = imageData.data;
            
            for (var dirtIndex = dirtMinBlock; dirtIndex <= dirtMaxBlock; ++dirtIndex) {
                var attributeByte = data[dirtIndex + ATTROFFSET];
                var flash = (attributeByte & 0x80);
                if (!(flashChange && flash || hasDirt)) continue;
                
                var xBlockIndex = (dirtIndex & 0x1f);
                var xLeft = (xBlockIndex << 3);
                var yBlockIndexNotShifted = (dirtIndex & 0x1fe0);
                var yBlockIndexShifted = (yBlockIndexNotShifted >> 5);
                var yTop = (yBlockIndexShifted << 3);
/*
    Address: (x = block, y = block)
    y4  y3  0  0  0  y2 y1 y0 x4  x3 x2 x1 x0
    y: 0..23
    x: 0..31
*/                
                var offsetFirst = xBlockIndex | (yBlockIndexNotShifted & 0x00e0) | ((yBlockIndexNotShifted & 0x0300) << 3);
                
                var ink = (attributeByte & 0x07) | ((attributeByte & 0x40) >> 3);
                var paper = (attributeByte & 0x78) >> 3;
                if (flash && (flashPhase & 0x20)) {
                    var temp = ink;
                    ink = paper;
                    paper = temp;
                }
                
                for (var yPixelOffset = 0; yPixelOffset < 8; ++yPixelOffset) {
                    var bitmapByte = data[offsetFirst | (yPixelOffset << 8)];
                    var imageDataOffset = ((yTop + yPixelOffset) * 256 + xLeft) * 4;
                    
                    for (var xPixelOffset = 0; xPixelOffset < 8; ++xPixelOffset) {
                        var colorIndex = (bitmapByte & (0x80 >> xPixelOffset)) ? ink : paper;
                        targetData[imageDataOffset++] = colorTable[colorIndex * 3];
                        targetData[imageDataOffset++] = colorTable[colorIndex * 3 + 1];
                        targetData[imageDataOffset++] = colorTable[colorIndex * 3 + 2];
                        targetData[imageDataOffset++] = 255;
                    }
                }
            }
            
            context.putImageData(imageData, 0, 0);
            
            hasDirt = false;
            dirtMinBlock = ATTROFFSET - 1;
            dirtMaxBlock = 0;
        };
        
        this['refresh'] = refreshFunc;
        
        if (!opts['defer']) {
            var func;
            
            if (DEBUGOUTPUT) {
                var maxTime = 0.0;
                var totalTime = 0.0;
                var ticks = 0;
                var nextTimeOutput = Date.now();
                
                func = function() {
                    var started = performance.now();
                    refreshFunc();
                    var ended = performance.now();
                    var timeTaken = ended - started;
                    totalTime += timeTaken;
                    ++ticks;
                    if (timeTaken > maxTime && ticks > 2) maxTime = timeTaken; 
                    var now = Date.now();
                    if (now > nextTimeOutput) {
                        console.log("Max time taken: " + maxTime.toFixed(1) + ", average time taken: " + (totalTime / ticks).toFixed(1));
                        nextTimeOutput += 5000;
                    }
                    window.requestAnimationFrame(func);
                };
            } else {
                func = function() {
                    refreshFunc();
                    window.requestAnimationFrame(func);
                }
            }
            func();
        }
        
        var currentInk = 0;
        var currentPaper = 7;
        var currentBright = 0;
        var currentFlash = 0;
        var currentAttrValue = 56;
        
        this['poke'] = function(address, value) {
            dataProxy[(address - 16384) & 0x1fff] = value & 255;
        };
        
        this['peek'] = function(address) {
            if (address < 16384 || address >= 16384 + TOTALSIZE) return 0;
            return data[(address - 16384) & 0x1fff];
        };
        
        this['ink'] = function(i) {
            currentInk = i & 7;
            currentAttrValue = currentAttrValue & 0xf8 | currentInk;
        };
        
        this['paper'] = function(p) {
            currentPaper = p & 7;
            currentAttrValue = currentAttrValue & 0xc7 | (currentPaper << 3)
        };
        
        this['bright'] = function(b) {
            currentBright = b & 1;
            currentAttrValue = currentAttrValue & 0xbf | (currentBright << 6);
        };
        
        this['flash'] = function(f) {
            currentFlash = f & 1;
            currentAttrValue = currentAttrValue & 0x7f | (currentFlash << 7);
        };
        
        this['plot'] = function(x, y) {
            var pointInfo = getPointInfo(x, y);
            if (!pointInfo) return;
            
            dataProxy[pointInfo.attrIndex] = currentAttrValue;
            dataProxy[pointInfo.bitmapIndex] |= pointInfo.bit;
        };
        
        this['line'] = function(x1, y1, x2, y2) {
            var dx = x2 - x1;
            var dy = y2 - y1;
            
            if (dx == 0 && dy == 0) {
                this['plot'](x1, y1);
                return;
            }
            
            var x, y;
            if (Math.abs(dx) > Math.abs(dy)) {
                // dx is bigger - go from x1 to x2 or from x2 to x1
                var xstart = dx > 0 ? x1 : x2;
                var xstop = x1 + x2 - xstart;
                
                for (x = xstart; x <= xstop; ++x) {
                    y = (x - x1) / (x2 - x1) * (y2 - y1) + y1;
                    this['plot'](x, y);
                }
            } else {
                // dy is bigger - go from y1 to y2 or from y2 to y1
                var ystart = dy > 0 ? y1 : y2;
                var ystop = y1 + y2 - ystart;
                for (y = ystart; y <= ystop; ++y) {
                    x = (y - y1) / (y2 - y1) * (x2 - x1) + x1;
                    this['plot'](x, y);
                }
            }
        };
        
        this['cls'] = function() {
            var i = 0;
            while (i < ATTROFFSET) {
                data[i++] = 0;
            }
            while (i < TOTALSIZE) {
                data[i++] = currentAttrValue;
            }
            
            dirtMinBlock = 0;
            dirtMaxBlock = BLOCKWIDTH * BLOCKHEIGHT;
            hasDirt = true;
        };
        
        Spectrum['currentBitmap'] = this;
    };
    
    Bitmap['getPointInfo'] = getPointInfo;
    
    window.ZX = ZX;
    
})();
