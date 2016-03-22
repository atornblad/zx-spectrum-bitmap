(function() {
    
    var ZX = window['ZX'] || {};
    
    var Spectrum = ZX['Spectrum'] = ZX['Spectrum'] || {};
    
    var Basic = Spectrum['Basic'] = Spectrum['Basic'] || {};
    
    var tokensPattern = /([-+]?((\.\d+)|(\d+(\.\d+)?))(E([-+]?)\d+)?)|([a-z]+)|([=,+/*)()])/gi;
    var NUMBER_TOKEN = 1,
        IDENTIFIER_TOKEN = 8,
        OPERATOR_TOKEN = 9;
    
    var NUMBER_ARG = 1;
    
    var commands = {
        "ink" : {
            args : [NUMBER_ARG],
            func : function(value) {
                ZX.Spectrum.currentBitmap.ink(value);
            }
        },
        "paper" : {
            args : [NUMBER_ARG],
            func : function(value) {
                ZX.Spectrum.currentBitmap.paper(value);
            }
        },
        "bright" : {
            args : [NUMBER_ARG],
            func : function(value) {
                ZX.Spectrum.currentBitmap.bright(value);
            }
        },
        "flash" : {
            args : [NUMBER_ARG],
            func : function(value) {
                ZX.Spectrum.currentBitmap.flash(value);
            }
        },
        "cls" : {
            args : [],
            func : function() {
                ZX.Spectrum.currentBitmap.cls();
            }
        },
        "plot" : {
            args : [NUMBER_ARG, NUMBER_ARG],
            func : function(x, y) {
                ZX.Spectrum.currentBitmap.plot(x, y);
            }
        },
        "draw" : {
            args : [NUMBER_ARG, NUMBER_ARG],
            func : function(x, y) {
                ZX.Spectrum.currentBitmap.draw(x, y);
            }
        }
    };
    
    var runOneLine = function(lineOfCode) {
        if (lineOfCode.length == 0) return null;
        
        var tokens = [];
        
        var match = tokensPattern.exec(lineOfCode);
        
        while (match) {
            var value = match[0];
            var firstGroup = 0;
            for (var i = 1; i < match.length; ++i) {
                if (match[i]) {
                    firstGroup = i;
                    break;
                }
            }
            tokens.push({type: firstGroup, value:value});
            match = tokensPattern.exec(lineOfCode);
        }
        
        if (!tokens.length) return null;
        
        if (tokens[0].type == NUMBER_TOKEN) {
            // First token is a line number. Ignore it for now!
            tokens.splice(0, 1);
        }
        
        if (tokens[0].type != IDENTIFIER_TOKEN) {
            return { error : 'Syntax error: ' + lineOfCode };
        }
        
        // TODO: Support expressions like 5 + (x * 3)
        // But for now, keep it simple
        
        var commandName = tokens[0].value;
        var command = commands[commandName.toLowerCase()];
        if (!command) {
            return { error : 'Unknown command: ' + commandName };
        } else {
            var args = [];
            for (var i = 1; i < tokens.length; ++i) {
                if (tokens[i].type != OPERATOR_TOKEN) {
                    var argValue = tokens[i].value;
                    if (command.args[args.length] == NUMBER_ARG) {
                        args.push(parseFloat(tokens[i].value));
                    } else {
                        args.push(tokens[i].value);
                    }
                }
            }
            command.func.apply(null, args);
        }
        
        console.log(tokens);
        
        return null;
    };
    
    Basic['run'] = function run(code) {
        var len = code.length;
        
        var currentIndex = 0;
        
        while (currentIndex < len) {
            var nextLineFeed = code.indexOf('\n', currentIndex);
            var nextColon = code.indexOf(':', currentIndex);
            var nextStop;
            
            if (nextColon == -1 && nextLineFeed == -1) {
                nextStop = len;
            } else if (nextLineFeed == -1) {
                nextStop = nextColon;
            } else if (nextColon == -1) {
                nextStop = nextLineFeed;
            } else if (nextColon < nextLineFeed) {
                nextStop = nextColon;
            } else {
                nextStop = nextLineFeed;
            }
            
            var statement = code.substr(currentIndex, nextStop - currentIndex);
            
            var result = runOneLine(statement.trim());
            
            if (result == null) {
                currentIndex = nextStop + 1;
            } else if (result.error) {
                window.alert(result.error);
                break;
            }
        }
    };
    
    window['ZX'] = ZX;
    
})();
