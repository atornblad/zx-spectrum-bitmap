(function() {
    
    var ZX = window['ZX'] || {};
    
    var Spectrum = ZX['Spectrum'] = ZX['Spectrum'] || {};
    
    var Basic = Spectrum['Basic'] = Spectrum['Basic'] || {};
    
    var tokensPattern = /([-+]?((\.\d+)|(\d+(\.\d+)?))(E([-+]?)\d+)?)|(TO|STEP)|([a-z]+)|([=,+/*)()])/gi;
    var NUMBER_TOKEN = 1,
        RESERVED_WORD_TOKEN = 8,
        IDENTIFIER_TOKEN = 9,
        OPERATOR_TOKEN = 10;
    
    var IGNORE_ARG = 0,
        NUMBER_ARG = 1,
        IDENTIFIER_ARG = 2;
    
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
        },
        "let" : {
            args : [IDENTIFIER_ARG, NUMBER_ARG],
            func : function(identifier, value) {
                this.variables[identifier] = value;
            }
        },
        "goto" : {
            args : [NUMBER_ARG],
            func : function(value) {
                return  {
                    goto_line : value
                };
            }
        },
        "stop" : {
            args : [],
            func : function() {
                return  {
                    goto_line : 10000
                };
            }
        },
        "poke" : {
            args : [NUMBER_ARG, NUMBER_ARG],
            func : function(address, value) {
                ZX.Spectrum.currentBitmap.poke(address, value);
            }
        },
        "for" : {
            args : [IDENTIFIER_ARG, NUMBER_ARG, "TO", NUMBER_ARG, "STEP", NUMBER_ARG],
            func : function(identifier, start, to, target, step, step_value) {
                step_value = typeof(step_value) == 'undefined' ? 1 : step_value;
                this.variables[identifier] = start;
                return { for_loop : {
                    identifier : identifier,
                    step_value : step_value,
                    target_value : target
                }};
            }
        },
        "next" : {
            args : [IDENTIFIER_ARG],
            func : function(identifier) {
                var for_loop = this.for_loops[identifier];
                
                if (for_loop) {
                    var value = this.variables[identifier];
                    value += for_loop.step_value;
                    var loop_done = (for_loop.step_value > 0 && value > for_loop.target_value) ||
                                    (for_loop.step_value < 0 && value < for_loop.target_value);
                    if (loop_done) {
                        delete this.for_loops[identifier];
                        return null;
                    } else {
                        this.variables[identifier] = value;
                        return { goto_index : for_loop.first_statement_index };
                    }
                } else {
                    return { error : "NEXT without FOR" };
                }
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
                        if (tokens[i].type == NUMBER_TOKEN) {
                            args.push(parseFloat(tokens[i].value));
                        } else if (tokens[i].type == IDENTIFIER_TOKEN) {
                            args.push(this.variables[tokens[i].value.toUpperCase()]);
                        }
                    } else if (command.args[args.length] == IDENTIFIER_ARG) {
                        if (tokens[i].type == IDENTIFIER_TOKEN) {
                            args.push(tokens[i].value.toUpperCase());
                        } else {
                            throw "Syntax error: " + lineOfCode;
                        }
                    } else if (typeof command.args[args.length] == "string") {
                        if (tokens[i].type == RESERVED_WORD_TOKEN && tokens[i].value.toUpperCase() == command.args[args.length].toUpperCase()) {
                            args.push(null);
                        } else {
                            throw "Syntax error: " + lineOfCode;
                        }
                    } else {
                        args.push(tokens[i].value);
                    }
                }
            }
            
            var result = command.func.apply(this, args);
            
            if (typeof result == 'undefined') {
                return null;
            } else {
                return result;
            }
        }
    };
    
    Basic['run'] = function run(code, speed) {
        speed = speed || 1;
        
        var runtime = {
            code : code,
            len : code.length,
            currentIndex : 0,
            variables : {},
            for_loops : {},
            goto_line : null
        }
        
        var stepFunc = function() {
            do {
                if (runtime.currentIndex >= runtime.len) return false;
                
                var nextLineFeed = runtime.code.indexOf('\n', runtime.currentIndex);
                var nextColon = runtime.code.indexOf(':', runtime.currentIndex);
                var nextStop;
                
                nextLineFeed = (nextLineFeed == -1) ? runtime.len : nextLineFeed;
                nextColon = (nextColon == -1) ? runtime.len : nextColon;
                nextStop = (nextLineFeed < nextColon) ? nextLineFeed : nextColon;
                
                var statement = runtime.code.substr(runtime.currentIndex, nextStop - runtime.currentIndex).trim();
                
                if (runtime.goto_line >= 1) {
                    var line_number = statement.match(/^\d{1,4}/);
                    if (line_number) {
                        line_number = parseInt(line_number[0]);
                        if (line_number >= runtime.goto_line) {
                            runtime.goto_line = null;
                        } else {
                            runtime.currentIndex = nextLineFeed + 1;
                        }
                    } else {
                        runtime.currentIndex = nextLineFeed + 1;
                    }
                }
            } while (runtime.goto_line >= 1);
            
            var result = runOneLine.call(runtime, statement);
            
            if (result == null) {
                runtime.currentIndex = nextStop + 1;
            } else if (result.error) {
                window.alert(result.error);
                return false;
            } else if (result.goto_line >= 1) {
                runtime.goto_line = result.goto_line;
                runtime.currentIndex = 0;
            } else if (result.goto_index >= 1) {
                runtime.currentIndex = result.goto_index;
            } else if (result.for_loop) {
                result.for_loop.first_statement_index = nextStop + 1;
                runtime.for_loops[result.for_loop.identifier] = result.for_loop;
                runtime.currentIndex = nextStop + 1;
            }
            
            return true;
        };
        
        var stepper = function() {
            var i = speed;
            while (i > 0) {
                var result = stepFunc();
                if (!result) break;
                --i;
            }
            
            if (result) {
                window.setTimeout(stepper, 1);
            }
        };
            
        stepper();
    };
    
    window['ZX'] = ZX;
    
})();
