(function() {
    
    var ZX = window['ZX'] || {};
    
    var Spectrum = ZX['Spectrum'] = ZX['Spectrum'] || {};
    
    var Basic = Spectrum['Basic'] = Spectrum['Basic'] || {};
    
    var tokensPattern = /([-+]?((\.\d+)|(\d+(\.\d+)?))(E([-+]?)\d+)?)|(TO|STEP|THEN)|([a-z]+)|([,;])|([=<>+*\-/]+)/gi;
    var NUMBER_TOKEN = 1,
        RESERVED_WORD_TOKEN = 8,
        IDENTIFIER_TOKEN = 9,
        SEPARATOR_TOKEN = 10,
        OPERATOR_TOKEN = 11,
        EXPRESSION_TOKEN = 1000;
    
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
            args : [NUMBER_ARG, ",", NUMBER_ARG],
            func : function(x, comma, y) {
                ZX.Spectrum.currentBitmap.plot(x, y);
            }
        },
        "draw" : {
            args : [NUMBER_ARG, ",", NUMBER_ARG],
            func : function(x, comma, y) {
                ZX.Spectrum.currentBitmap.draw(x, y);
            }
        },
        "let" : {
            args : [IDENTIFIER_ARG, "=", NUMBER_ARG],
            func : function(identifier, equals, value) {
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
            args : [NUMBER_ARG, ", ", NUMBER_ARG],
            func : function(address, comma, value) {
                ZX.Spectrum.currentBitmap.poke(address, value);
            }
        },
        "for" : {
            args : [IDENTIFIER_ARG, "=", NUMBER_ARG, "TO", NUMBER_ARG, "STEP", NUMBER_ARG],
            func : function(identifier, equals, start, to, target, step, step_value) {
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
        },
        "rem" : {
            args : [],
            func : function() { }
        }
    };
    
    var groupExpressions = function(tokens, letOrForCommand) {
        var result = [];
        
        var currentExpressionTokens = [];
        
        for (var i = 1; i < tokens.length; ++i) {
            var token = tokens[i];
            
            if (letOrForCommand && ( (i == 1 && token.type == IDENTIFIER_TOKEN) || (i == 2 && token.value == '=') ) ) {
                result.push(token);
                continue;
            }
            
            if (token.type == SEPARATOR_TOKEN || token.type == RESERVED_WORD_TOKEN) {
                if (currentExpressionTokens.length == 1) {
                    result.push(currentExpressionTokens[0]);
                } else if (currentExpressionTokens.length > 1) {
                    result.push( {
                        type : EXPRESSION_TOKEN,
                        value : currentExpressionTokens
                    } );
                }
                currentExpressionTokens = [];
                result.push(token);
            } else {
                currentExpressionTokens.push(token);
            }
        }
        
        if (currentExpressionTokens.length == 1) {
            result.push(currentExpressionTokens[0]);
        } else if (currentExpressionTokens.length > 1) {
            result.push( {
                type : EXPRESSION_TOKEN,
                value : currentExpressionTokens
            } );
        }
        
        return result;
    };
    
    var operatorPriorities = {
        "+" : 1,
        "-" : 1,
        "*" : 2,
        "/" : 2
    };
    
    var getTokenPriority = function(token) {
        switch (token.type) {
            case OPERATOR_TOKEN:
                return operatorPriorities[token.value];
            default:
                return 999;
        }
    };
    
    var makeExpressionTree = function(tokens) {
        // this : runtime
        var root = {
            token : null,  // "return" token
            priority : 0,
            left : null,
            right : null,
            parent : null
        };
        
        var latestNode = root;
        
        var index = 0;
        
        while (index < tokens.length) {
            var current = tokens[index];
            var currentPriority = getTokenPriority(current);
            
            var targetParent = latestNode;
            
            while (targetParent.priority >= currentPriority) {
                targetParent = targetParent.parent;
            }
            
            latestNode = targetParent.right = {
                token : current,
                priority : currentPriority,
                left : targetParent.right,
                right : null,
                parent : targetParent
            };
            
            ++index;
        }
        
        return root;
    };
    
    var evaluateExpressionNode = function(node) {
        if (!node) return 0;
        
        if (node.token) {
            switch (node.token.type) {
                case OPERATOR_TOKEN:
                    switch (node.token.value) {
                        case '+':
                            return evaluateExpressionNode.call(this, node.left) +
                                   evaluateExpressionNode.call(this, node.right);
                        case '-':
                            return evaluateExpressionNode.call(this, node.left) -
                                   evaluateExpressionNode.call(this, node.right);
                        case '*':
                            return evaluateExpressionNode.call(this, node.left) *
                                   evaluateExpressionNode.call(this, node.right);
                        case '/':
                            return evaluateExpressionNode.call(this, node.left) /
                                   evaluateExpressionNode.call(this, node.right);
                    }
                    break;
                case IDENTIFIER_TOKEN:
                    var identifier = node.token.value.toUpperCase();
                    if (identifier == "RND") {
                        return Math.random();
                    } else if (identifier in this.variables) {
                        return this.variables[identifier];
                    } else {
                        return 0;
                    }
                case NUMBER_TOKEN:
                    return parseFloat(node.token.value);
            }
        } else {
            return evaluateExpressionNode.call(this, node.right);
        }
    };
    
    var evaluateExpression = function(token) {
        var tree = makeExpressionTree.call(this, token);
        
        return evaluateExpressionNode.call(this, tree);
    };
    
    var evaluateNumber = function(token) {
        // this : runtime
        switch (token.type) {
            case NUMBER_TOKEN:
                return parseFloat(token.value);
            case IDENTIFIER_TOKEN:
                if (token.value.toUpperCase() in this.variables) {
                    return parseFloat(this.variables[token.value.toUpperCase()]);
                } else {
                    return 0;
                }
            case EXPRESSION_TOKEN:
                return evaluateExpression.call(this, token.value);
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
        
        var commandName = tokens[0].value.toLowerCase();
        var command = commands[commandName];
        if (!command) {
            return { error : 'Unknown command: ' + commandName };
        } else {
            var letOrFor = (commandName == 'let' || commandName == 'for');
            tokens = groupExpressions.call(this, tokens, letOrFor);
            
            var args = [];
            for (var i = 0; i < tokens.length; ++i) {
                var argValue = tokens[i].value;
                
                if (command.args[args.length] == NUMBER_ARG) {
                    args.push(evaluateNumber.call(this, tokens[i]));
                } else if (command.args[args.length] == IDENTIFIER_ARG) {
                    if (tokens[i].type == IDENTIFIER_TOKEN) {
                        args.push(argValue.toUpperCase());
                    } else {
                        throw "Syntax error: " + lineOfCode;
                    }
                } else if (typeof command.args[args.length] == "string") {
                    if ((tokens[i].type == RESERVED_WORD_TOKEN || tokens[i].type == SEPARATOR_TOKEN || tokens[i].type == OPERATOR_TOKEN) && argValue.toUpperCase() == command.args[args.length].toUpperCase()) {
                        args.push(null);
                    } else {
                        throw "Syntax error: " + lineOfCode;
                    }
                } else {
                    args.push(argValue);
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
