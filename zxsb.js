(function() {
    
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
    
    ZX['Spectrum'] = {};
    
    ZX['Spectrum']['Bitmap'] = function(options) {
        var i;
        
        var opts = $defaults(options, {
            "target" : null,
            "clear": false
        });
        
        var data = new Uint8ClampedArray(TOTALSIZE);
        
        if ('clear' in opts) {
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
        
        this['data'] = new Proxy(data, {
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
            
            if (flashChange) {
                hasDirt = true;
                dirtMinBlock = 0;
                dirtMaxBlock = BLOCKWIDTH * BLOCKHEIGHT;
            }
            
            if (!hasDirt) return;
            
            var imageData = context.getImageData(0, 0, 256, 192);
            var targetData = imageData.data;
            
            for (var dirtIndex = dirtMinBlock; dirtIndex <= dirtMaxBlock; ++dirtIndex) {
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
                
                var attributeByte = data[dirtIndex + ATTROFFSET];
                var ink = (attributeByte & 0x07) | ((attributeByte & 0x40) >> 3);
                var paper = (attributeByte & 0x78) >> 3;
                var flash = (attributeByte & 0x80);
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
            var func = function() {
                refreshFunc();
                window.requestAnimationFrame(func);
            };
            func();
        }
        
        var handlers = {};
        
        this['addEventListener'] = function(type, handler) {
            if (!handlers[type]) handlers[type] = [];
            handlers[type].push(handler);
        };
        
        this['removeEventListener'] = function(type, handler) {
            if (!handlers[type]) return;
            var newArray = handlers[type].filter(function(element, index, array) { return element !== handler; });
            handlers[type] = newArray;
        };
        
        var leftMouseButtonDown = false;
        var rightMouseButtonDown = false;
        var middleMouseButtonDown = false;
        
        canvas.addEventListener('mousemove', (function(e) {
            if (e.offsetX >= 0 && e.offsetX <= 255 && e.offsetY >= 0 && e.offsetY <= 191) {
                if (handlers['zxsb-move']) {
                    var x = e.offsetX;
                    var y = e.offsetY;
                    var xBlock = x >> 3;
                    var yBlock = y >> 3;
/*
    Address: (x = block)
    y7  y6 y2 y1 y0  y5 y4 y3 x4  x3 x2 x1 x0
 */                    
                    var event = new CustomEvent('zxsb-move', { detail : {
                        "id" : leftMouseButtonDown ? "lmb" :
                               rightMouseButtonDown ? "rmb" :
                               middleMouseButtonDown ? "mmb" :
                               null,
                        "clientX" : x,
                        "clientY" : y,
                        "blockX" : xBlock,
                        "blockY" : yBlock,
                        "attrIndex" : 6144 + (xBlock | (yBlock << 5)),
                        "bitmapIndex" : xBlock | ((y & 0x0007) << 8) | ((y & 0x0038) << 2) | ((y & 0x00c0) << 5),
                        "bit" : 0x80 >> (x & 7)
                    }});
                    handlers['zxsb-move'].forEach(function(handler) {
                        handler.call(this, event);
                    });
                }
            }
        }).bind(this));
        
        canvas.addEventListener('mousedown', (function(e) {
            switch (e.button) {
                case 0:
                    leftMouseButtonDown = true;
                    break;
                case 1:
                    middleMouseButtonDown = true;
                    break;
                case 2:
                    rightMouseButtonDown = true;
                    break;
            }
        }).bind(this));
        
        canvas.addEventListener('mouseup', (function(e) {
            switch (e.button) {
                case 0:
                    leftMouseButtonDown = false;
                    break;
                case 1:
                    middleMouseButtonDown = false;
                    break;
                case 2:
                    rightMouseButtonDown = false;
                    break;
            }
        }).bind(this));
    };
    
    window.ZX = ZX;
    
})();
