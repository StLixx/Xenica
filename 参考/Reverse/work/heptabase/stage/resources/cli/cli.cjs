#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/commander/lib/error.js
var require_error = __commonJS({
  "node_modules/commander/lib/error.js"(exports2) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports2.CommanderError = CommanderError2;
    exports2.InvalidArgumentError = InvalidArgumentError2;
  }
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "node_modules/commander/lib/argument.js"(exports2) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports2.Argument = Argument2;
    exports2.humanReadableArgName = humanReadableArgName;
  }
});

// node_modules/commander/lib/help.js
var require_help = __commonJS({
  "node_modules/commander/lib/help.js"(exports2) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.minWidthToWrap = 40;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * prepareContext is called by Commander after applying overrides from `Command.configureHelp()`
       * and just before calling `formatHelp()`.
       *
       * Commander just uses the helpWidth and the rest is provided for optional use by more complex subclasses.
       *
       * @param {{ error?: boolean, helpWidth?: number, outputHasColors?: boolean }} contextOptions
       */
      prepareContext(contextOptions) {
        this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(
            max,
            this.displayWidth(
              helper.styleSubcommandTerm(helper.subcommandTerm(command))
            )
          );
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(
            max,
            this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
          );
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(
            max,
            this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
          );
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(
            max,
            this.displayWidth(
              helper.styleArgumentTerm(helper.argumentTerm(argument))
            )
          );
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescription = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescription}`;
          }
          return extraDescription;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth ?? 80;
        function callFormatItem(term, description) {
          return helper.formatItem(term, termWidth, description, helper);
        }
        let output = [
          `${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(cmd))}`,
          ""
        ];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([
            helper.boxWrap(
              helper.styleCommandDescription(commandDescription),
              helpWidth
            ),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return callFormatItem(
            helper.styleArgumentTerm(helper.argumentTerm(argument)),
            helper.styleArgumentDescription(helper.argumentDescription(argument))
          );
        });
        if (argumentList.length > 0) {
          output = output.concat([
            helper.styleTitle("Arguments:"),
            ...argumentList,
            ""
          ]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return callFormatItem(
            helper.styleOptionTerm(helper.optionTerm(option)),
            helper.styleOptionDescription(helper.optionDescription(option))
          );
        });
        if (optionList.length > 0) {
          output = output.concat([
            helper.styleTitle("Options:"),
            ...optionList,
            ""
          ]);
        }
        if (helper.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return callFormatItem(
              helper.styleOptionTerm(helper.optionTerm(option)),
              helper.styleOptionDescription(helper.optionDescription(option))
            );
          });
          if (globalOptionList.length > 0) {
            output = output.concat([
              helper.styleTitle("Global Options:"),
              ...globalOptionList,
              ""
            ]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return callFormatItem(
            helper.styleSubcommandTerm(helper.subcommandTerm(cmd2)),
            helper.styleSubcommandDescription(helper.subcommandDescription(cmd2))
          );
        });
        if (commandList.length > 0) {
          output = output.concat([
            helper.styleTitle("Commands:"),
            ...commandList,
            ""
          ]);
        }
        return output.join("\n");
      }
      /**
       * Return display width of string, ignoring ANSI escape sequences. Used in padding and wrapping calculations.
       *
       * @param {string} str
       * @returns {number}
       */
      displayWidth(str) {
        return stripColor(str).length;
      }
      /**
       * Style the title for displaying in the help. Called with 'Usage:', 'Options:', etc.
       *
       * @param {string} str
       * @returns {string}
       */
      styleTitle(str) {
        return str;
      }
      styleUsage(str) {
        return str.split(" ").map((word) => {
          if (word === "[options]") return this.styleOptionText(word);
          if (word === "[command]") return this.styleSubcommandText(word);
          if (word[0] === "[" || word[0] === "<")
            return this.styleArgumentText(word);
          return this.styleCommandText(word);
        }).join(" ");
      }
      styleCommandDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleOptionDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleSubcommandDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleArgumentDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleDescriptionText(str) {
        return str;
      }
      styleOptionTerm(str) {
        return this.styleOptionText(str);
      }
      styleSubcommandTerm(str) {
        return str.split(" ").map((word) => {
          if (word === "[options]") return this.styleOptionText(word);
          if (word[0] === "[" || word[0] === "<")
            return this.styleArgumentText(word);
          return this.styleSubcommandText(word);
        }).join(" ");
      }
      styleArgumentTerm(str) {
        return this.styleArgumentText(str);
      }
      styleOptionText(str) {
        return str;
      }
      styleArgumentText(str) {
        return str;
      }
      styleSubcommandText(str) {
        return str;
      }
      styleCommandText(str) {
        return str;
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Detect manually wrapped and indented strings by checking for line break followed by whitespace.
       *
       * @param {string} str
       * @returns {boolean}
       */
      preformatted(str) {
        return /\n[^\S\r\n]/.test(str);
      }
      /**
       * Format the "item", which consists of a term and description. Pad the term and wrap the description, indenting the following lines.
       *
       * So "TTT", 5, "DDD DDDD DD DDD" might be formatted for this.helpWidth=17 like so:
       *   TTT  DDD DDDD
       *        DD DDD
       *
       * @param {string} term
       * @param {number} termWidth
       * @param {string} description
       * @param {Help} helper
       * @returns {string}
       */
      formatItem(term, termWidth, description, helper) {
        const itemIndent = 2;
        const itemIndentStr = " ".repeat(itemIndent);
        if (!description) return itemIndentStr + term;
        const paddedTerm = term.padEnd(
          termWidth + term.length - helper.displayWidth(term)
        );
        const spacerWidth = 2;
        const helpWidth = this.helpWidth ?? 80;
        const remainingWidth = helpWidth - termWidth - spacerWidth - itemIndent;
        let formattedDescription;
        if (remainingWidth < this.minWidthToWrap || helper.preformatted(description)) {
          formattedDescription = description;
        } else {
          const wrappedDescription = helper.boxWrap(description, remainingWidth);
          formattedDescription = wrappedDescription.replace(
            /\n/g,
            "\n" + " ".repeat(termWidth + spacerWidth)
          );
        }
        return itemIndentStr + paddedTerm + " ".repeat(spacerWidth) + formattedDescription.replace(/\n/g, `
${itemIndentStr}`);
      }
      /**
       * Wrap a string at whitespace, preserving existing line breaks.
       * Wrapping is skipped if the width is less than `minWidthToWrap`.
       *
       * @param {string} str
       * @param {number} width
       * @returns {string}
       */
      boxWrap(str, width) {
        if (width < this.minWidthToWrap) return str;
        const rawLines = str.split(/\r\n|\n/);
        const chunkPattern = /[\s]*[^\s]+/g;
        const wrappedLines = [];
        rawLines.forEach((line) => {
          const chunks = line.match(chunkPattern);
          if (chunks === null) {
            wrappedLines.push("");
            return;
          }
          let sumChunks = [chunks.shift()];
          let sumWidth = this.displayWidth(sumChunks[0]);
          chunks.forEach((chunk) => {
            const visibleWidth = this.displayWidth(chunk);
            if (sumWidth + visibleWidth <= width) {
              sumChunks.push(chunk);
              sumWidth += visibleWidth;
              return;
            }
            wrappedLines.push(sumChunks.join(""));
            const nextChunk = chunk.trimStart();
            sumChunks = [nextChunk];
            sumWidth = this.displayWidth(nextChunk);
          });
          wrappedLines.push(sumChunks.join(""));
        });
        return wrappedLines.join("\n");
      }
    };
    function stripColor(str) {
      const sgrPattern = /\x1b\[\d*(;\d*)*m/g;
      return str.replace(sgrPattern, "");
    }
    exports2.Help = Help2;
    exports2.stripColor = stripColor;
  }
});

// node_modules/commander/lib/option.js
var require_option = __commonJS({
  "node_modules/commander/lib/option.js"(exports2) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as an object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        if (this.negate) {
          return camelcase(this.name().replace(/^no-/, ""));
        }
        return camelcase(this.name());
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const shortFlagExp = /^-[^-]$/;
      const longFlagExp = /^--[^-]/;
      const flagParts = flags.split(/[ |,]+/).concat("guard");
      if (shortFlagExp.test(flagParts[0])) shortFlag = flagParts.shift();
      if (longFlagExp.test(flagParts[0])) longFlag = flagParts.shift();
      if (!shortFlag && shortFlagExp.test(flagParts[0]))
        shortFlag = flagParts.shift();
      if (!shortFlag && longFlagExp.test(flagParts[0])) {
        shortFlag = longFlag;
        longFlag = flagParts.shift();
      }
      if (flagParts[0].startsWith("-")) {
        const unsupportedFlag = flagParts[0];
        const baseError = `option creation failed due to '${unsupportedFlag}' in option flags '${flags}'`;
        if (/^-[^-][^-]/.test(unsupportedFlag))
          throw new Error(
            `${baseError}
- a short flag is a single dash and a single character
  - either use a single dash and a single character (for a short flag)
  - or use a double dash for a long option (and can have two, like '--ws, --workspace')`
          );
        if (shortFlagExp.test(unsupportedFlag))
          throw new Error(`${baseError}
- too many short flags`);
        if (longFlagExp.test(unsupportedFlag))
          throw new Error(`${baseError}
- too many long flags`);
        throw new Error(`${baseError}
- unrecognised flag format`);
      }
      if (shortFlag === void 0 && longFlag === void 0)
        throw new Error(
          `option creation failed due to no flags found in '${flags}'.`
        );
      return { shortFlag, longFlag };
    }
    exports2.Option = Option2;
    exports2.DualOptions = DualOptions;
  }
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "node_modules/commander/lib/suggestSimilar.js"(exports2) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports2.suggestSimilar = suggestSimilar;
  }
});

// node_modules/commander/lib/command.js
var require_command = __commonJS({
  "node_modules/commander/lib/command.js"(exports2) {
    var EventEmitter = require("node:events").EventEmitter;
    var childProcess = require("node:child_process");
    var path = require("node:path");
    var fs = require("node:fs");
    var process2 = require("node:process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2, stripColor } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = false;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._savedState = null;
        this._outputConfiguration = {
          writeOut: (str) => process2.stdout.write(str),
          writeErr: (str) => process2.stderr.write(str),
          outputError: (str, write) => write(str),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          getOutHasColors: () => useColor() ?? (process2.stdout.isTTY && process2.stdout.hasColors?.()),
          getErrHasColors: () => useColor() ?? (process2.stderr.isTTY && process2.stderr.hasColors?.()),
          stripColor: (str) => stripColor(str)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // change how output being written, defaults to stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // change how output being written for errors, defaults to writeErr
       *     outputError(str, write) // used for displaying errors and not used for displaying help
       *     // specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // color support, currently only used with Help
       *     getOutHasColors()
       *     getErrHasColors()
       *     stripColor() // used to remove ANSI escape codes if output does not have colors
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, fn, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          return this;
        }
        enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name) => this._findCommand(name)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('--pt, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process2.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process2.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process2.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      _prepareForParse() {
        if (this._savedState === null) {
          this.saveStateBeforeParse();
        } else {
          this.restoreStateBeforeParse();
        }
      }
      /**
       * Called the first time parse is called to save state and allow a restore before subsequent calls to parse.
       * Not usually called directly, but available for subclasses to save their custom state.
       *
       * This is called in a lazy way. Only commands used in parsing chain will have state saved.
       */
      saveStateBeforeParse() {
        this._savedState = {
          // name is stable if supplied by author, but may be unspecified for root command and deduced during parsing
          _name: this._name,
          // option values before parse have default values (including false for negated options)
          // shallow clones
          _optionValues: { ...this._optionValues },
          _optionValueSources: { ...this._optionValueSources }
        };
      }
      /**
       * Restore state before parse for calls after the first.
       * Not usually called directly, but available for subclasses to save their custom state.
       *
       * This is called in a lazy way. Only commands used in parsing chain will have state restored.
       */
      restoreStateBeforeParse() {
        if (this._storeOptionsAsProperties)
          throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
        this._name = this._savedState._name;
        this._scriptPath = null;
        this.rawArgs = [];
        this._optionValues = { ...this._savedState._optionValues };
        this._optionValueSources = { ...this._savedState._optionValueSources };
        this.args = [];
        this.processedArgs = [];
      }
      /**
       * Throw if expected executable is missing. Add lots of help for author.
       *
       * @param {string} executableFile
       * @param {string} executableDir
       * @param {string} subcommandName
       */
      _checkForMissingExecutable(executableFile, executableDir, subcommandName) {
        if (fs.existsSync(executableFile)) return;
        const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
        const executableMissing = `'${executableFile}' does not exist
 - if '${subcommandName}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
        throw new Error(executableMissing);
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path.resolve(baseDir, baseName);
          if (fs.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path.extname(baseName))) return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs.existsSync(`${localBin}${ext}`)
          );
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs.realpathSync(this._scriptPath);
          } catch {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path.resolve(
            path.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path.basename(
              this._scriptPath,
              path.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          this._checkForMissingExecutable(
            executableFile,
            executableDir,
            subcommand._name
          );
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process2.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            this._checkForMissingExecutable(
              executableFile,
              executableDir,
              subcommand._name
            );
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        subCommand._prepareForParse();
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Side effects: modifies command by storing options. Does not reset state if called again.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} argv
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg);
              if (args.length > 0) operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0) dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage2 = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage2(option)} cannot be used with ${getErrorMessage2(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0) return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str) {
        if (str === void 0) return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str) {
        if (str === void 0) return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path.basename(filename, path.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path2) {
        if (path2 === void 0) return this._executableDir;
        this._executableDir = path2;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        const context = this._getOutputContext(contextOptions);
        helper.prepareContext({
          error: context.error,
          helpWidth: context.helpWidth,
          outputHasColors: context.hasColors
        });
        const text = helper.formatHelp(this, helper);
        if (context.hasColors) return text;
        return this._outputConfiguration.stripColor(text);
      }
      /**
       * @typedef HelpContext
       * @type {object}
       * @property {boolean} error
       * @property {number} helpWidth
       * @property {boolean} hasColors
       * @property {function} write - includes stripColor if needed
       *
       * @returns {HelpContext}
       * @private
       */
      _getOutputContext(contextOptions) {
        contextOptions = contextOptions || {};
        const error = !!contextOptions.error;
        let baseWrite;
        let hasColors;
        let helpWidth;
        if (error) {
          baseWrite = (str) => this._outputConfiguration.writeErr(str);
          hasColors = this._outputConfiguration.getErrHasColors();
          helpWidth = this._outputConfiguration.getErrHelpWidth();
        } else {
          baseWrite = (str) => this._outputConfiguration.writeOut(str);
          hasColors = this._outputConfiguration.getOutHasColors();
          helpWidth = this._outputConfiguration.getOutHelpWidth();
        }
        const write = (str) => {
          if (!hasColors) str = this._outputConfiguration.stripColor(str);
          return baseWrite(str);
        };
        return { error, write, hasColors, helpWidth };
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const outputContext = this._getOutputContext(contextOptions);
        const eventContext = {
          error: outputContext.error,
          write: outputContext.write,
          command: this
        };
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", eventContext));
        this.emit("beforeHelp", eventContext);
        let helpInformation = this.helpInformation({ error: outputContext.error });
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        outputContext.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", eventContext);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", eventContext)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            this._helpOption = this._helpOption ?? void 0;
          } else {
            this._helpOption = null;
          }
          return this;
        }
        flags = flags ?? "-h, --help";
        description = description ?? "display help for command";
        this._helpOption = this.createOption(flags, description);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = Number(process2.exitCode ?? 0);
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * // Do a little typing to coordinate emit and listener for the help text events.
       * @typedef HelpTextEventContext
       * @type {object}
       * @property {boolean} error
       * @property {Command} command
       * @property {function} write
       */
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    function useColor() {
      if (process2.env.NO_COLOR || process2.env.FORCE_COLOR === "0" || process2.env.FORCE_COLOR === "false")
        return false;
      if (process2.env.FORCE_COLOR || process2.env.CLICOLOR_FORCE !== void 0)
        return true;
      return void 0;
    }
    exports2.Command = Command2;
    exports2.useColor = useColor;
  }
});

// node_modules/commander/index.js
var require_commander = __commonJS({
  "node_modules/commander/index.js"(exports2) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports2.program = new Command2();
    exports2.createCommand = (name) => new Command2(name);
    exports2.createOption = (flags, description) => new Option2(flags, description);
    exports2.createArgument = (name, description) => new Argument2(name, description);
    exports2.Command = Command2;
    exports2.Option = Option2;
    exports2.Argument = Argument2;
    exports2.Help = Help2;
    exports2.CommanderError = CommanderError2;
    exports2.InvalidArgumentError = InvalidArgumentError2;
    exports2.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// ../../node_modules/dayjs/dayjs.min.js
var require_dayjs_min = __commonJS({
  "../../node_modules/dayjs/dayjs.min.js"(exports2, module2) {
    !(function(t, e) {
      "object" == typeof exports2 && "undefined" != typeof module2 ? module2.exports = e() : "function" == typeof define && define.amd ? define(e) : (t = "undefined" != typeof globalThis ? globalThis : t || self).dayjs = e();
    })(exports2, (function() {
      "use strict";
      var t = 1e3, e = 6e4, n = 36e5, r = "millisecond", i = "second", s = "minute", u = "hour", a = "day", o = "week", f = "month", h = "quarter", c = "year", d = "date", $ = "Invalid Date", l = /^(\d{4})[-/]?(\d{1,2})?[-/]?(\d{0,2})[Tt\s]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?[.:]?(\d+)?$/, y = /\[([^\]]+)]|Y{1,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g, M = { name: "en", weekdays: "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"), months: "January_February_March_April_May_June_July_August_September_October_November_December".split("_") }, m = function(t2, e2, n2) {
        var r2 = String(t2);
        return !r2 || r2.length >= e2 ? t2 : "" + Array(e2 + 1 - r2.length).join(n2) + t2;
      }, g = { s: m, z: function(t2) {
        var e2 = -t2.utcOffset(), n2 = Math.abs(e2), r2 = Math.floor(n2 / 60), i2 = n2 % 60;
        return (e2 <= 0 ? "+" : "-") + m(r2, 2, "0") + ":" + m(i2, 2, "0");
      }, m: function t2(e2, n2) {
        if (e2.date() < n2.date()) return -t2(n2, e2);
        var r2 = 12 * (n2.year() - e2.year()) + (n2.month() - e2.month()), i2 = e2.clone().add(r2, f), s2 = n2 - i2 < 0, u2 = e2.clone().add(r2 + (s2 ? -1 : 1), f);
        return +(-(r2 + (n2 - i2) / (s2 ? i2 - u2 : u2 - i2)) || 0);
      }, a: function(t2) {
        return t2 < 0 ? Math.ceil(t2) || 0 : Math.floor(t2);
      }, p: function(t2) {
        return { M: f, y: c, w: o, d: a, D: d, h: u, m: s, s: i, ms: r, Q: h }[t2] || String(t2 || "").toLowerCase().replace(/s$/, "");
      }, u: function(t2) {
        return void 0 === t2;
      } }, D = "en", v = {};
      v[D] = M;
      var p = function(t2) {
        return t2 instanceof _;
      }, S = function(t2, e2, n2) {
        var r2;
        if (!t2) return D;
        if ("string" == typeof t2) v[t2] && (r2 = t2), e2 && (v[t2] = e2, r2 = t2);
        else {
          var i2 = t2.name;
          v[i2] = t2, r2 = i2;
        }
        return !n2 && r2 && (D = r2), r2 || !n2 && D;
      }, w = function(t2, e2) {
        if (p(t2)) return t2.clone();
        var n2 = "object" == typeof e2 ? e2 : {};
        return n2.date = t2, n2.args = arguments, new _(n2);
      }, O = g;
      O.l = S, O.i = p, O.w = function(t2, e2) {
        return w(t2, { locale: e2.$L, utc: e2.$u, x: e2.$x, $offset: e2.$offset });
      };
      var _ = (function() {
        function M2(t2) {
          this.$L = S(t2.locale, null, true), this.parse(t2);
        }
        var m2 = M2.prototype;
        return m2.parse = function(t2) {
          this.$d = (function(t3) {
            var e2 = t3.date, n2 = t3.utc;
            if (null === e2) return /* @__PURE__ */ new Date(NaN);
            if (O.u(e2)) return /* @__PURE__ */ new Date();
            if (e2 instanceof Date) return new Date(e2);
            if ("string" == typeof e2 && !/Z$/i.test(e2)) {
              var r2 = e2.match(l);
              if (r2) {
                var i2 = r2[2] - 1 || 0, s2 = (r2[7] || "0").substring(0, 3);
                return n2 ? new Date(Date.UTC(r2[1], i2, r2[3] || 1, r2[4] || 0, r2[5] || 0, r2[6] || 0, s2)) : new Date(r2[1], i2, r2[3] || 1, r2[4] || 0, r2[5] || 0, r2[6] || 0, s2);
              }
            }
            return new Date(e2);
          })(t2), this.$x = t2.x || {}, this.init();
        }, m2.init = function() {
          var t2 = this.$d;
          this.$y = t2.getFullYear(), this.$M = t2.getMonth(), this.$D = t2.getDate(), this.$W = t2.getDay(), this.$H = t2.getHours(), this.$m = t2.getMinutes(), this.$s = t2.getSeconds(), this.$ms = t2.getMilliseconds();
        }, m2.$utils = function() {
          return O;
        }, m2.isValid = function() {
          return !(this.$d.toString() === $);
        }, m2.isSame = function(t2, e2) {
          var n2 = w(t2);
          return this.startOf(e2) <= n2 && n2 <= this.endOf(e2);
        }, m2.isAfter = function(t2, e2) {
          return w(t2) < this.startOf(e2);
        }, m2.isBefore = function(t2, e2) {
          return this.endOf(e2) < w(t2);
        }, m2.$g = function(t2, e2, n2) {
          return O.u(t2) ? this[e2] : this.set(n2, t2);
        }, m2.unix = function() {
          return Math.floor(this.valueOf() / 1e3);
        }, m2.valueOf = function() {
          return this.$d.getTime();
        }, m2.startOf = function(t2, e2) {
          var n2 = this, r2 = !!O.u(e2) || e2, h2 = O.p(t2), $2 = function(t3, e3) {
            var i2 = O.w(n2.$u ? Date.UTC(n2.$y, e3, t3) : new Date(n2.$y, e3, t3), n2);
            return r2 ? i2 : i2.endOf(a);
          }, l2 = function(t3, e3) {
            return O.w(n2.toDate()[t3].apply(n2.toDate("s"), (r2 ? [0, 0, 0, 0] : [23, 59, 59, 999]).slice(e3)), n2);
          }, y2 = this.$W, M3 = this.$M, m3 = this.$D, g2 = "set" + (this.$u ? "UTC" : "");
          switch (h2) {
            case c:
              return r2 ? $2(1, 0) : $2(31, 11);
            case f:
              return r2 ? $2(1, M3) : $2(0, M3 + 1);
            case o:
              var D2 = this.$locale().weekStart || 0, v2 = (y2 < D2 ? y2 + 7 : y2) - D2;
              return $2(r2 ? m3 - v2 : m3 + (6 - v2), M3);
            case a:
            case d:
              return l2(g2 + "Hours", 0);
            case u:
              return l2(g2 + "Minutes", 1);
            case s:
              return l2(g2 + "Seconds", 2);
            case i:
              return l2(g2 + "Milliseconds", 3);
            default:
              return this.clone();
          }
        }, m2.endOf = function(t2) {
          return this.startOf(t2, false);
        }, m2.$set = function(t2, e2) {
          var n2, o2 = O.p(t2), h2 = "set" + (this.$u ? "UTC" : ""), $2 = (n2 = {}, n2[a] = h2 + "Date", n2[d] = h2 + "Date", n2[f] = h2 + "Month", n2[c] = h2 + "FullYear", n2[u] = h2 + "Hours", n2[s] = h2 + "Minutes", n2[i] = h2 + "Seconds", n2[r] = h2 + "Milliseconds", n2)[o2], l2 = o2 === a ? this.$D + (e2 - this.$W) : e2;
          if (o2 === f || o2 === c) {
            var y2 = this.clone().set(d, 1);
            y2.$d[$2](l2), y2.init(), this.$d = y2.set(d, Math.min(this.$D, y2.daysInMonth())).$d;
          } else $2 && this.$d[$2](l2);
          return this.init(), this;
        }, m2.set = function(t2, e2) {
          return this.clone().$set(t2, e2);
        }, m2.get = function(t2) {
          return this[O.p(t2)]();
        }, m2.add = function(r2, h2) {
          var d2, $2 = this;
          r2 = Number(r2);
          var l2 = O.p(h2), y2 = function(t2) {
            var e2 = w($2);
            return O.w(e2.date(e2.date() + Math.round(t2 * r2)), $2);
          };
          if (l2 === f) return this.set(f, this.$M + r2);
          if (l2 === c) return this.set(c, this.$y + r2);
          if (l2 === a) return y2(1);
          if (l2 === o) return y2(7);
          var M3 = (d2 = {}, d2[s] = e, d2[u] = n, d2[i] = t, d2)[l2] || 1, m3 = this.$d.getTime() + r2 * M3;
          return O.w(m3, this);
        }, m2.subtract = function(t2, e2) {
          return this.add(-1 * t2, e2);
        }, m2.format = function(t2) {
          var e2 = this, n2 = this.$locale();
          if (!this.isValid()) return n2.invalidDate || $;
          var r2 = t2 || "YYYY-MM-DDTHH:mm:ssZ", i2 = O.z(this), s2 = this.$H, u2 = this.$m, a2 = this.$M, o2 = n2.weekdays, f2 = n2.months, h2 = function(t3, n3, i3, s3) {
            return t3 && (t3[n3] || t3(e2, r2)) || i3[n3].substr(0, s3);
          }, c2 = function(t3) {
            return O.s(s2 % 12 || 12, t3, "0");
          }, d2 = n2.meridiem || function(t3, e3, n3) {
            var r3 = t3 < 12 ? "AM" : "PM";
            return n3 ? r3.toLowerCase() : r3;
          }, l2 = { YY: String(this.$y).slice(-2), YYYY: this.$y, M: a2 + 1, MM: O.s(a2 + 1, 2, "0"), MMM: h2(n2.monthsShort, a2, f2, 3), MMMM: h2(f2, a2), D: this.$D, DD: O.s(this.$D, 2, "0"), d: String(this.$W), dd: h2(n2.weekdaysMin, this.$W, o2, 2), ddd: h2(n2.weekdaysShort, this.$W, o2, 3), dddd: o2[this.$W], H: String(s2), HH: O.s(s2, 2, "0"), h: c2(1), hh: c2(2), a: d2(s2, u2, true), A: d2(s2, u2, false), m: String(u2), mm: O.s(u2, 2, "0"), s: String(this.$s), ss: O.s(this.$s, 2, "0"), SSS: O.s(this.$ms, 3, "0"), Z: i2 };
          return r2.replace(y, (function(t3, e3) {
            return e3 || l2[t3] || i2.replace(":", "");
          }));
        }, m2.utcOffset = function() {
          return 15 * -Math.round(this.$d.getTimezoneOffset() / 15);
        }, m2.diff = function(r2, d2, $2) {
          var l2, y2 = O.p(d2), M3 = w(r2), m3 = (M3.utcOffset() - this.utcOffset()) * e, g2 = this - M3, D2 = O.m(this, M3);
          return D2 = (l2 = {}, l2[c] = D2 / 12, l2[f] = D2, l2[h] = D2 / 3, l2[o] = (g2 - m3) / 6048e5, l2[a] = (g2 - m3) / 864e5, l2[u] = g2 / n, l2[s] = g2 / e, l2[i] = g2 / t, l2)[y2] || g2, $2 ? D2 : O.a(D2);
        }, m2.daysInMonth = function() {
          return this.endOf(f).$D;
        }, m2.$locale = function() {
          return v[this.$L];
        }, m2.locale = function(t2, e2) {
          if (!t2) return this.$L;
          var n2 = this.clone(), r2 = S(t2, e2, true);
          return r2 && (n2.$L = r2), n2;
        }, m2.clone = function() {
          return O.w(this.$d, this);
        }, m2.toDate = function() {
          return new Date(this.valueOf());
        }, m2.toJSON = function() {
          return this.isValid() ? this.toISOString() : null;
        }, m2.toISOString = function() {
          return this.$d.toISOString();
        }, m2.toString = function() {
          return this.$d.toUTCString();
        }, M2;
      })(), b = _.prototype;
      return w.prototype = b, [["$ms", r], ["$s", i], ["$m", s], ["$H", u], ["$W", a], ["$M", f], ["$y", c], ["$D", d]].forEach((function(t2) {
        b[t2[1]] = function(e2) {
          return this.$g(e2, t2[0], t2[1]);
        };
      })), w.extend = function(t2, e2) {
        return t2.$i || (t2(e2, _, w), t2.$i = true), w;
      }, w.locale = S, w.isDayjs = p, w.unix = function(t2) {
        return w(1e3 * t2);
      }, w.en = v[D], w.Ls = v, w.p = {}, w;
    }));
  }
});

// ../../node_modules/dayjs/plugin/customParseFormat.js
var require_customParseFormat = __commonJS({
  "../../node_modules/dayjs/plugin/customParseFormat.js"(exports2, module2) {
    !(function(t, e) {
      "object" == typeof exports2 && "undefined" != typeof module2 ? module2.exports = e() : "function" == typeof define && define.amd ? define(e) : (t = "undefined" != typeof globalThis ? globalThis : t || self).dayjs_plugin_customParseFormat = e();
    })(exports2, (function() {
      "use strict";
      var t = { LTS: "h:mm:ss A", LT: "h:mm A", L: "MM/DD/YYYY", LL: "MMMM D, YYYY", LLL: "MMMM D, YYYY h:mm A", LLLL: "dddd, MMMM D, YYYY h:mm A" }, e = /(\[[^[]*\])|([-:/.()\s]+)|(A|a|YYYY|YY?|MM?M?M?|Do|DD?|hh?|HH?|mm?|ss?|S{1,3}|z|ZZ?)/g, n = /\d\d/, r = /\d\d?/, i = /\d*[^\s\d-_:/()]+/, o = {}, s = function(t2) {
        return (t2 = +t2) + (t2 > 68 ? 1900 : 2e3);
      };
      var a = function(t2) {
        return function(e2) {
          this[t2] = +e2;
        };
      }, f = [/[+-]\d\d:?(\d\d)?|Z/, function(t2) {
        (this.zone || (this.zone = {})).offset = (function(t3) {
          if (!t3) return 0;
          if ("Z" === t3) return 0;
          var e2 = t3.match(/([+-]|\d\d)/g), n2 = 60 * e2[1] + (+e2[2] || 0);
          return 0 === n2 ? 0 : "+" === e2[0] ? -n2 : n2;
        })(t2);
      }], u = function(t2) {
        var e2 = o[t2];
        return e2 && (e2.indexOf ? e2 : e2.s.concat(e2.f));
      }, h = function(t2, e2) {
        var n2, r2 = o.meridiem;
        if (r2) {
          for (var i2 = 1; i2 <= 24; i2 += 1) if (t2.indexOf(r2(i2, 0, e2)) > -1) {
            n2 = i2 > 12;
            break;
          }
        } else n2 = t2 === (e2 ? "pm" : "PM");
        return n2;
      }, d = { A: [i, function(t2) {
        this.afternoon = h(t2, false);
      }], a: [i, function(t2) {
        this.afternoon = h(t2, true);
      }], S: [/\d/, function(t2) {
        this.milliseconds = 100 * +t2;
      }], SS: [n, function(t2) {
        this.milliseconds = 10 * +t2;
      }], SSS: [/\d{3}/, function(t2) {
        this.milliseconds = +t2;
      }], s: [r, a("seconds")], ss: [r, a("seconds")], m: [r, a("minutes")], mm: [r, a("minutes")], H: [r, a("hours")], h: [r, a("hours")], HH: [r, a("hours")], hh: [r, a("hours")], D: [r, a("day")], DD: [n, a("day")], Do: [i, function(t2) {
        var e2 = o.ordinal, n2 = t2.match(/\d+/);
        if (this.day = n2[0], e2) for (var r2 = 1; r2 <= 31; r2 += 1) e2(r2).replace(/\[|\]/g, "") === t2 && (this.day = r2);
      }], M: [r, a("month")], MM: [n, a("month")], MMM: [i, function(t2) {
        var e2 = u("months"), n2 = (u("monthsShort") || e2.map((function(t3) {
          return t3.substr(0, 3);
        }))).indexOf(t2) + 1;
        if (n2 < 1) throw new Error();
        this.month = n2 % 12 || n2;
      }], MMMM: [i, function(t2) {
        var e2 = u("months").indexOf(t2) + 1;
        if (e2 < 1) throw new Error();
        this.month = e2 % 12 || e2;
      }], Y: [/[+-]?\d+/, a("year")], YY: [n, function(t2) {
        this.year = s(t2);
      }], YYYY: [/\d{4}/, a("year")], Z: f, ZZ: f };
      function c(n2) {
        var r2, i2;
        r2 = n2, i2 = o && o.formats;
        for (var s2 = (n2 = r2.replace(/(\[[^\]]+])|(LTS?|l{1,4}|L{1,4})/g, (function(e2, n3, r3) {
          var o2 = r3 && r3.toUpperCase();
          return n3 || i2[r3] || t[r3] || i2[o2].replace(/(\[[^\]]+])|(MMMM|MM|DD|dddd)/g, (function(t2, e3, n4) {
            return e3 || n4.slice(1);
          }));
        }))).match(e), a2 = s2.length, f2 = 0; f2 < a2; f2 += 1) {
          var u2 = s2[f2], h2 = d[u2], c2 = h2 && h2[0], l = h2 && h2[1];
          s2[f2] = l ? { regex: c2, parser: l } : u2.replace(/^\[|\]$/g, "");
        }
        return function(t2) {
          for (var e2 = {}, n3 = 0, r3 = 0; n3 < a2; n3 += 1) {
            var i3 = s2[n3];
            if ("string" == typeof i3) r3 += i3.length;
            else {
              var o2 = i3.regex, f3 = i3.parser, u3 = t2.substr(r3), h3 = o2.exec(u3)[0];
              f3.call(e2, h3), t2 = t2.replace(h3, "");
            }
          }
          return (function(t3) {
            var e3 = t3.afternoon;
            if (void 0 !== e3) {
              var n4 = t3.hours;
              e3 ? n4 < 12 && (t3.hours += 12) : 12 === n4 && (t3.hours = 0), delete t3.afternoon;
            }
          })(e2), e2;
        };
      }
      return function(t2, e2, n2) {
        n2.p.customParseFormat = true, t2 && t2.parseTwoDigitYear && (s = t2.parseTwoDigitYear);
        var r2 = e2.prototype, i2 = r2.parse;
        r2.parse = function(t3) {
          var e3 = t3.date, r3 = t3.utc, s2 = t3.args;
          this.$u = r3;
          var a2 = s2[1];
          if ("string" == typeof a2) {
            var f2 = true === s2[2], u2 = true === s2[3], h2 = f2 || u2, d2 = s2[2];
            u2 && (d2 = s2[2]), o = this.$locale(), !f2 && d2 && (o = n2.Ls[d2]), this.$d = (function(t4, e4, n3) {
              try {
                if (["x", "X"].indexOf(e4) > -1) return new Date(("X" === e4 ? 1e3 : 1) * t4);
                var r4 = c(e4)(t4), i3 = r4.year, o2 = r4.month, s3 = r4.day, a3 = r4.hours, f3 = r4.minutes, u3 = r4.seconds, h3 = r4.milliseconds, d3 = r4.zone, l2 = /* @__PURE__ */ new Date(), m2 = s3 || (i3 || o2 ? 1 : l2.getDate()), M2 = i3 || l2.getFullYear(), Y = 0;
                i3 && !o2 || (Y = o2 > 0 ? o2 - 1 : l2.getMonth());
                var p = a3 || 0, v = f3 || 0, D = u3 || 0, g = h3 || 0;
                return d3 ? new Date(Date.UTC(M2, Y, m2, p, v, D, g + 60 * d3.offset * 1e3)) : n3 ? new Date(Date.UTC(M2, Y, m2, p, v, D, g)) : new Date(M2, Y, m2, p, v, D, g);
              } catch (t5) {
                return /* @__PURE__ */ new Date("");
              }
            })(e3, a2, r3), this.init(), d2 && true !== d2 && (this.$L = this.locale(d2).$L), h2 && e3 != this.format(a2) && (this.$d = /* @__PURE__ */ new Date("")), o = {};
          } else if (a2 instanceof Array) for (var l = a2.length, m = 1; m <= l; m += 1) {
            s2[1] = a2[m - 1];
            var M = n2.apply(this, s2);
            if (M.isValid()) {
              this.$d = M.$d, this.$L = M.$L, this.init();
              break;
            }
            m === l && (this.$d = /* @__PURE__ */ new Date(""));
          }
          else i2.call(this, t3);
        };
      };
    }));
  }
});

// ../../node_modules/lodash.keyby/index.js
var require_lodash = __commonJS({
  "../../node_modules/lodash.keyby/index.js"(exports2, module2) {
    var LARGE_ARRAY_SIZE = 200;
    var FUNC_ERROR_TEXT = "Expected a function";
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    var UNORDERED_COMPARE_FLAG = 1;
    var PARTIAL_COMPARE_FLAG = 2;
    var INFINITY = 1 / 0;
    var MAX_SAFE_INTEGER = 9007199254740991;
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var objectTag = "[object Object]";
    var promiseTag = "[object Promise]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var weakMapTag = "[object WeakMap]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var float32Tag = "[object Float32Array]";
    var float64Tag = "[object Float64Array]";
    var int8Tag = "[object Int8Array]";
    var int16Tag = "[object Int16Array]";
    var int32Tag = "[object Int32Array]";
    var uint8Tag = "[object Uint8Array]";
    var uint8ClampedTag = "[object Uint8ClampedArray]";
    var uint16Tag = "[object Uint16Array]";
    var uint32Tag = "[object Uint32Array]";
    var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/;
    var reIsPlainProp = /^\w*$/;
    var reLeadingDot = /^\./;
    var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reEscapeChar = /\\(\\)?/g;
    var reIsHostCtor = /^\[object .+?Constructor\]$/;
    var reIsUint = /^(?:0|[1-9]\d*)$/;
    var typedArrayTags = {};
    typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
    typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    var freeExports = typeof exports2 == "object" && exports2 && !exports2.nodeType && exports2;
    var freeModule = freeExports && typeof module2 == "object" && module2 && !module2.nodeType && module2;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var freeProcess = moduleExports && freeGlobal.process;
    var nodeUtil = (function() {
      try {
        return freeProcess && freeProcess.binding("util");
      } catch (e) {
      }
    })();
    var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;
    function arrayAggregator(array, setter, iteratee, accumulator) {
      var index = -1, length = array ? array.length : 0;
      while (++index < length) {
        var value = array[index];
        setter(accumulator, value, iteratee(value), array);
      }
      return accumulator;
    }
    function arraySome(array, predicate) {
      var index = -1, length = array ? array.length : 0;
      while (++index < length) {
        if (predicate(array[index], index, array)) {
          return true;
        }
      }
      return false;
    }
    function baseProperty(key) {
      return function(object) {
        return object == null ? void 0 : object[key];
      };
    }
    function baseTimes(n, iteratee) {
      var index = -1, result = Array(n);
      while (++index < n) {
        result[index] = iteratee(index);
      }
      return result;
    }
    function baseUnary(func) {
      return function(value) {
        return func(value);
      };
    }
    function getValue(object, key) {
      return object == null ? void 0 : object[key];
    }
    function isHostObject(value) {
      var result = false;
      if (value != null && typeof value.toString != "function") {
        try {
          result = !!(value + "");
        } catch (e) {
        }
      }
      return result;
    }
    function mapToArray(map) {
      var index = -1, result = Array(map.size);
      map.forEach(function(value, key) {
        result[++index] = [key, value];
      });
      return result;
    }
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }
    function setToArray(set) {
      var index = -1, result = Array(set.size);
      set.forEach(function(value) {
        result[++index] = value;
      });
      return result;
    }
    var arrayProto = Array.prototype;
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var coreJsData = root["__core-js_shared__"];
    var maskSrcKey = (function() {
      var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
      return uid ? "Symbol(src)_1." + uid : "";
    })();
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var objectToString = objectProto.toString;
    var reIsNative = RegExp(
      "^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    );
    var Symbol2 = root.Symbol;
    var Uint8Array2 = root.Uint8Array;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var splice = arrayProto.splice;
    var nativeKeys = overArg(Object.keys, Object);
    var DataView = getNative(root, "DataView");
    var Map2 = getNative(root, "Map");
    var Promise2 = getNative(root, "Promise");
    var Set2 = getNative(root, "Set");
    var WeakMap2 = getNative(root, "WeakMap");
    var nativeCreate = getNative(Object, "create");
    var dataViewCtorString = toSource(DataView);
    var mapCtorString = toSource(Map2);
    var promiseCtorString = toSource(Promise2);
    var setCtorString = toSource(Set2);
    var weakMapCtorString = toSource(WeakMap2);
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolValueOf = symbolProto ? symbolProto.valueOf : void 0;
    var symbolToString = symbolProto ? symbolProto.toString : void 0;
    function Hash(entries) {
      var index = -1, length = entries ? entries.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    function hashClear() {
      this.__data__ = nativeCreate ? nativeCreate(null) : {};
    }
    function hashDelete(key) {
      return this.has(key) && delete this.__data__[key];
    }
    function hashGet(key) {
      var data = this.__data__;
      if (nativeCreate) {
        var result = data[key];
        return result === HASH_UNDEFINED ? void 0 : result;
      }
      return hasOwnProperty.call(data, key) ? data[key] : void 0;
    }
    function hashHas(key) {
      var data = this.__data__;
      return nativeCreate ? data[key] !== void 0 : hasOwnProperty.call(data, key);
    }
    function hashSet(key, value) {
      var data = this.__data__;
      data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
      return this;
    }
    Hash.prototype.clear = hashClear;
    Hash.prototype["delete"] = hashDelete;
    Hash.prototype.get = hashGet;
    Hash.prototype.has = hashHas;
    Hash.prototype.set = hashSet;
    function ListCache(entries) {
      var index = -1, length = entries ? entries.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    function listCacheClear() {
      this.__data__ = [];
    }
    function listCacheDelete(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        return false;
      }
      var lastIndex = data.length - 1;
      if (index == lastIndex) {
        data.pop();
      } else {
        splice.call(data, index, 1);
      }
      return true;
    }
    function listCacheGet(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      return index < 0 ? void 0 : data[index][1];
    }
    function listCacheHas(key) {
      return assocIndexOf(this.__data__, key) > -1;
    }
    function listCacheSet(key, value) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        data.push([key, value]);
      } else {
        data[index][1] = value;
      }
      return this;
    }
    ListCache.prototype.clear = listCacheClear;
    ListCache.prototype["delete"] = listCacheDelete;
    ListCache.prototype.get = listCacheGet;
    ListCache.prototype.has = listCacheHas;
    ListCache.prototype.set = listCacheSet;
    function MapCache(entries) {
      var index = -1, length = entries ? entries.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    function mapCacheClear() {
      this.__data__ = {
        "hash": new Hash(),
        "map": new (Map2 || ListCache)(),
        "string": new Hash()
      };
    }
    function mapCacheDelete(key) {
      return getMapData(this, key)["delete"](key);
    }
    function mapCacheGet(key) {
      return getMapData(this, key).get(key);
    }
    function mapCacheHas(key) {
      return getMapData(this, key).has(key);
    }
    function mapCacheSet(key, value) {
      getMapData(this, key).set(key, value);
      return this;
    }
    MapCache.prototype.clear = mapCacheClear;
    MapCache.prototype["delete"] = mapCacheDelete;
    MapCache.prototype.get = mapCacheGet;
    MapCache.prototype.has = mapCacheHas;
    MapCache.prototype.set = mapCacheSet;
    function SetCache(values) {
      var index = -1, length = values ? values.length : 0;
      this.__data__ = new MapCache();
      while (++index < length) {
        this.add(values[index]);
      }
    }
    function setCacheAdd(value) {
      this.__data__.set(value, HASH_UNDEFINED);
      return this;
    }
    function setCacheHas(value) {
      return this.__data__.has(value);
    }
    SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
    SetCache.prototype.has = setCacheHas;
    function Stack(entries) {
      this.__data__ = new ListCache(entries);
    }
    function stackClear() {
      this.__data__ = new ListCache();
    }
    function stackDelete(key) {
      return this.__data__["delete"](key);
    }
    function stackGet(key) {
      return this.__data__.get(key);
    }
    function stackHas(key) {
      return this.__data__.has(key);
    }
    function stackSet(key, value) {
      var cache = this.__data__;
      if (cache instanceof ListCache) {
        var pairs = cache.__data__;
        if (!Map2 || pairs.length < LARGE_ARRAY_SIZE - 1) {
          pairs.push([key, value]);
          return this;
        }
        cache = this.__data__ = new MapCache(pairs);
      }
      cache.set(key, value);
      return this;
    }
    Stack.prototype.clear = stackClear;
    Stack.prototype["delete"] = stackDelete;
    Stack.prototype.get = stackGet;
    Stack.prototype.has = stackHas;
    Stack.prototype.set = stackSet;
    function arrayLikeKeys(value, inherited) {
      var result = isArray(value) || isArguments(value) ? baseTimes(value.length, String) : [];
      var length = result.length, skipIndexes = !!length;
      for (var key in value) {
        if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && (key == "length" || isIndex(key, length)))) {
          result.push(key);
        }
      }
      return result;
    }
    function assocIndexOf(array, key) {
      var length = array.length;
      while (length--) {
        if (eq(array[length][0], key)) {
          return length;
        }
      }
      return -1;
    }
    function baseAggregator(collection, setter, iteratee, accumulator) {
      baseEach(collection, function(value, key, collection2) {
        setter(accumulator, value, iteratee(value), collection2);
      });
      return accumulator;
    }
    var baseEach = createBaseEach(baseForOwn);
    var baseFor = createBaseFor();
    function baseForOwn(object, iteratee) {
      return object && baseFor(object, iteratee, keys);
    }
    function baseGet(object, path) {
      path = isKey(path, object) ? [path] : castPath(path);
      var index = 0, length = path.length;
      while (object != null && index < length) {
        object = object[toKey(path[index++])];
      }
      return index && index == length ? object : void 0;
    }
    function baseGetTag(value) {
      return objectToString.call(value);
    }
    function baseHasIn(object, key) {
      return object != null && key in Object(object);
    }
    function baseIsEqual(value, other, customizer, bitmask, stack) {
      if (value === other) {
        return true;
      }
      if (value == null || other == null || !isObject(value) && !isObjectLike(other)) {
        return value !== value && other !== other;
      }
      return baseIsEqualDeep(value, other, baseIsEqual, customizer, bitmask, stack);
    }
    function baseIsEqualDeep(object, other, equalFunc, customizer, bitmask, stack) {
      var objIsArr = isArray(object), othIsArr = isArray(other), objTag = arrayTag, othTag = arrayTag;
      if (!objIsArr) {
        objTag = getTag(object);
        objTag = objTag == argsTag ? objectTag : objTag;
      }
      if (!othIsArr) {
        othTag = getTag(other);
        othTag = othTag == argsTag ? objectTag : othTag;
      }
      var objIsObj = objTag == objectTag && !isHostObject(object), othIsObj = othTag == objectTag && !isHostObject(other), isSameTag = objTag == othTag;
      if (isSameTag && !objIsObj) {
        stack || (stack = new Stack());
        return objIsArr || isTypedArray(object) ? equalArrays(object, other, equalFunc, customizer, bitmask, stack) : equalByTag(object, other, objTag, equalFunc, customizer, bitmask, stack);
      }
      if (!(bitmask & PARTIAL_COMPARE_FLAG)) {
        var objIsWrapped = objIsObj && hasOwnProperty.call(object, "__wrapped__"), othIsWrapped = othIsObj && hasOwnProperty.call(other, "__wrapped__");
        if (objIsWrapped || othIsWrapped) {
          var objUnwrapped = objIsWrapped ? object.value() : object, othUnwrapped = othIsWrapped ? other.value() : other;
          stack || (stack = new Stack());
          return equalFunc(objUnwrapped, othUnwrapped, customizer, bitmask, stack);
        }
      }
      if (!isSameTag) {
        return false;
      }
      stack || (stack = new Stack());
      return equalObjects(object, other, equalFunc, customizer, bitmask, stack);
    }
    function baseIsMatch(object, source, matchData, customizer) {
      var index = matchData.length, length = index, noCustomizer = !customizer;
      if (object == null) {
        return !length;
      }
      object = Object(object);
      while (index--) {
        var data = matchData[index];
        if (noCustomizer && data[2] ? data[1] !== object[data[0]] : !(data[0] in object)) {
          return false;
        }
      }
      while (++index < length) {
        data = matchData[index];
        var key = data[0], objValue = object[key], srcValue = data[1];
        if (noCustomizer && data[2]) {
          if (objValue === void 0 && !(key in object)) {
            return false;
          }
        } else {
          var stack = new Stack();
          if (customizer) {
            var result = customizer(objValue, srcValue, key, object, source, stack);
          }
          if (!(result === void 0 ? baseIsEqual(srcValue, objValue, customizer, UNORDERED_COMPARE_FLAG | PARTIAL_COMPARE_FLAG, stack) : result)) {
            return false;
          }
        }
      }
      return true;
    }
    function baseIsNative(value) {
      if (!isObject(value) || isMasked(value)) {
        return false;
      }
      var pattern = isFunction(value) || isHostObject(value) ? reIsNative : reIsHostCtor;
      return pattern.test(toSource(value));
    }
    function baseIsTypedArray(value) {
      return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[objectToString.call(value)];
    }
    function baseIteratee(value) {
      if (typeof value == "function") {
        return value;
      }
      if (value == null) {
        return identity;
      }
      if (typeof value == "object") {
        return isArray(value) ? baseMatchesProperty(value[0], value[1]) : baseMatches(value);
      }
      return property(value);
    }
    function baseKeys(object) {
      if (!isPrototype(object)) {
        return nativeKeys(object);
      }
      var result = [];
      for (var key in Object(object)) {
        if (hasOwnProperty.call(object, key) && key != "constructor") {
          result.push(key);
        }
      }
      return result;
    }
    function baseMatches(source) {
      var matchData = getMatchData(source);
      if (matchData.length == 1 && matchData[0][2]) {
        return matchesStrictComparable(matchData[0][0], matchData[0][1]);
      }
      return function(object) {
        return object === source || baseIsMatch(object, source, matchData);
      };
    }
    function baseMatchesProperty(path, srcValue) {
      if (isKey(path) && isStrictComparable(srcValue)) {
        return matchesStrictComparable(toKey(path), srcValue);
      }
      return function(object) {
        var objValue = get(object, path);
        return objValue === void 0 && objValue === srcValue ? hasIn(object, path) : baseIsEqual(srcValue, objValue, void 0, UNORDERED_COMPARE_FLAG | PARTIAL_COMPARE_FLAG);
      };
    }
    function basePropertyDeep(path) {
      return function(object) {
        return baseGet(object, path);
      };
    }
    function baseToString(value) {
      if (typeof value == "string") {
        return value;
      }
      if (isSymbol(value)) {
        return symbolToString ? symbolToString.call(value) : "";
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    function castPath(value) {
      return isArray(value) ? value : stringToPath(value);
    }
    function createAggregator(setter, initializer) {
      return function(collection, iteratee) {
        var func = isArray(collection) ? arrayAggregator : baseAggregator, accumulator = initializer ? initializer() : {};
        return func(collection, setter, baseIteratee(iteratee, 2), accumulator);
      };
    }
    function createBaseEach(eachFunc, fromRight) {
      return function(collection, iteratee) {
        if (collection == null) {
          return collection;
        }
        if (!isArrayLike(collection)) {
          return eachFunc(collection, iteratee);
        }
        var length = collection.length, index = fromRight ? length : -1, iterable = Object(collection);
        while (fromRight ? index-- : ++index < length) {
          if (iteratee(iterable[index], index, iterable) === false) {
            break;
          }
        }
        return collection;
      };
    }
    function createBaseFor(fromRight) {
      return function(object, iteratee, keysFunc) {
        var index = -1, iterable = Object(object), props = keysFunc(object), length = props.length;
        while (length--) {
          var key = props[fromRight ? length : ++index];
          if (iteratee(iterable[key], key, iterable) === false) {
            break;
          }
        }
        return object;
      };
    }
    function equalArrays(array, other, equalFunc, customizer, bitmask, stack) {
      var isPartial = bitmask & PARTIAL_COMPARE_FLAG, arrLength = array.length, othLength = other.length;
      if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
        return false;
      }
      var stacked = stack.get(array);
      if (stacked && stack.get(other)) {
        return stacked == other;
      }
      var index = -1, result = true, seen = bitmask & UNORDERED_COMPARE_FLAG ? new SetCache() : void 0;
      stack.set(array, other);
      stack.set(other, array);
      while (++index < arrLength) {
        var arrValue = array[index], othValue = other[index];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, arrValue, index, other, array, stack) : customizer(arrValue, othValue, index, array, other, stack);
        }
        if (compared !== void 0) {
          if (compared) {
            continue;
          }
          result = false;
          break;
        }
        if (seen) {
          if (!arraySome(other, function(othValue2, othIndex) {
            if (!seen.has(othIndex) && (arrValue === othValue2 || equalFunc(arrValue, othValue2, customizer, bitmask, stack))) {
              return seen.add(othIndex);
            }
          })) {
            result = false;
            break;
          }
        } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, customizer, bitmask, stack))) {
          result = false;
          break;
        }
      }
      stack["delete"](array);
      stack["delete"](other);
      return result;
    }
    function equalByTag(object, other, tag, equalFunc, customizer, bitmask, stack) {
      switch (tag) {
        case dataViewTag:
          if (object.byteLength != other.byteLength || object.byteOffset != other.byteOffset) {
            return false;
          }
          object = object.buffer;
          other = other.buffer;
        case arrayBufferTag:
          if (object.byteLength != other.byteLength || !equalFunc(new Uint8Array2(object), new Uint8Array2(other))) {
            return false;
          }
          return true;
        case boolTag:
        case dateTag:
        case numberTag:
          return eq(+object, +other);
        case errorTag:
          return object.name == other.name && object.message == other.message;
        case regexpTag:
        case stringTag:
          return object == other + "";
        case mapTag:
          var convert = mapToArray;
        case setTag:
          var isPartial = bitmask & PARTIAL_COMPARE_FLAG;
          convert || (convert = setToArray);
          if (object.size != other.size && !isPartial) {
            return false;
          }
          var stacked = stack.get(object);
          if (stacked) {
            return stacked == other;
          }
          bitmask |= UNORDERED_COMPARE_FLAG;
          stack.set(object, other);
          var result = equalArrays(convert(object), convert(other), equalFunc, customizer, bitmask, stack);
          stack["delete"](object);
          return result;
        case symbolTag:
          if (symbolValueOf) {
            return symbolValueOf.call(object) == symbolValueOf.call(other);
          }
      }
      return false;
    }
    function equalObjects(object, other, equalFunc, customizer, bitmask, stack) {
      var isPartial = bitmask & PARTIAL_COMPARE_FLAG, objProps = keys(object), objLength = objProps.length, othProps = keys(other), othLength = othProps.length;
      if (objLength != othLength && !isPartial) {
        return false;
      }
      var index = objLength;
      while (index--) {
        var key = objProps[index];
        if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
          return false;
        }
      }
      var stacked = stack.get(object);
      if (stacked && stack.get(other)) {
        return stacked == other;
      }
      var result = true;
      stack.set(object, other);
      stack.set(other, object);
      var skipCtor = isPartial;
      while (++index < objLength) {
        key = objProps[index];
        var objValue = object[key], othValue = other[key];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, objValue, key, other, object, stack) : customizer(objValue, othValue, key, object, other, stack);
        }
        if (!(compared === void 0 ? objValue === othValue || equalFunc(objValue, othValue, customizer, bitmask, stack) : compared)) {
          result = false;
          break;
        }
        skipCtor || (skipCtor = key == "constructor");
      }
      if (result && !skipCtor) {
        var objCtor = object.constructor, othCtor = other.constructor;
        if (objCtor != othCtor && ("constructor" in object && "constructor" in other) && !(typeof objCtor == "function" && objCtor instanceof objCtor && typeof othCtor == "function" && othCtor instanceof othCtor)) {
          result = false;
        }
      }
      stack["delete"](object);
      stack["delete"](other);
      return result;
    }
    function getMapData(map, key) {
      var data = map.__data__;
      return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
    }
    function getMatchData(object) {
      var result = keys(object), length = result.length;
      while (length--) {
        var key = result[length], value = object[key];
        result[length] = [key, value, isStrictComparable(value)];
      }
      return result;
    }
    function getNative(object, key) {
      var value = getValue(object, key);
      return baseIsNative(value) ? value : void 0;
    }
    var getTag = baseGetTag;
    if (DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag || Map2 && getTag(new Map2()) != mapTag || Promise2 && getTag(Promise2.resolve()) != promiseTag || Set2 && getTag(new Set2()) != setTag || WeakMap2 && getTag(new WeakMap2()) != weakMapTag) {
      getTag = function(value) {
        var result = objectToString.call(value), Ctor = result == objectTag ? value.constructor : void 0, ctorString = Ctor ? toSource(Ctor) : void 0;
        if (ctorString) {
          switch (ctorString) {
            case dataViewCtorString:
              return dataViewTag;
            case mapCtorString:
              return mapTag;
            case promiseCtorString:
              return promiseTag;
            case setCtorString:
              return setTag;
            case weakMapCtorString:
              return weakMapTag;
          }
        }
        return result;
      };
    }
    function hasPath(object, path, hasFunc) {
      path = isKey(path, object) ? [path] : castPath(path);
      var result, index = -1, length = path.length;
      while (++index < length) {
        var key = toKey(path[index]);
        if (!(result = object != null && hasFunc(object, key))) {
          break;
        }
        object = object[key];
      }
      if (result) {
        return result;
      }
      var length = object ? object.length : 0;
      return !!length && isLength(length) && isIndex(key, length) && (isArray(object) || isArguments(object));
    }
    function isIndex(value, length) {
      length = length == null ? MAX_SAFE_INTEGER : length;
      return !!length && (typeof value == "number" || reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
    }
    function isKey(value, object) {
      if (isArray(value)) {
        return false;
      }
      var type = typeof value;
      if (type == "number" || type == "symbol" || type == "boolean" || value == null || isSymbol(value)) {
        return true;
      }
      return reIsPlainProp.test(value) || !reIsDeepProp.test(value) || object != null && value in Object(object);
    }
    function isKeyable(value) {
      var type = typeof value;
      return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
    }
    function isMasked(func) {
      return !!maskSrcKey && maskSrcKey in func;
    }
    function isPrototype(value) {
      var Ctor = value && value.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto;
      return value === proto;
    }
    function isStrictComparable(value) {
      return value === value && !isObject(value);
    }
    function matchesStrictComparable(key, srcValue) {
      return function(object) {
        if (object == null) {
          return false;
        }
        return object[key] === srcValue && (srcValue !== void 0 || key in Object(object));
      };
    }
    var stringToPath = memoize(function(string) {
      string = toString2(string);
      var result = [];
      if (reLeadingDot.test(string)) {
        result.push("");
      }
      string.replace(rePropName, function(match, number, quote, string2) {
        result.push(quote ? string2.replace(reEscapeChar, "$1") : number || match);
      });
      return result;
    });
    function toKey(value) {
      if (typeof value == "string" || isSymbol(value)) {
        return value;
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    function toSource(func) {
      if (func != null) {
        try {
          return funcToString.call(func);
        } catch (e) {
        }
        try {
          return func + "";
        } catch (e) {
        }
      }
      return "";
    }
    var keyBy2 = createAggregator(function(result, value, key) {
      result[key] = value;
    });
    function memoize(func, resolver) {
      if (typeof func != "function" || resolver && typeof resolver != "function") {
        throw new TypeError(FUNC_ERROR_TEXT);
      }
      var memoized = function() {
        var args = arguments, key = resolver ? resolver.apply(this, args) : args[0], cache = memoized.cache;
        if (cache.has(key)) {
          return cache.get(key);
        }
        var result = func.apply(this, args);
        memoized.cache = cache.set(key, result);
        return result;
      };
      memoized.cache = new (memoize.Cache || MapCache)();
      return memoized;
    }
    memoize.Cache = MapCache;
    function eq(value, other) {
      return value === other || value !== value && other !== other;
    }
    function isArguments(value) {
      return isArrayLikeObject(value) && hasOwnProperty.call(value, "callee") && (!propertyIsEnumerable.call(value, "callee") || objectToString.call(value) == argsTag);
    }
    var isArray = Array.isArray;
    function isArrayLike(value) {
      return value != null && isLength(value.length) && !isFunction(value);
    }
    function isArrayLikeObject(value) {
      return isObjectLike(value) && isArrayLike(value);
    }
    function isFunction(value) {
      var tag = isObject(value) ? objectToString.call(value) : "";
      return tag == funcTag || tag == genTag;
    }
    function isLength(value) {
      return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }
    function isObject(value) {
      var type = typeof value;
      return !!value && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
    }
    var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
    function toString2(value) {
      return value == null ? "" : baseToString(value);
    }
    function get(object, path, defaultValue) {
      var result = object == null ? void 0 : baseGet(object, path);
      return result === void 0 ? defaultValue : result;
    }
    function hasIn(object, path) {
      return object != null && hasPath(object, path, baseHasIn);
    }
    function keys(object) {
      return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
    }
    function identity(value) {
      return value;
    }
    function property(path) {
      return isKey(path) ? baseProperty(toKey(path)) : basePropertyDeep(path);
    }
    module2.exports = keyBy2;
  }
});

// src/index.ts
var import_node_path3 = require("node:path");

// node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// src/localClient.ts
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = require("node:path");

// ../common/src/utils/constants.ts
var appSyncVersionMap = Object.freeze({
  transaction: 4,
  realTime: 3,
  // in version 3, every existing device should sync with Manual Sync before upgrading to real time sync.
  realTimeBeta: 2,
  manualSync: 1
});
var priceIdToPlan = Object.freeze({
  price_1Nd9fpFRQokYInZjhlvE28tG: "pro",
  price_1K7baRFRQokYInZjJFEpzl98: "pro",
  price_1NcqspFRQokYInZjjBz3ui2e: "pro",
  price_1K7bRyFRQokYInZjmiSHC66Q: "pro",
  price_1Nd9gbFRQokYInZj5BCnX3Ko: "pro",
  price_1K7baRFRQokYInZjMbhGQnan: "pro",
  price_1NcqtSFRQokYInZj6ZUBSsJX: "pro",
  price_1K7bRyFRQokYInZjkqsDkkdL: "pro",
  price_1SSWjWFRQokYInZj5tXRINlY: "premium",
  price_1SNmrBFRQokYInZjtw8a7iE1: "premium",
  price_1SZQTkFRQokYInZjq28f5Lm6: "premium",
  price_1SZQhWFRQokYInZjPqUGtWKm: "premium",
  price_1T65pjFRQokYInZjk3m46uHF: "premiumPlus",
  // test premiumPlus yearly
  price_1T65ooFRQokYInZjxOFdahpx: "premiumPlus",
  // test premiumPlus monthly
  price_1T6n2oFRQokYInZjHhTjcoKz: "premiumPlus",
  // prod premiumPlus yearly
  price_1T6n1TFRQokYInZjD32eWTV4: "premiumPlus"
  // prod premiumPlus monthly
});
var isMacOs = typeof navigator !== "undefined" ? /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform) : false;

// ../../node_modules/zod/lib/index.mjs
var util;
(function(util2) {
  util2.assertEqual = (val) => val;
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
        fieldErrors[sub.path[0]].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var overrideErrorMap = errorMap;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === errorMap ? void 0 : errorMap
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message === null || message === void 0 ? void 0 : message.message;
})(errorUtil || (errorUtil = {}));
var _ZodEnum_cache;
var _ZodNativeEnum_cache;
var ParseInputLazyPath = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (this._key instanceof Array) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    var _a, _b;
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message !== null && message !== void 0 ? message : ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: (_a = message !== null && message !== void 0 ? message : required_error) !== null && _a !== void 0 ? _a : ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: (_b = message !== null && message !== void 0 ? message : invalid_type_error) !== null && _b !== void 0 ? _b : ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    var _a;
    const ctx = {
      common: {
        issues: [],
        async: (_a = params === null || params === void 0 ? void 0 : params.async) !== null && _a !== void 0 ? _a : false,
        contextualErrorMap: params === null || params === void 0 ? void 0 : params.errorMap
      },
      path: (params === null || params === void 0 ? void 0 : params.path) || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    var _a, _b;
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if ((_b = (_a = err === null || err === void 0 ? void 0 : err.message) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === null || _b === void 0 ? void 0 : _b.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params === null || params === void 0 ? void 0 : params.errorMap,
        async: true
      },
      path: (params === null || params === void 0 ? void 0 : params.path) || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if (!decoded.typ || !decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch (_a) {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch (_a) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    var _a, _b;
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof (options === null || options === void 0 ? void 0 : options.precision) === "undefined" ? null : options === null || options === void 0 ? void 0 : options.precision,
      offset: (_a = options === null || options === void 0 ? void 0 : options.offset) !== null && _a !== void 0 ? _a : false,
      local: (_b = options === null || options === void 0 ? void 0 : options.local) !== null && _b !== void 0 ? _b : false,
      ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof (options === null || options === void 0 ? void 0 : options.precision) === "undefined" ? null : options === null || options === void 0 ? void 0 : options.precision,
      ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options === null || options === void 0 ? void 0 : options.position,
      ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  var _a;
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: (_a = params === null || params === void 0 ? void 0 : params.coerce) !== null && _a !== void 0 ? _a : false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / Math.pow(10, decCount);
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null, min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch (_a) {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  var _a;
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: (_a = params === null || params === void 0 ? void 0 : params.coerce) !== null && _a !== void 0 ? _a : false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    return this._cached = { shape, keys };
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") ;
      else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          var _a, _b, _c, _d;
          const defaultError = (_c = (_b = (_a = this._def).errorMap) === null || _b === void 0 ? void 0 : _b.call(_a, issue, ctx).message) !== null && _c !== void 0 ? _c : ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: (_d = errorUtil.errToObj(message).message) !== null && _d !== void 0 ? _d : defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    util.objectKeys(mask).forEach((key) => {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    });
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    util.objectKeys(this.shape).forEach((key) => {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    });
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    util.objectKeys(this.shape).forEach((key) => {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    });
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    util.objectKeys(this.shape).forEach((key) => {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    });
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [
          ctx.common.contextualErrorMap,
          ctx.schemaErrorMap,
          getErrorMap(),
          errorMap
        ].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [
          ctx.common.contextualErrorMap,
          ctx.schemaErrorMap,
          getErrorMap(),
          errorMap
        ].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  constructor() {
    super(...arguments);
    _ZodEnum_cache.set(this, void 0);
  }
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!__classPrivateFieldGet(this, _ZodEnum_cache, "f")) {
      __classPrivateFieldSet(this, _ZodEnum_cache, new Set(this._def.values), "f");
    }
    if (!__classPrivateFieldGet(this, _ZodEnum_cache, "f").has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
_ZodEnum_cache = /* @__PURE__ */ new WeakMap();
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  constructor() {
    super(...arguments);
    _ZodNativeEnum_cache.set(this, void 0);
  }
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!__classPrivateFieldGet(this, _ZodNativeEnum_cache, "f")) {
      __classPrivateFieldSet(this, _ZodNativeEnum_cache, new Set(util.getValidEnumValues(this._def.values)), "f");
    }
    if (!__classPrivateFieldGet(this, _ZodNativeEnum_cache, "f").has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
_ZodNativeEnum_cache = /* @__PURE__ */ new WeakMap();
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return base;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return base;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({ status: status.value, value: result }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      var _a, _b;
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          var _a2, _b2;
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = (_b2 = (_a2 = params.fatal) !== null && _a2 !== void 0 ? _a2 : fatal) !== null && _b2 !== void 0 ? _b2 : true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = (_b = (_a = params.fatal) !== null && _a !== void 0 ? _a : fatal) !== null && _b !== void 0 ? _b : true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;
var z = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  defaultErrorMap: errorMap,
  setErrorMap,
  getErrorMap,
  makeIssue,
  EMPTY_PATH,
  addIssueToContext,
  ParseStatus,
  INVALID,
  DIRTY,
  OK,
  isAborted,
  isDirty,
  isValid,
  isAsync,
  get util() {
    return util;
  },
  get objectUtil() {
    return objectUtil;
  },
  ZodParsedType,
  getParsedType,
  ZodType,
  datetimeRegex,
  ZodString,
  ZodNumber,
  ZodBigInt,
  ZodBoolean,
  ZodDate,
  ZodSymbol,
  ZodUndefined,
  ZodNull,
  ZodAny,
  ZodUnknown,
  ZodNever,
  ZodVoid,
  ZodArray,
  ZodObject,
  ZodUnion,
  ZodDiscriminatedUnion,
  ZodIntersection,
  ZodTuple,
  ZodRecord,
  ZodMap,
  ZodSet,
  ZodFunction,
  ZodLazy,
  ZodLiteral,
  ZodEnum,
  ZodNativeEnum,
  ZodPromise,
  ZodEffects,
  ZodTransformer: ZodEffects,
  ZodOptional,
  ZodNullable,
  ZodDefault,
  ZodCatch,
  ZodNaN,
  BRAND,
  ZodBranded,
  ZodPipeline,
  ZodReadonly,
  custom,
  Schema: ZodType,
  ZodSchema: ZodType,
  late,
  get ZodFirstPartyTypeKind() {
    return ZodFirstPartyTypeKind;
  },
  coerce,
  any: anyType,
  array: arrayType,
  bigint: bigIntType,
  boolean: booleanType,
  date: dateType,
  discriminatedUnion: discriminatedUnionType,
  effect: effectsType,
  "enum": enumType,
  "function": functionType,
  "instanceof": instanceOfType,
  intersection: intersectionType,
  lazy: lazyType,
  literal: literalType,
  map: mapType,
  nan: nanType,
  nativeEnum: nativeEnumType,
  never: neverType,
  "null": nullType,
  nullable: nullableType,
  number: numberType,
  object: objectType,
  oboolean,
  onumber,
  optional: optionalType,
  ostring,
  pipeline: pipelineType,
  preprocess: preprocessType,
  promise: promiseType,
  record: recordType,
  set: setType,
  strictObject: strictObjectType,
  string: stringType,
  symbol: symbolType,
  transformer: effectsType,
  tuple: tupleType,
  "undefined": undefinedType,
  union: unionType,
  unknown: unknownType,
  "void": voidType,
  NEVER,
  ZodIssueCode,
  quotelessJson,
  ZodError
});

// ../common/src/editor/constants.ts
var nodeHtmlData = Object.freeze({
  type: "data-node-type",
  id: "data-node-id"
});
var bulletListItemFormat = Object.freeze({
  disc: 0,
  circle: 1,
  square: 2
});
var numberedListItemFormat = Object.freeze({
  number: 0,
  letters: 1,
  roman: 2
});
var codeLanguageMap = Object.freeze({
  plain: "Plain Text",
  tsx: "React TSX",
  jsx: "React JSX",
  kotlin: "Kotlin",
  latex: "LaTeX",
  webassembly: "WebAssembly",
  bash: "Bash",
  javascript: "JavaScript",
  ts: "TypeScript",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  dart: "Dart",
  sql: "SQL",
  python: "Python",
  rust: "Rust",
  xml: "XML",
  json: "JSON",
  markdown: "Markdown",
  java: "Java",
  cpp: "C++",
  php: "PHP",
  c: "C",
  cql: "Apache CQL",
  csharp: "C#",
  objc: "Objective-C",
  cobol: "Cobol",
  coffeescript: "CoffeeScript",
  commonlisp: "CommonLisp",
  dockerfile: "Dockerfile",
  erlang: "Erlang",
  fortran: "Fortran",
  go: "Go",
  haskell: "Haskell",
  julia: "Julia",
  livescript: "LiveScript",
  lua: "Lua",
  mathematica: "Mathematica",
  pascal: "Pascal",
  perl: "Perl",
  r: "R",
  ruby: "Ruby",
  scheme: "Scheme",
  shell: "Shell",
  swift: "Swift",
  verilog: "Verilog",
  yaml: "YAML",
  mermaid: "Mermaid",
  diff: "Diff",
  scala: "Scala",
  powershell: "PowerShell",
  toml: "TOML"
});

// ../common/src/editor/schemas/editorSchemaPrimitives.ts
var editorColorNames = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red"
];
var editorColorTypes = ["text", "background"];
var embedObjectTypes = [
  "image",
  "video",
  "audio",
  "journal",
  "highlightElement",
  "note"
];
var editorColorNameSchema = z.enum(editorColorNames);
var nullableEditorColorNameSchema = editorColorNameSchema.nullable();
var editorColorTypeSchema = z.enum(editorColorTypes);
var alignmentSchema = z.enum(["left", "center", "right"]);
var embedObjectTypeSchema = z.enum(embedObjectTypes);
var listItemFormatValueSchema = z.union([
  z.literal(bulletListItemFormat.disc),
  z.literal(bulletListItemFormat.circle),
  z.literal(bulletListItemFormat.square),
  z.literal(String(bulletListItemFormat.disc)),
  z.literal(String(bulletListItemFormat.circle)),
  z.literal(String(bulletListItemFormat.square))
]);
var blockNodeIdSchema = z.string().uuid().nullable();
var bulletListItemFormatSchema = listItemFormatValueSchema.nullable();
var numberedListItemFormatSchema = bulletListItemFormatSchema;
var nullableUrlStringSchema = z.string().url().nullable();

// ../common/src/editor/block/blockNodeAttrsSchema.ts
var blockNodeAttrsSchema = z.object({
  id: blockNodeIdSchema
});

// ../common/src/editor/getNodeHtmlDataset.ts
function getNodeHtmlDataset(node) {
  return {
    [nodeHtmlData.type]: node.type.name,
    [nodeHtmlData.id]: node.attrs.id
  };
}

// ../common/src/editor/code-block/codeBlockNodeAttrsSchema.ts
var codeBlockNodeAttrsSchema = z.object({
  id: blockNodeIdSchema,
  params: z.string().nullable()
});

// ../common/src/editor/math/mathNodeSpecMap.ts
var mathNodeSpecMap = {
  math_inline: {
    group: "inline",
    content: "text*",
    inline: true,
    atom: true,
    toDOM: () => ["math-inline", { class: "math-node" }, 0],
    parseDOM: [{ tag: "math-inline" }]
  },
  math_display: {
    attrs: {
      id: {
        default: null,
        validate: (value) => blockNodeAttrsSchema.shape.id.parse(value)
      }
    },
    group: "block",
    content: "text*",
    atom: true,
    code: true,
    defining: true,
    toDOM: (node) => [
      "div",
      {
        ...getNodeHtmlDataset(node),
        class: "math-node"
      },
      0
    ],
    parseDOM: [{ tag: `div[${nodeHtmlData.type}='math_display']` }]
  }
};

// ../common/src/editor/heading/headingNodeAttrsSchema.ts
var headingNodeAttrsSchema = z.object({
  id: blockNodeIdSchema,
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6)
  ])
});

// ../common/src/utils/array.ts
var sortBy = (key, shouldDescend = false, preprocess) => {
  const getValue = preprocess != null ? (object) => preprocess(object[key]) : (object) => object[key];
  return function compare(a, b) {
    const aValue = getValue(a);
    const bValue = getValue(b);
    return (shouldDescend ? -1 : 1) * (Number(aValue > bValue) - Number(bValue > aValue));
  };
};
var sortByDate = (key, shouldDescend = false) => sortBy(key, shouldDescend, (time) => new Date(time));
var sortByCreatedTime = (shouldDescend = false) => sortByDate("createdTime", shouldDescend);
var descendByCreatedTime = sortByCreatedTime(true);
var sortByLastEditedTime = (shouldDescend = false) => sortByDate("lastEditedTime", shouldDescend);
var ascendByLastEditedTime = sortByLastEditedTime(false);
var descendByLastEditedTime = sortByLastEditedTime(true);
var descendByLastEditedTimeOfContainer = sortBy("data", true, ({ lastEditedTime }) => new Date(lastEditedTime));

// ../common/src/utils/isValidDate.ts
var import_dayjs = __toESM(require_dayjs_min(), 1);
var import_customParseFormat = __toESM(require_customParseFormat(), 1);
import_dayjs.default.extend(import_customParseFormat.default);

// ../common/node_modules/@sindresorhus/is/dist/index.js
var typedArrayTypeNames = [
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array"
];
function isTypedArrayName(name) {
  return typedArrayTypeNames.includes(name);
}
var objectTypeNames = [
  "Function",
  "Generator",
  "AsyncGenerator",
  "GeneratorFunction",
  "AsyncGeneratorFunction",
  "AsyncFunction",
  "Observable",
  "Array",
  "Buffer",
  "Blob",
  "Object",
  "RegExp",
  "Date",
  "Error",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "WeakRef",
  "ArrayBuffer",
  "SharedArrayBuffer",
  "DataView",
  "Promise",
  "URL",
  "FormData",
  "URLSearchParams",
  "HTMLElement",
  "NaN",
  ...typedArrayTypeNames
];
function isObjectTypeName(name) {
  return objectTypeNames.includes(name);
}
var primitiveTypeNames = [
  "null",
  "undefined",
  "string",
  "number",
  "bigint",
  "boolean",
  "symbol"
];
function isPrimitiveTypeName(name) {
  return primitiveTypeNames.includes(name);
}
function isOfType(type) {
  return (value) => typeof value === type;
}
var { toString } = Object.prototype;
var getObjectType = (value) => {
  const objectTypeName = toString.call(value).slice(8, -1);
  if (/HTML\w+Element/.test(objectTypeName) && is.domElement(value)) {
    return "HTMLElement";
  }
  if (isObjectTypeName(objectTypeName)) {
    return objectTypeName;
  }
  return void 0;
};
var isObjectOfType = (type) => (value) => getObjectType(value) === type;
function is(value) {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(value) ? "NaN" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "Function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    default:
  }
  if (is.observable(value)) {
    return "Observable";
  }
  if (is.array(value)) {
    return "Array";
  }
  if (is.buffer(value)) {
    return "Buffer";
  }
  const tagType = getObjectType(value);
  if (tagType) {
    return tagType;
  }
  if (value instanceof String || value instanceof Boolean || value instanceof Number) {
    throw new TypeError("Please don't use object wrappers for primitive types");
  }
  return "Object";
}
is.undefined = isOfType("undefined");
is.string = isOfType("string");
var isNumberType = isOfType("number");
is.number = (value) => isNumberType(value) && !is.nan(value);
is.bigint = isOfType("bigint");
is.function_ = isOfType("function");
is.null_ = (value) => value === null;
is.class_ = (value) => is.function_(value) && value.toString().startsWith("class ");
is.boolean = (value) => value === true || value === false;
is.symbol = isOfType("symbol");
is.numericString = (value) => is.string(value) && !is.emptyStringOrWhitespace(value) && !Number.isNaN(Number(value));
is.array = (value, assertion) => {
  if (!Array.isArray(value)) {
    return false;
  }
  if (!is.function_(assertion)) {
    return true;
  }
  return value.every((element) => assertion(element));
};
is.buffer = (value) => value?.constructor?.isBuffer?.(value) ?? false;
is.blob = (value) => isObjectOfType("Blob")(value);
is.nullOrUndefined = (value) => is.null_(value) || is.undefined(value);
is.object = (value) => !is.null_(value) && (typeof value === "object" || is.function_(value));
is.iterable = (value) => is.function_(value?.[Symbol.iterator]);
is.asyncIterable = (value) => is.function_(value?.[Symbol.asyncIterator]);
is.generator = (value) => is.iterable(value) && is.function_(value?.next) && is.function_(value?.throw);
is.asyncGenerator = (value) => is.asyncIterable(value) && is.function_(value.next) && is.function_(value.throw);
is.nativePromise = (value) => isObjectOfType("Promise")(value);
var hasPromiseApi = (value) => is.function_(value?.then) && is.function_(value?.catch);
is.promise = (value) => is.nativePromise(value) || hasPromiseApi(value);
is.generatorFunction = isObjectOfType("GeneratorFunction");
is.asyncGeneratorFunction = (value) => getObjectType(value) === "AsyncGeneratorFunction";
is.asyncFunction = (value) => getObjectType(value) === "AsyncFunction";
is.boundFunction = (value) => is.function_(value) && !value.hasOwnProperty("prototype");
is.regExp = isObjectOfType("RegExp");
is.date = isObjectOfType("Date");
is.error = isObjectOfType("Error");
is.map = (value) => isObjectOfType("Map")(value);
is.set = (value) => isObjectOfType("Set")(value);
is.weakMap = (value) => isObjectOfType("WeakMap")(value);
is.weakSet = (value) => isObjectOfType("WeakSet")(value);
is.weakRef = (value) => isObjectOfType("WeakRef")(value);
is.int8Array = isObjectOfType("Int8Array");
is.uint8Array = isObjectOfType("Uint8Array");
is.uint8ClampedArray = isObjectOfType("Uint8ClampedArray");
is.int16Array = isObjectOfType("Int16Array");
is.uint16Array = isObjectOfType("Uint16Array");
is.int32Array = isObjectOfType("Int32Array");
is.uint32Array = isObjectOfType("Uint32Array");
is.float32Array = isObjectOfType("Float32Array");
is.float64Array = isObjectOfType("Float64Array");
is.bigInt64Array = isObjectOfType("BigInt64Array");
is.bigUint64Array = isObjectOfType("BigUint64Array");
is.arrayBuffer = isObjectOfType("ArrayBuffer");
is.sharedArrayBuffer = isObjectOfType("SharedArrayBuffer");
is.dataView = isObjectOfType("DataView");
is.enumCase = (value, targetEnum) => Object.values(targetEnum).includes(value);
is.directInstanceOf = (instance, class_) => Object.getPrototypeOf(instance) === class_.prototype;
is.urlInstance = (value) => isObjectOfType("URL")(value);
is.urlString = (value) => {
  if (!is.string(value)) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};
is.truthy = (value) => Boolean(value);
is.falsy = (value) => !value;
is.nan = (value) => Number.isNaN(value);
is.primitive = (value) => is.null_(value) || isPrimitiveTypeName(typeof value);
is.integer = (value) => Number.isInteger(value);
is.safeInteger = (value) => Number.isSafeInteger(value);
is.plainObject = (value) => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return (prototype === null || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null) && !(Symbol.toStringTag in value) && !(Symbol.iterator in value);
};
is.typedArray = (value) => isTypedArrayName(getObjectType(value));
var isValidLength = (value) => is.safeInteger(value) && value >= 0;
is.arrayLike = (value) => !is.nullOrUndefined(value) && !is.function_(value) && isValidLength(value.length);
is.inRange = (value, range) => {
  if (is.number(range)) {
    return value >= Math.min(0, range) && value <= Math.max(range, 0);
  }
  if (is.array(range) && range.length === 2) {
    return value >= Math.min(...range) && value <= Math.max(...range);
  }
  throw new TypeError(`Invalid range: ${JSON.stringify(range)}`);
};
var NODE_TYPE_ELEMENT = 1;
var DOM_PROPERTIES_TO_CHECK = [
  "innerHTML",
  "ownerDocument",
  "style",
  "attributes",
  "nodeValue"
];
is.domElement = (value) => is.object(value) && value.nodeType === NODE_TYPE_ELEMENT && is.string(value.nodeName) && !is.plainObject(value) && DOM_PROPERTIES_TO_CHECK.every((property) => property in value);
is.observable = (value) => {
  if (!value) {
    return false;
  }
  if (value === value[Symbol.observable]?.()) {
    return true;
  }
  if (value === value["@@observable"]?.()) {
    return true;
  }
  return false;
};
is.nodeStream = (value) => is.object(value) && is.function_(value.pipe) && !is.observable(value);
is.infinite = (value) => value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY;
var isAbsoluteMod2 = (remainder) => (value) => is.integer(value) && Math.abs(value % 2) === remainder;
is.evenInteger = isAbsoluteMod2(0);
is.oddInteger = isAbsoluteMod2(1);
is.emptyArray = (value) => is.array(value) && value.length === 0;
is.nonEmptyArray = (value) => is.array(value) && value.length > 0;
is.emptyString = (value) => is.string(value) && value.length === 0;
var isWhiteSpaceString = (value) => is.string(value) && !/\S/.test(value);
is.emptyStringOrWhitespace = (value) => is.emptyString(value) || isWhiteSpaceString(value);
is.nonEmptyString = (value) => is.string(value) && value.length > 0;
is.nonEmptyStringAndNotWhitespace = (value) => is.string(value) && !is.emptyStringOrWhitespace(value);
is.emptyObject = (value) => is.object(value) && !is.map(value) && !is.set(value) && Object.keys(value).length === 0;
is.nonEmptyObject = (value) => is.object(value) && !is.map(value) && !is.set(value) && Object.keys(value).length > 0;
is.emptySet = (value) => is.set(value) && value.size === 0;
is.nonEmptySet = (value) => is.set(value) && value.size > 0;
is.emptyMap = (value) => is.map(value) && value.size === 0;
is.nonEmptyMap = (value) => is.map(value) && value.size > 0;
is.propertyKey = (value) => is.any([is.string, is.number, is.symbol], value);
is.formData = (value) => isObjectOfType("FormData")(value);
is.urlSearchParams = (value) => isObjectOfType("URLSearchParams")(value);
var predicateOnArray = (method, predicate, values) => {
  if (!is.function_(predicate)) {
    throw new TypeError(`Invalid predicate: ${JSON.stringify(predicate)}`);
  }
  if (values.length === 0) {
    throw new TypeError("Invalid number of values");
  }
  return method.call(values, predicate);
};
is.any = (predicate, ...values) => {
  const predicates = is.array(predicate) ? predicate : [predicate];
  return predicates.some((singlePredicate) => predicateOnArray(Array.prototype.some, singlePredicate, values));
};
is.all = (predicate, ...values) => predicateOnArray(Array.prototype.every, predicate, values);
var assertType = (condition, description, value, options = {}) => {
  if (!condition) {
    const { multipleValues } = options;
    const valuesMessage = multipleValues ? `received values of types ${[
      ...new Set(value.map((singleValue) => `\`${is(singleValue)}\``))
    ].join(", ")}` : `received value of type \`${is(value)}\``;
    throw new TypeError(`Expected value which is \`${description}\`, ${valuesMessage}.`);
  }
};
var assert = {
  // Unknowns.
  undefined: (value) => assertType(is.undefined(value), "undefined", value),
  string: (value) => assertType(is.string(value), "string", value),
  number: (value) => assertType(is.number(value), "number", value),
  bigint: (value) => assertType(is.bigint(value), "bigint", value),
  // eslint-disable-next-line @typescript-eslint/ban-types
  function_: (value) => assertType(is.function_(value), "Function", value),
  null_: (value) => assertType(is.null_(value), "null", value),
  class_: (value) => assertType(is.class_(value), "Class", value),
  boolean: (value) => assertType(is.boolean(value), "boolean", value),
  symbol: (value) => assertType(is.symbol(value), "symbol", value),
  numericString: (value) => assertType(is.numericString(value), "string with a number", value),
  array: (value, assertion) => {
    const assert2 = assertType;
    assert2(is.array(value), "Array", value);
    if (assertion) {
      value.forEach(assertion);
    }
  },
  buffer: (value) => assertType(is.buffer(value), "Buffer", value),
  blob: (value) => assertType(is.blob(value), "Blob", value),
  nullOrUndefined: (value) => assertType(is.nullOrUndefined(value), "null or undefined", value),
  object: (value) => assertType(is.object(value), "Object", value),
  iterable: (value) => assertType(is.iterable(value), "Iterable", value),
  asyncIterable: (value) => assertType(is.asyncIterable(value), "AsyncIterable", value),
  generator: (value) => assertType(is.generator(value), "Generator", value),
  asyncGenerator: (value) => assertType(is.asyncGenerator(value), "AsyncGenerator", value),
  nativePromise: (value) => assertType(is.nativePromise(value), "native Promise", value),
  promise: (value) => assertType(is.promise(value), "Promise", value),
  generatorFunction: (value) => assertType(is.generatorFunction(value), "GeneratorFunction", value),
  asyncGeneratorFunction: (value) => assertType(is.asyncGeneratorFunction(value), "AsyncGeneratorFunction", value),
  // eslint-disable-next-line @typescript-eslint/ban-types
  asyncFunction: (value) => assertType(is.asyncFunction(value), "AsyncFunction", value),
  // eslint-disable-next-line @typescript-eslint/ban-types
  boundFunction: (value) => assertType(is.boundFunction(value), "Function", value),
  regExp: (value) => assertType(is.regExp(value), "RegExp", value),
  date: (value) => assertType(is.date(value), "Date", value),
  error: (value) => assertType(is.error(value), "Error", value),
  map: (value) => assertType(is.map(value), "Map", value),
  set: (value) => assertType(is.set(value), "Set", value),
  weakMap: (value) => assertType(is.weakMap(value), "WeakMap", value),
  weakSet: (value) => assertType(is.weakSet(value), "WeakSet", value),
  weakRef: (value) => assertType(is.weakRef(value), "WeakRef", value),
  int8Array: (value) => assertType(is.int8Array(value), "Int8Array", value),
  uint8Array: (value) => assertType(is.uint8Array(value), "Uint8Array", value),
  uint8ClampedArray: (value) => assertType(is.uint8ClampedArray(value), "Uint8ClampedArray", value),
  int16Array: (value) => assertType(is.int16Array(value), "Int16Array", value),
  uint16Array: (value) => assertType(is.uint16Array(value), "Uint16Array", value),
  int32Array: (value) => assertType(is.int32Array(value), "Int32Array", value),
  uint32Array: (value) => assertType(is.uint32Array(value), "Uint32Array", value),
  float32Array: (value) => assertType(is.float32Array(value), "Float32Array", value),
  float64Array: (value) => assertType(is.float64Array(value), "Float64Array", value),
  bigInt64Array: (value) => assertType(is.bigInt64Array(value), "BigInt64Array", value),
  bigUint64Array: (value) => assertType(is.bigUint64Array(value), "BigUint64Array", value),
  arrayBuffer: (value) => assertType(is.arrayBuffer(value), "ArrayBuffer", value),
  sharedArrayBuffer: (value) => assertType(is.sharedArrayBuffer(value), "SharedArrayBuffer", value),
  dataView: (value) => assertType(is.dataView(value), "DataView", value),
  enumCase: (value, targetEnum) => assertType(is.enumCase(value, targetEnum), "EnumCase", value),
  urlInstance: (value) => assertType(is.urlInstance(value), "URL", value),
  urlString: (value) => assertType(is.urlString(value), "string with a URL", value),
  truthy: (value) => assertType(is.truthy(value), "truthy", value),
  falsy: (value) => assertType(is.falsy(value), "falsy", value),
  nan: (value) => assertType(is.nan(value), "NaN", value),
  primitive: (value) => assertType(is.primitive(value), "primitive", value),
  integer: (value) => assertType(is.integer(value), "integer", value),
  safeInteger: (value) => assertType(is.safeInteger(value), "integer", value),
  plainObject: (value) => assertType(is.plainObject(value), "plain object", value),
  typedArray: (value) => assertType(is.typedArray(value), "TypedArray", value),
  arrayLike: (value) => assertType(is.arrayLike(value), "array-like", value),
  domElement: (value) => assertType(is.domElement(value), "HTMLElement", value),
  observable: (value) => assertType(is.observable(value), "Observable", value),
  nodeStream: (value) => assertType(is.nodeStream(value), "Node.js Stream", value),
  infinite: (value) => assertType(is.infinite(value), "infinite number", value),
  emptyArray: (value) => assertType(is.emptyArray(value), "empty array", value),
  nonEmptyArray: (value) => assertType(is.nonEmptyArray(value), "non-empty array", value),
  emptyString: (value) => assertType(is.emptyString(value), "empty string", value),
  emptyStringOrWhitespace: (value) => assertType(is.emptyStringOrWhitespace(value), "empty string or whitespace", value),
  nonEmptyString: (value) => assertType(is.nonEmptyString(value), "non-empty string", value),
  nonEmptyStringAndNotWhitespace: (value) => assertType(is.nonEmptyStringAndNotWhitespace(value), "non-empty string and not whitespace", value),
  emptyObject: (value) => assertType(is.emptyObject(value), "empty object", value),
  nonEmptyObject: (value) => assertType(is.nonEmptyObject(value), "non-empty object", value),
  emptySet: (value) => assertType(is.emptySet(value), "empty set", value),
  nonEmptySet: (value) => assertType(is.nonEmptySet(value), "non-empty set", value),
  emptyMap: (value) => assertType(is.emptyMap(value), "empty map", value),
  nonEmptyMap: (value) => assertType(is.nonEmptyMap(value), "non-empty map", value),
  propertyKey: (value) => assertType(is.propertyKey(value), "PropertyKey", value),
  formData: (value) => assertType(is.formData(value), "FormData", value),
  urlSearchParams: (value) => assertType(is.urlSearchParams(value), "URLSearchParams", value),
  // Numbers.
  evenInteger: (value) => assertType(is.evenInteger(value), "even integer", value),
  oddInteger: (value) => assertType(is.oddInteger(value), "odd integer", value),
  // Two arguments.
  directInstanceOf: (instance, class_) => assertType(is.directInstanceOf(instance, class_), "T", instance),
  inRange: (value, range) => assertType(is.inRange(value, range), "in range", value),
  // Variadic functions.
  any: (predicate, ...values) => assertType(is.any(predicate, ...values), "predicate returns truthy for any value", values, { multipleValues: true }),
  all: (predicate, ...values) => assertType(is.all(predicate, ...values), "predicate returns truthy for all values", values, { multipleValues: true })
};
Object.defineProperties(is, {
  class: {
    value: is.class_
  },
  function: {
    value: is.function_
  },
  null: {
    value: is.null_
  }
});
Object.defineProperties(assert, {
  class: {
    value: assert.class_
  },
  function: {
    value: assert.function_
  },
  null: {
    value: assert.null_
  }
});
var dist_default = is;

// ../common/src/error/getStandardError.ts
function getStandardError(maybeError) {
  if (maybeError instanceof Error) {
    return maybeError;
  }
  try {
    return new Error(JSON.stringify(maybeError));
  } catch {
    return new Error(String(maybeError));
  }
}

// ../common/src/error/getErrorMessage.ts
function getErrorMessage(error) {
  if (dist_default.object(error) && "message" in error && dist_default.string(error.message)) {
    return error.message;
  }
  return getStandardError(error).message;
}

// ../common/src/utils/getDateTime.ts
function getDateTime(value = Date.now()) {
  return new Date(value).toISOString();
}

// ../common/src/utils/getRelativeTime.ts
var minuteInSeconds = 60;
var hourInSeconds = 60 * minuteInSeconds;
var dayInSeconds = 24 * hourInSeconds;

// ../common/src/card/cardIdSchema.ts
var cardIdSchema = z.union([z.string().uuid(), z.string().date()]);

// ../common/src/card/cardTypeSchema.ts
var cardTypeSchema = z.enum([
  "note",
  "pdf",
  "journal",
  "highlightElement",
  "source",
  "image",
  "video",
  "audio",
  "web"
]);

// ../common/src/chat/goalPageUpdateQueueSchema.ts
var goalPageUpdateQueueItemBaseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  createdTime: z.string().datetime(),
  lastEditedTime: z.string().datetime()
});
var userCardTextSelectionGoalPageUpdateQueueItemSchema = goalPageUpdateQueueItemBaseSchema.extend({
  createdBy: z.literal("user"),
  createdFrom: z.object({
    type: z.literal("cardTextSelection"),
    cardId: cardIdSchema,
    cardType: cardTypeSchema
  })
});
var userChatMessageTextSelectionGoalPageUpdateQueueItemSchema = goalPageUpdateQueueItemBaseSchema.extend({
  createdBy: z.literal("user"),
  createdFrom: z.object({
    type: z.literal("chatMessageTextSelection"),
    chatMessageId: z.string().uuid()
  })
});
var aiAgentSuggestionGoalPageUpdateQueueItemSchema = goalPageUpdateQueueItemBaseSchema.extend({
  createdBy: z.literal("aiAgent"),
  createdFrom: z.object({
    type: z.literal("aiAgentSuggestion"),
    chatMessageId: z.string().uuid()
  })
});
var goalPageUpdateQueueItemSchema = z.union([
  userCardTextSelectionGoalPageUpdateQueueItemSchema,
  userChatMessageTextSelectionGoalPageUpdateQueueItemSchema,
  aiAgentSuggestionGoalPageUpdateQueueItemSchema
]);
var goalPageUpdateQueueSchema = z.array(goalPageUpdateQueueItemSchema);

// ../common/src/chat/aiAgentInfoSchema.ts
var aiAgentInfoSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("general"),
    mode: z.enum(["ask", "agent"]).optional(),
    goalPageUpdateQueue: goalPageUpdateQueueSchema.optional()
  }),
  z.object({
    type: z.literal("tutor"),
    isGoalSetup: z.boolean().optional(),
    state: z.literal("ended").optional(),
    goalPageUpdateQueue: goalPageUpdateQueueSchema.optional()
  })
]);

// ../common/src/utils/checkIsWhiteboardAvailable.ts
var import_lodash = __toESM(require_lodash(), 1);

// ../common/src/goal-overview/goalOverviewContentSchema.ts
var goalOverviewLearningTopicSubtopicSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  subtitle: z.string(),
  status: z.enum(["notStarted", "inProgress", "covered"]),
  coveredSummary: z.string().nullable()
});
var goalOverviewLearningTopicSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  subtopics: z.array(goalOverviewLearningTopicSubtopicSchema),
  sources: z.array(
    z.object({
      text: z.string(),
      cardId: z.string().uuid(),
      chunkIndex: z.number().int().nonnegative().optional(),
      pdfPage: z.number().int().positive().optional(),
      link: z.string().optional()
    })
  )
});
var goalOverviewGeneralContentSchema = z.object({
  type: z.literal("general"),
  blocks: z.record(z.any())
  // ProseMirror block
});
var goalOverviewLearningContentSchema = z.object({
  type: z.literal("learning"),
  overview: z.string(),
  preferences: z.string().optional(),
  expectedOutcome: z.string(),
  topics: z.array(goalOverviewLearningTopicSchema)
});
var goalOverviewContentSchema = z.discriminatedUnion("type", [
  goalOverviewGeneralContentSchema,
  goalOverviewLearningContentSchema
]);

// ../common/src/goal-overview/goalOverviewDataSchema.ts
var goalOverviewDataSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  content: goalOverviewContentSchema,
  createdTime: z.string().datetime(),
  lastEditedTime: z.string().datetime(),
  createdBy: z.string().uuid(),
  spaceId: z.string().uuid()
});
var partialGoalOverviewDataSchema = goalOverviewDataSchema.omit({
  id: true,
  createdTime: true,
  createdBy: true,
  spaceId: true
}).partial();

// ../common/src/lesson-plan/lessonPlanDataSchema.ts
var lessonPlanPartItemSchema = z.object({
  title: z.string(),
  description: z.string(),
  bulletPoints: z.array(z.string()),
  syllabusSubtopicIds: z.array(z.string()),
  isReview: z.boolean(),
  status: z.enum(["notStarted", "inProgress", "covered"]),
  sources: z.array(
    z.object({
      text: z.string(),
      cardId: z.string().uuid(),
      chunkIndex: z.number().int().nonnegative().optional(),
      pdfPage: z.number().int().positive().optional(),
      link: z.string().optional()
    })
  ).optional().default([])
});
var lessonPlanContentSchema = z.object({
  overview: z.string(),
  parts: z.array(lessonPlanPartItemSchema),
  nextLessonSummary: z.string()
});
var lessonPlanDataSchema = z.object({
  id: z.string().uuid(),
  chatId: z.string().uuid(),
  content: lessonPlanContentSchema,
  createdTime: z.string().datetime(),
  lastEditedTime: z.string().datetime(),
  createdBy: z.string().uuid(),
  spaceId: z.string().uuid()
});
var partialLessonPlanDataSchema = lessonPlanDataSchema.omit({
  id: true,
  chatId: true,
  createdTime: true,
  createdBy: true,
  spaceId: true
}).partial();

// ../common/src/chat/aiTutorToolSchemas.ts
var courseSubtopicStatusSchema = z.object({
  subtopicDisplayNumber: z.string(),
  status: z.enum(["notStarted", "inProgress", "covered"]),
  coveredSummary: z.string().nullable()
});
var courseSubtopicStatusesSchema = z.array(courseSubtopicStatusSchema);

// ../common/src/card/objectPropertyValueSchemas.ts
var objectPropertyTextValueSchema = z.union([
  z.object({ type: z.string() }).and(z.record(z.any())),
  z.null()
]);
var objectPropertyNumberValueSchema = z.string().refine((value) => value.trim() !== "" && !Number.isNaN(Number(value))).nullable();
var objectPropertySelectValueSchema = z.string().nullable();
var objectPropertyMultiSelectValueSchema = z.array(z.string());
var objectPropertyCombinedSelectValueSchema = z.union([
  objectPropertySelectValueSchema,
  objectPropertyMultiSelectValueSchema
]);
var objectPropertyCheckboxValueSchema = z.boolean();
var objectPropertyUrlValueSchema = z.string();
var objectPropertyPhoneValueSchema = z.string();
var objectPropertyEmailValueSchema = z.string();
var objectPropertyDateValueSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime().nullable()
}).nullable();
var cardTypeSupportingRelationPropertySchema = cardTypeSchema;
var objectPropertyRelationValueSchema = z.array(
  z.object({
    id: z.string(),
    type: cardTypeSupportingRelationPropertySchema
  })
);
var creatorTypeSchema = z.enum([
  "author",
  "editor",
  "contributor",
  "translator",
  "reviewedAuthor",
  "seriesEditor",
  "bookAuthor",
  "artist",
  "performer",
  "composer",
  "director",
  "producer",
  "scriptwriter",
  "interviewee",
  "interviewer",
  "recipient",
  "counsel",
  "commenter",
  "cosponsor",
  "sponsor",
  "programmer",
  "inventor",
  "attorneyAgent",
  "podcaster",
  "guest",
  "cartographer",
  "castMember",
  "presenter",
  "wordsBy",
  "originalCreator",
  "host",
  "narrator",
  "chair",
  "creator",
  "executiveProducer",
  "organizer",
  "seriesCreator"
]);
var creatorItemSchema = z.object({
  creatorType: creatorTypeSchema,
  firstName: z.string().optional(),
  lastName: z.string().optional()
});
var objectPropertyCreatorValueSchema = z.array(creatorItemSchema);
var objectPropertyValueSchema = z.union([
  objectPropertyTextValueSchema,
  objectPropertyNumberValueSchema,
  objectPropertySelectValueSchema,
  objectPropertyMultiSelectValueSchema,
  objectPropertyCheckboxValueSchema,
  objectPropertyUrlValueSchema,
  objectPropertyPhoneValueSchema,
  objectPropertyEmailValueSchema,
  objectPropertyDateValueSchema,
  objectPropertyRelationValueSchema,
  objectPropertyCreatorValueSchema
]);
var objectPropertyValueDataSchema = z.object({
  value: objectPropertyValueSchema
});

// ../common/src/source/sourceItemTypeSchema.ts
var sourceItemTypeSchema = z.enum([
  "artwork",
  "audioRecording",
  "bill",
  "blogPost",
  "book",
  "bookSection",
  "case",
  "computerProgram",
  "conferencePaper",
  "dataset",
  "dictionaryEntry",
  "document",
  "email",
  "encyclopediaArticle",
  "film",
  "forumPost",
  "hearing",
  "instantMessage",
  "interview",
  "journalArticle",
  "letter",
  "magazineArticle",
  "manuscript",
  "map",
  "newspaperArticle",
  "patent",
  "podcast",
  "preprint",
  "presentation",
  "radioBroadcast",
  "report",
  "standard",
  "statute",
  "thesis",
  "tvBroadcast",
  "videoRecording",
  "webpage"
]);

// ../common/src/collection/collectionQueryConfigSchema.ts
var tagQueryConfigSchema = z.object({
  type: z.enum(["tag"]),
  id: z.string()
});
var allSourceCardsQueryConfigSchema = z.object({
  cardType: z.literal("source")
});
var sourceItemTypeQueryConfigSchema = z.object({
  cardType: z.literal("source"),
  itemType: sourceItemTypeSchema
});
var collectionQueryConfigSchema = z.union([
  tagQueryConfigSchema,
  sourceItemTypeQueryConfigSchema,
  allSourceCardsQueryConfigSchema
]);

// ../common/src/utils/limitTo255.ts
function limitTo255(value) {
  return value.slice(0, 255);
}

// ../common/src/utils/limitTo1020.ts
function limitTo1020(value) {
  return value.slice(0, 1020);
}

// ../common/src/utils/limitTo65535.ts
function limitTo65535(value) {
  return value.slice(0, 65535);
}

// ../common/src/ai-agent/aiAgentToolSchemas.ts
var finiteSchema = z.number().refine(Number.isFinite);
var cardIdSchema2 = z.union([z.string().uuid(), z.string().date()]);
var objectColorSchema = z.enum([
  "yellow",
  "red",
  "blue",
  "green",
  "black",
  "orange",
  "purple",
  "white"
]);
var pdfParsedStatusSchema = z.enum(["processing", "success", "failed", "notSupported"]).nullable();
var connectedStyleSchema = z.enum(["default", "none", "lineArrow"]);
var aiContentObjectTypes = Object.freeze([
  "card",
  "pdfCard",
  "videoCard",
  "audioCard",
  "imageCard",
  "webCard",
  "source",
  "journal",
  "section",
  "textElement",
  "connection",
  "whiteboard",
  "mindMap",
  "chatMessagesElement",
  "chat",
  "videoElement",
  "audioElement",
  "imageElement",
  "webElement",
  "highlightElement",
  "goal",
  "goalOverview",
  "tag",
  "toolCallResult"
]);
var readObjectToolObjectTypes = [
  "card",
  "pdfCard",
  "videoCard",
  "audioCard",
  "imageCard",
  "webCard",
  "journal",
  "goalOverview",
  "whiteboard",
  "section",
  "textElement",
  "mindMap",
  "chatMessagesElement",
  "chat",
  "highlightElement",
  "videoElement",
  "audioElement",
  "imageElement",
  "toolCallResult"
];
var readObjectToolObjectTypeSchema = z.enum(readObjectToolObjectTypes);
var nonToolCallResultReadObjectTypeSchema = readObjectToolObjectTypeSchema.exclude(["toolCallResult"]);
var searchableObjectTypeSchema = z.enum([
  "card",
  "pdfCard",
  "journal",
  "highlightElement",
  "imageCard",
  "videoCard",
  "audioCard",
  "webCard",
  "textElement",
  "insight",
  "whiteboard",
  "section",
  "tag",
  "mindMapTextNode",
  "source",
  "chat",
  "chatMessage"
]);
var searchableTitleObjectTypeSchema = searchableObjectTypeSchema.extract([
  "card",
  "pdfCard",
  "journal",
  "highlightElement",
  "imageCard",
  "videoCard",
  "audioCard",
  "webCard",
  "insight",
  "whiteboard",
  "section",
  "tag",
  "mindMapTextNode",
  "source",
  "chat"
]);
var searchableContentObjectTypeSchema = searchableObjectTypeSchema.extract([
  "card",
  "journal",
  "highlightElement",
  "textElement",
  "insight",
  "chatMessage"
]);
var mentionedObjectTitleByIdMapSchema = z.record(z.string(), z.string()).optional();
var objectInstanceIdSchema = z.object({ id: z.string() });
var uuidObjectInstanceIdSchema = z.object({ id: z.string().uuid() });
var propertyOptionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).transform(limitTo255),
  color: objectColorSchema
});
var propertyTypeSchema = z.enum([
  "text",
  "number",
  "select",
  "multiSelect",
  "date",
  "checkbox",
  "url",
  "phone",
  "email",
  "relation",
  "creator"
]);
var propertyConfigSchema = z.object({
  options: z.array(propertyOptionSchema),
  tagId: z.string().optional()
});
var cardDatabaseSchema = z.object({
  collectionData: z.object({
    id: z.string(),
    queryConfig: collectionQueryConfigSchema
  }),
  tagData: z.object({
    id: z.string(),
    name: z.string().min(1).transform(limitTo255)
  }),
  propertiesData: z.array(
    z.object({
      id: z.string(),
      name: z.string().min(1).transform(limitTo255),
      type: propertyTypeSchema,
      config: propertyConfigSchema.nullable()
    })
  ),
  objectPropertyRelationsData: z.array(
    z.object({
      propertyId: z.string(),
      value: objectPropertyValueDataSchema
    })
  ),
  mentionedObjectTitleByIdMap: mentionedObjectTitleByIdMapSchema
});
var cardDatabasesSchema = z.array(cardDatabaseSchema);
var cardDataSchema = z.object({
  id: z.string(),
  title: z.string().transform(limitTo1020),
  content: z.string()
});
var cardListDataSchema = z.object({
  id: z.string(),
  title: z.string().transform(limitTo1020)
});
var cardContentDataSchema = z.object({
  objectType: z.literal("card"),
  cardData: cardDataSchema,
  databases: cardDatabasesSchema.optional(),
  mentionedObjectTitleByIdMap: mentionedObjectTitleByIdMapSchema
});
var cardWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("card"),
  cardData: cardListDataSchema,
  cardInstanceData: z.object({
    id: z.string(),
    color: objectColorSchema
  }).optional()
});
var cardWhiteboardObjectContentDataSchema = z.object({
  objectType: z.literal("card"),
  cardData: cardDataSchema,
  cardInstanceData: z.object({
    id: z.string(),
    color: objectColorSchema
  }).optional(),
  mentionedObjectTitleByIdMap: mentionedObjectTitleByIdMapSchema
});
var pdfOutlineItemDataSchema = z.object({
  title: z.string(),
  page: z.number().nullable(),
  items: z.lazy(() => z.array(pdfOutlineItemDataSchema))
});
var pdfCardListDataSchema = z.object({
  id: z.string(),
  title: z.string().min(1).transform(limitTo255),
  parsedStatus: pdfParsedStatusSchema
});
var pdfCardOutlineDataSchema = z.object({
  objectType: z.literal("pdfCard"),
  pdfCardData: pdfCardListDataSchema,
  databases: cardDatabasesSchema.optional(),
  totalPages: z.number().optional(),
  outlineItems: z.array(pdfOutlineItemDataSchema).optional()
});
var pdfCardWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("pdfCard"),
  pdfCardData: pdfCardListDataSchema,
  pdfCardInstanceData: objectInstanceIdSchema.optional(),
  totalPages: z.number().optional()
});
var pdfBoundingBoxSchema = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive()
});
var pdfParsedBlockSchema = z.object({
  id: z.string().uuid(),
  boundingBox: pdfBoundingBoxSchema,
  text: z.string().optional(),
  type: z.string(),
  imageFileId: z.string().uuid().optional(),
  captions: z.array(z.string()).optional(),
  footnotes: z.array(z.string()).optional(),
  textFormat: z.string().optional(),
  textLevel: z.number().int().optional()
});
var parsedBlockWithPageSchema = z.object({
  block: pdfParsedBlockSchema,
  page: z.number().int().positive(),
  index: z.number().int().nonnegative()
});
var pdfCardParsedContentDataSchema = z.object({
  objectType: z.literal("pdfCard"),
  pdfCardData: pdfCardListDataSchema,
  totalPages: z.number().optional(),
  parsedBlocks: z.array(parsedBlockWithPageSchema).optional()
});
var pdfCardWhiteboardObjectContentDataSchema = z.object({
  objectType: z.literal("pdfCard"),
  pdfCardData: pdfCardListDataSchema,
  pdfCardInstanceData: objectInstanceIdSchema.optional(),
  totalPages: z.number().optional(),
  parsedBlocks: z.array(parsedBlockWithPageSchema).optional()
});
var mediaCardTranscriptSchema = z.object({
  status: z.literal("processing"),
  timestamp: z.string()
}).or(
  z.object({
    status: z.literal("failed")
  })
).or(
  z.object({
    status: z.literal("success"),
    transcriptEntries: z.array(
      z.object({
        id: z.string(),
        type: z.enum(["plainText"]),
        start: z.number(),
        end: z.number(),
        content: z.string()
      })
    )
  })
);
var mediaCardTypeSchema = z.enum(["image", "video", "audio"]);
var mediaCardInstanceDataSchema = z.object({
  id: z.string().uuid(),
  color: objectColorSchema
}).optional();
var videoCardContentDataSchema = z.object({
  objectType: z.literal("videoCard"),
  mediaCardData: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).transform(limitTo255),
    type: mediaCardTypeSchema,
    link: z.string().nullable(),
    transcript: mediaCardTranscriptSchema.nullable()
  }),
  databases: cardDatabasesSchema.optional()
}).refine((data) => data.mediaCardData.type === "video", {
  message: 'videoCard requires mediaCardData.type "video"'
});
var audioCardContentDataSchema = z.object({
  objectType: z.literal("audioCard"),
  mediaCardData: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).transform(limitTo255),
    type: mediaCardTypeSchema,
    transcript: mediaCardTranscriptSchema.nullable()
  }),
  databases: cardDatabasesSchema.optional()
}).refine((data) => data.mediaCardData.type === "audio", {
  message: 'audioCard requires mediaCardData.type "audio"'
});
var imageCardContentDataSchema = z.object({
  objectType: z.literal("imageCard"),
  mediaCardData: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).transform(limitTo255),
    type: mediaCardTypeSchema,
    fileId: z.string().uuid().nullable()
  }),
  databases: cardDatabasesSchema.optional()
}).refine((data) => data.mediaCardData.type === "image", {
  message: 'imageCard requires mediaCardData.type "image"'
});
var videoCardWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("videoCard"),
  mediaCardData: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).transform(limitTo255),
    type: mediaCardTypeSchema
  }),
  mediaCardInstanceData: mediaCardInstanceDataSchema
}).refine((data) => data.mediaCardData.type === "video", {
  message: 'videoCard requires mediaCardData.type "video"'
});
var audioCardWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("audioCard"),
  mediaCardData: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).transform(limitTo255),
    type: mediaCardTypeSchema
  }),
  mediaCardInstanceData: mediaCardInstanceDataSchema
}).refine((data) => data.mediaCardData.type === "audio", {
  message: 'audioCard requires mediaCardData.type "audio"'
});
var imageCardWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("imageCard"),
  mediaCardData: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).transform(limitTo255),
    type: mediaCardTypeSchema
  }),
  mediaCardInstanceData: mediaCardInstanceDataSchema
}).refine((data) => data.mediaCardData.type === "image", {
  message: 'imageCard requires mediaCardData.type "image"'
});
var imageCardListItemDataSchema = z.object({
  objectType: z.literal("imageCard"),
  mediaCardData: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).transform(limitTo255),
    type: mediaCardTypeSchema
  })
}).refine((data) => data.mediaCardData.type === "image", {
  message: 'imageCard requires mediaCardData.type "image"'
});
var videoCardWhiteboardObjectContentDataSchema = z.object({
  objectType: z.literal("videoCard"),
  mediaCardData: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).transform(limitTo255),
    type: mediaCardTypeSchema,
    link: z.string().nullable(),
    transcript: mediaCardTranscriptSchema.nullable()
  }),
  mediaCardInstanceData: mediaCardInstanceDataSchema
}).refine((data) => data.mediaCardData.type === "video", {
  message: 'videoCard requires mediaCardData.type "video"'
});
var audioCardWhiteboardObjectContentDataSchema = z.object({
  objectType: z.literal("audioCard"),
  mediaCardData: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).transform(limitTo255),
    type: mediaCardTypeSchema,
    transcript: mediaCardTranscriptSchema.nullable()
  }),
  mediaCardInstanceData: mediaCardInstanceDataSchema
}).refine((data) => data.mediaCardData.type === "audio", {
  message: 'audioCard requires mediaCardData.type "audio"'
});
var imageCardWhiteboardObjectContentDataSchema = z.object({
  objectType: z.literal("imageCard"),
  mediaCardData: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).transform(limitTo255),
    type: mediaCardTypeSchema,
    fileId: z.string().uuid().nullable()
  }),
  mediaCardInstanceData: mediaCardInstanceDataSchema
}).refine((data) => data.mediaCardData.type === "image", {
  message: 'imageCard requires mediaCardData.type "image"'
});
var journalContentDataSchema = z.object({
  objectType: z.literal("journal"),
  journalData: z.object({
    date: z.string(),
    content: z.string()
  }),
  databases: cardDatabasesSchema.optional(),
  mentionedObjectTitleByIdMap: mentionedObjectTitleByIdMapSchema
});
var journalWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("journal"),
  journalData: z.object({
    date: z.string()
  }),
  journalInstanceData: z.object({
    id: z.string(),
    color: objectColorSchema
  }).optional()
});
var journalWhiteboardObjectContentDataSchema = z.object({
  objectType: z.literal("journal"),
  journalData: z.object({
    date: z.string(),
    content: z.string()
  }),
  journalInstanceData: z.object({
    id: z.string(),
    color: objectColorSchema
  }).optional(),
  mentionedObjectTitleByIdMap: mentionedObjectTitleByIdMapSchema
});
var webCardDataSchema = z.object({
  id: z.string().uuid(),
  title: z.string().transform(limitTo255),
  url: z.string().url()
});
var webCardContentDataSchema = z.object({
  objectType: z.literal("webCard"),
  webCardData: webCardDataSchema,
  databases: cardDatabasesSchema.optional(),
  content: z.string().nullable().optional()
});
var webCardWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("webCard"),
  webCardData: webCardDataSchema,
  webCardInstanceData: uuidObjectInstanceIdSchema.optional()
});
var webCardWhiteboardObjectContentDataSchema = z.object({
  objectType: z.literal("webCard"),
  webCardData: webCardDataSchema,
  webCardInstanceData: uuidObjectInstanceIdSchema.optional(),
  content: z.string().nullable().optional()
});
var finiteRectSchema = z.object({
  top: finiteSchema,
  left: finiteSchema,
  width: finiteSchema,
  height: finiteSchema
});
var cardInsightDataSchema = z.object({
  id: z.string().uuid(),
  sourceBlockIds: z.array(z.string().uuid()).optional(),
  sourceMediaPlaybackRange: z.object({
    start: z.number(),
    end: z.number()
  }).optional()
}).and(
  z.object({
    type: z.literal("insight")
  }).or(
    z.object({
      type: z.literal("card"),
      isFolded: z.boolean()
    })
  ).or(
    z.object({
      type: z.literal("section"),
      title: z.string(),
      level: z.number(),
      isFolded: z.boolean()
    })
  )
);
var cardInsightsDataSchema = z.array(cardInsightDataSchema);
var highlightBaseSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  note: z.record(z.any()),
  propertiesConfig: z.array(z.never()),
  insights: cardInsightsDataSchema,
  wasInsightGenerated: z.boolean(),
  isTrashed: z.boolean(),
  createdTime: z.string().datetime(),
  lastUsedTime: z.string().datetime(),
  lastEditedTime: z.string().datetime(),
  createdBy: z.string(),
  spaceId: z.string().uuid()
});
var highlightElementDataSchema = z.discriminatedUnion("type", [
  highlightBaseSchema.extend({
    type: z.literal("pdfTextHighlight"),
    color: z.enum([
      "yellow",
      "red",
      "green",
      "blue",
      "purple",
      "orange",
      "pink"
    ]),
    sourceLocation: z.object({
      pageNumber: z.number().min(1),
      rects: z.array(finiteRectSchema)
    }),
    highlight: z.record(z.any()),
    metadata: z.null()
  }),
  highlightBaseSchema.extend({
    type: z.literal("pdfArea"),
    color: z.enum([
      "yellow",
      "red",
      "green",
      "blue",
      "purple",
      "orange",
      "pink"
    ]),
    sourceLocation: z.object({
      pageNumber: z.number().min(1),
      rects: z.array(finiteRectSchema)
    }),
    highlight: z.object({
      imageFileId: z.string()
    }),
    metadata: z.null()
  }),
  highlightBaseSchema.extend({
    type: z.literal("readwise"),
    sourceLocation: z.object({
      readwiseHighlightId: z.string(),
      readwiseHighlightUrl: z.string().nullable(),
      readwiseHighlightReadwiseUrl: z.string()
    }),
    color: z.string(),
    highlight: z.record(z.any()),
    metadata: z.object({
      isNoteEdited: z.boolean(),
      isHighlightEdited: z.boolean(),
      location: z.number().nullable()
    })
  }),
  highlightBaseSchema.extend({
    type: z.literal("card"),
    color: z.enum([
      "yellow",
      "red",
      "green",
      "blue",
      "purple",
      "orange",
      "pink"
    ]),
    sourceLocation: z.record(z.never()),
    highlight: z.record(z.any()),
    metadata: z.null()
  })
]);
var highlightElementContentDataSchema = z.object({
  objectType: z.literal("highlightElement"),
  highlightElementData: highlightElementDataSchema,
  databases: cardDatabasesSchema.optional(),
  title: z.string().optional(),
  mentionedObjectTitleByIdMap: mentionedObjectTitleByIdMapSchema
});
var highlightElementWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("highlightElement"),
  highlightElementData: z.object({
    id: z.string(),
    color: z.string()
  }),
  highlightElementInstanceData: objectInstanceIdSchema.optional(),
  title: z.string().optional()
});
var highlightElementWhiteboardObjectContentDataSchema = z.object({
  objectType: z.literal("highlightElement"),
  highlightElementData: highlightElementDataSchema,
  highlightElementInstanceData: objectInstanceIdSchema.optional(),
  title: z.string().optional(),
  mentionedObjectTitleByIdMap: mentionedObjectTitleByIdMapSchema
});
var whiteboardDataSchema = z.object({
  id: z.string(),
  name: z.string().transform(limitTo255)
});
var whiteboardWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("whiteboard"),
  whiteboardData: whiteboardDataSchema,
  whiteboardInstanceData: z.object({
    id: z.string(),
    color: objectColorSchema,
    // `isChild` is optional so older clients that predate this field still
    // parse on a newer backend (otherwise nested whiteboards would be dropped
    // from readWhiteboard output).
    isChild: z.boolean().optional()
  }).optional(),
  cardCount: z.number().int().nonnegative().optional(),
  nestedWhiteboardCount: z.number().int().nonnegative().optional()
});
var whiteboardContentDataSchema = z.object({
  objectType: z.literal("whiteboard"),
  whiteboardData: whiteboardDataSchema,
  cardCount: z.number().int().nonnegative().optional(),
  nestedWhiteboardCount: z.number().int().nonnegative().optional(),
  parentWhiteboardData: whiteboardDataSchema.optional()
});
var sectionListItemDataSchema = z.object({
  objectType: z.literal("section"),
  sectionData: z.object({
    id: z.string(),
    title: z.string().transform(limitTo255),
    color: objectColorSchema
  })
});
var textElementContentDataSchema = z.object({
  objectType: z.literal("textElement"),
  textElementData: z.object({
    id: z.string(),
    content: z.string(),
    color: objectColorSchema
  }),
  mentionedObjectTitleByIdMap: mentionedObjectTitleByIdMapSchema
});
var textElementWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("textElement"),
  textElementData: z.object({
    id: z.string(),
    color: objectColorSchema
  })
});
var mindMapNodeBaseDataSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  childNodeIds: z.array(z.string())
});
var mindMapNodeDataSchema = z.discriminatedUnion("type", [
  mindMapNodeBaseDataSchema.extend({
    type: z.literal("textNode"),
    mindMapTextNodeData: z.object({
      content: z.record(z.any())
    })
  }),
  mindMapNodeBaseDataSchema.extend({
    type: z.literal("cardNode"),
    mindMapCardNodeData: z.object({
      cardId: z.string()
    }),
    cardData: cardListDataSchema.optional()
  }),
  mindMapNodeBaseDataSchema.extend({
    type: z.literal("textElementNode"),
    textElementData: z.object({
      id: z.string(),
      content: z.string(),
      color: objectColorSchema
    })
  }),
  mindMapNodeBaseDataSchema.extend({
    type: z.literal("highlightElementNode"),
    highlightElementId: z.string(),
    highlightElementData: z.object({
      id: z.string(),
      type: z.enum(["pdfTextHighlight", "pdfArea", "readwise", "card"]),
      highlight: z.union([
        z.record(z.unknown()),
        z.object({ imageFileId: z.string() })
      ]),
      note: z.record(z.unknown()),
      color: z.string()
    }).optional()
  })
]);
var mindMapContentDataSchema = z.object({
  objectType: z.literal("mindMap"),
  mindMapData: z.object({
    id: z.string()
  }),
  rootTitle: z.string().optional(),
  nodeCount: z.number().int().nonnegative().optional(),
  nodes: z.array(mindMapNodeDataSchema)
});
var mindMapWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("mindMap"),
  mindMapData: z.object({
    id: z.string()
  }),
  rootTitle: z.string().optional(),
  nodeCount: z.number().int().nonnegative(),
  mindMapInstanceData: objectInstanceIdSchema.optional()
});
var mindMapWhiteboardObjectContentDataSchema = z.object({
  objectType: z.literal("mindMap"),
  mindMapData: z.object({
    id: z.string()
  }),
  rootTitle: z.string().optional(),
  nodeCount: z.number().int().nonnegative().optional(),
  mindMapInstanceData: objectInstanceIdSchema.optional(),
  nodes: z.array(mindMapNodeDataSchema)
});
var chatMessageDataForAiSchema = z.object({
  id: z.string().uuid(),
  content: z.record(z.any()).nullable(),
  createdTime: z.string().datetime(),
  createdBy: z.string().uuid(),
  aiModelDisplayName: z.string().min(1).nullable(),
  quotedChatMessageId: z.string().uuid().nullable()
});
var chatContentDataSchema = z.object({
  objectType: z.literal("chat"),
  chatData: z.object({
    id: z.string().uuid(),
    title: z.string().transform(limitTo255)
  }),
  chatMessageCount: z.number().int().nonnegative().optional(),
  chatMessagesData: z.array(chatMessageDataForAiSchema).optional(),
  authorNameByChatMessageIdMap: z.record(z.string(), z.string()).optional(),
  quotedMessageDataByIdMap: z.record(
    z.string(),
    chatMessageDataForAiSchema.pick({
      id: true,
      content: true
    })
  ).optional(),
  mentionedObjectTitleByIdMap: mentionedObjectTitleByIdMapSchema
});
var chatWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("chat"),
  chatData: z.object({
    id: z.string().uuid(),
    title: z.string().transform(limitTo255)
  }),
  chatMessageCount: z.number().int().nonnegative().optional(),
  chatInstanceData: uuidObjectInstanceIdSchema.optional()
});
var chatWhiteboardObjectContentDataSchema = z.object({
  objectType: z.literal("chat"),
  chatData: z.object({
    id: z.string().uuid(),
    title: z.string().transform(limitTo255)
  }),
  chatMessageCount: z.number().int().nonnegative().optional(),
  chatInstanceData: uuidObjectInstanceIdSchema.optional(),
  chatMessagesData: z.array(chatMessageDataForAiSchema).optional(),
  authorNameByChatMessageIdMap: z.record(z.string(), z.string()).optional(),
  quotedMessageDataByIdMap: z.record(
    z.string(),
    chatMessageDataForAiSchema.pick({
      id: true,
      content: true
    })
  ).optional(),
  mentionedObjectTitleByIdMap: mentionedObjectTitleByIdMapSchema
});
var chatMessagesElementContentDataSchema = z.object({
  objectType: z.literal("chatMessagesElement"),
  chatMessagesElementData: z.object({
    id: z.string().uuid(),
    color: objectColorSchema
  }),
  chatMessageCount: z.number().int().nonnegative().optional(),
  chatMessagesData: z.array(chatMessageDataForAiSchema).optional(),
  authorNameByChatMessageIdMap: z.record(z.string(), z.string()).optional(),
  quotedMessageDataByIdMap: z.record(
    z.string(),
    chatMessageDataForAiSchema.pick({
      id: true,
      content: true
    })
  ).optional(),
  mentionedObjectTitleByIdMap: mentionedObjectTitleByIdMapSchema
});
var chatMessagesElementWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("chatMessagesElement"),
  chatMessagesElementData: z.object({
    id: z.string().uuid(),
    color: objectColorSchema
  }),
  chatMessageCount: z.number().int().nonnegative().optional()
});
var mediaElementDataBaseSchema = z.object({
  id: z.string().uuid(),
  type: mediaCardTypeSchema,
  color: objectColorSchema
});
var videoElementContentDataSchema = z.object({
  objectType: z.literal("videoElement"),
  mediaElementData: mediaElementDataBaseSchema.extend({
    link: z.string().nullable()
  }),
  transcript: z.custom().nullable().optional()
}).refine((data) => data.mediaElementData.type === "video", {
  message: 'videoElement requires mediaElementData.type "video"'
});
var videoElementWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("videoElement"),
  mediaElementData: mediaElementDataBaseSchema
}).refine((data) => data.mediaElementData.type === "video", {
  message: 'videoElement requires mediaElementData.type "video"'
});
var audioElementContentDataSchema = z.object({
  objectType: z.literal("audioElement"),
  mediaElementData: mediaElementDataBaseSchema
}).refine((data) => data.mediaElementData.type === "audio", {
  message: 'audioElement requires mediaElementData.type "audio"'
});
var imageElementContentDataSchema = z.object({
  objectType: z.literal("imageElement"),
  mediaElementData: mediaElementDataBaseSchema.extend({
    fileId: z.string().uuid().nullable()
  })
}).refine((data) => data.mediaElementData.type === "image", {
  message: 'imageElement requires mediaElementData.type "image"'
});
var imageElementWhiteboardObjectListItemDataSchema = z.object({
  objectType: z.literal("imageElement"),
  mediaElementData: mediaElementDataBaseSchema
}).refine((data) => data.mediaElementData.type === "image", {
  message: 'imageElement requires mediaElementData.type "image"'
});
var connectionListItemDataSchema = z.object({
  objectType: z.literal("connection"),
  connectionData: z.object({
    id: z.string(),
    description: z.string().transform(limitTo65535),
    color: objectColorSchema,
    beginId: z.string(),
    endId: z.string(),
    beginStyle: connectedStyleSchema,
    endStyle: connectedStyleSchema
  }),
  beginObjectId: cardIdSchema2.nullable().default(null),
  endObjectId: cardIdSchema2.nullable().default(null)
});
var goalOverviewContentDataSchema = z.object({
  objectType: z.literal("goalOverview"),
  goalData: z.object({
    id: z.string().uuid(),
    title: z.string()
  }),
  goalOverviewData: goalOverviewDataSchema.pick({
    id: true,
    goalId: true,
    content: true
  }),
  mentionedObjectTitleByIdMap: mentionedObjectTitleByIdMapSchema
});
var tagListItemDataSchema = z.object({
  objectType: z.literal("tag"),
  tagData: z.object({
    id: z.string(),
    name: z.string().min(1).transform(limitTo255)
  })
});
var readObjectMainObjectDataSchema = z.union([
  cardContentDataSchema,
  pdfCardOutlineDataSchema,
  videoCardContentDataSchema,
  audioCardContentDataSchema,
  imageCardContentDataSchema,
  journalContentDataSchema,
  goalOverviewContentDataSchema,
  sectionListItemDataSchema,
  textElementContentDataSchema,
  mindMapContentDataSchema,
  chatMessagesElementContentDataSchema,
  webCardContentDataSchema,
  chatContentDataSchema,
  highlightElementContentDataSchema,
  videoElementContentDataSchema,
  audioElementContentDataSchema,
  imageElementContentDataSchema
]);
var readObjectRelatedObjectDataSchema = z.union([
  cardWhiteboardObjectListItemDataSchema,
  pdfCardWhiteboardObjectListItemDataSchema,
  videoCardWhiteboardObjectListItemDataSchema,
  audioCardWhiteboardObjectListItemDataSchema,
  imageCardWhiteboardObjectListItemDataSchema,
  journalWhiteboardObjectListItemDataSchema,
  sectionListItemDataSchema,
  textElementWhiteboardObjectListItemDataSchema,
  mindMapWhiteboardObjectListItemDataSchema,
  chatMessagesElementWhiteboardObjectListItemDataSchema,
  webCardWhiteboardObjectListItemDataSchema,
  chatWhiteboardObjectListItemDataSchema,
  highlightElementWhiteboardObjectListItemDataSchema,
  videoElementWhiteboardObjectListItemDataSchema,
  audioElementContentDataSchema,
  imageElementWhiteboardObjectListItemDataSchema,
  whiteboardWhiteboardObjectListItemDataSchema,
  connectionListItemDataSchema
]);
var sectionObjectRelationDataSchema = z.object({
  relationType: z.literal("sectionObjectRelation"),
  sectionObjectRelationData: z.object({
    sectionId: z.string(),
    objectType: z.enum([
      "cardInstance",
      "journalInstance",
      "pdfCardInstance",
      "highlightElementInstance",
      "textElement",
      "whiteboardInstance",
      "section",
      "mindMapInstance",
      "imageElement",
      "videoElement",
      "audioElement",
      "imageCardInstance",
      "videoCardInstance",
      "audioCardInstance",
      "webElement",
      "insightInstance",
      "chatInstance",
      "chatMessagesElement",
      "webCardInstance"
    ]),
    objectId: z.string()
  })
});
var readObjectRelationDataSchema = sectionObjectRelationDataSchema;
var readObjectFetchDataResultSchema = z.union([
  z.object({
    mainObject: readObjectMainObjectDataSchema,
    objects: z.array(readObjectRelatedObjectDataSchema).optional(),
    relations: z.array(readObjectRelationDataSchema).optional()
  }),
  z.object({ status: z.literal("notFound") })
]);
var readWhiteboardToolModeSchema = z.enum(["structure", "content"]);
var readWhiteboardStructureObjectDataSchema = z.union([
  cardWhiteboardObjectListItemDataSchema,
  pdfCardWhiteboardObjectListItemDataSchema,
  videoCardWhiteboardObjectListItemDataSchema,
  audioCardWhiteboardObjectListItemDataSchema,
  imageCardWhiteboardObjectListItemDataSchema,
  webCardWhiteboardObjectListItemDataSchema,
  videoElementWhiteboardObjectListItemDataSchema,
  audioElementContentDataSchema,
  imageElementWhiteboardObjectListItemDataSchema,
  journalWhiteboardObjectListItemDataSchema,
  whiteboardWhiteboardObjectListItemDataSchema,
  sectionListItemDataSchema,
  textElementWhiteboardObjectListItemDataSchema,
  mindMapWhiteboardObjectListItemDataSchema,
  chatMessagesElementWhiteboardObjectListItemDataSchema,
  chatWhiteboardObjectListItemDataSchema,
  highlightElementWhiteboardObjectListItemDataSchema,
  connectionListItemDataSchema
]);
var readWhiteboardContentObjectDataSchema = z.union([
  cardWhiteboardObjectContentDataSchema,
  pdfCardWhiteboardObjectContentDataSchema,
  videoCardWhiteboardObjectContentDataSchema,
  audioCardWhiteboardObjectContentDataSchema,
  imageCardWhiteboardObjectContentDataSchema,
  webCardWhiteboardObjectContentDataSchema,
  videoElementContentDataSchema,
  audioElementContentDataSchema,
  imageElementContentDataSchema,
  journalWhiteboardObjectContentDataSchema,
  textElementContentDataSchema,
  mindMapWhiteboardObjectContentDataSchema,
  chatMessagesElementContentDataSchema,
  chatWhiteboardObjectContentDataSchema,
  highlightElementWhiteboardObjectContentDataSchema,
  whiteboardWhiteboardObjectListItemDataSchema,
  sectionListItemDataSchema,
  connectionListItemDataSchema
]);
var rawReadWhiteboardObjectDataSchema = z.object({
  objectType: z.enum(aiContentObjectTypes)
}).passthrough();
var readJournalRangeFetchDataResultSchema = z.object({
  journals: z.array(journalContentDataSchema)
});
var searchByKeywordObjectDataSchema = z.union([
  cardContentDataSchema,
  pdfCardParsedContentDataSchema,
  videoCardContentDataSchema,
  audioCardContentDataSchema,
  imageCardListItemDataSchema,
  webCardContentDataSchema,
  journalContentDataSchema,
  highlightElementContentDataSchema,
  whiteboardContentDataSchema,
  sectionListItemDataSchema,
  textElementContentDataSchema,
  mindMapContentDataSchema,
  tagListItemDataSchema
]);
var searchBySemanticObjectDataSchema = z.union([
  cardContentDataSchema,
  journalContentDataSchema,
  pdfCardParsedContentDataSchema,
  videoCardContentDataSchema,
  audioCardContentDataSchema,
  imageCardListItemDataSchema,
  webCardContentDataSchema,
  highlightElementContentDataSchema
]);
var databasePropertyOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: objectColorSchema
});
var basicDatabasePropertySchema = z.object({
  type: z.enum([
    "title",
    "text",
    "number",
    "date",
    "checkbox",
    "url",
    "phone",
    "email"
  ]),
  name: z.string()
});
var optionDatabasePropertySchema = z.object({
  type: z.enum(["select", "multiSelect"]),
  name: z.string(),
  options: z.array(databasePropertyOptionSchema)
});
var relationDatabasePropertySchema = z.object({
  type: z.literal("relation"),
  name: z.string(),
  tagId: z.string().nullable()
});
var databasePropertySchema = z.union([
  basicDatabasePropertySchema,
  optionDatabasePropertySchema,
  relationDatabasePropertySchema
]);
var databaseFilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null()
]);
var databaseFilterSchema = z.object({
  combinator: z.enum(["and", "or"]),
  rules: z.array(
    z.object({
      field: z.string(),
      operator: z.string(),
      value: databaseFilterValueSchema
    })
  )
});
var databaseSortSchema = z.object({
  field: z.string(),
  direction: z.enum(["ascending", "descending"])
});
var baseDatabaseViewSchema = z.object({
  name: z.string(),
  filter: databaseFilterSchema.nullable(),
  sorts: z.array(databaseSortSchema)
});
var databaseViewSchema = z.union([
  baseDatabaseViewSchema.extend({
    type: z.literal("table")
  }),
  baseDatabaseViewSchema.extend({
    type: z.literal("kanban"),
    groupByPropertyId: z.string()
  })
]);
var databaseConfigurationSchema = z.object({
  name: z.string(),
  views: z.record(databaseViewSchema),
  schema: z.record(databasePropertySchema)
});

// ../common/src/version-history/checkIsSnapshotStale.ts
var import_dayjs2 = __toESM(require_dayjs_min(), 1);

// ../common/src/utils/stringSlicingUtils.ts
function toGraphemeArray(string) {
  return [...string];
}
var sliceStringFromGraphemeArray = (graphemeArray, start, end) => {
  return graphemeArray.slice(start, end).join("");
};

// ../common/src/file/getFileExtension.ts
function getFileExtension(filename) {
  const filenameGraphemeArray = toGraphemeArray(filename);
  const periodIndex = filenameGraphemeArray.lastIndexOf(".");
  if (periodIndex === -1) return;
  return sliceStringFromGraphemeArray(filenameGraphemeArray, periodIndex + 1);
}

// ../common/src/file/FileKindSpec.ts
var FileKindSpec = class _FileKindSpec {
  kind;
  mimeTypes;
  extensions;
  matchMimeType;
  constructor({
    kind,
    mimeTypes,
    extensions,
    matchMimeType
  }) {
    this.kind = kind;
    this.mimeTypes = mimeTypes ?? [];
    this.extensions = extensions ?? [];
    this.matchMimeType = matchMimeType ?? this.#createDefaultMatchMimeType();
  }
  #createDefaultMatchMimeType() {
    return (mimeType) => {
      const normalizedMimeType = _FileKindSpec.normalizeMimeType(mimeType);
      return this.mimeTypes.some((specMimeType) => {
        if (specMimeType.endsWith("/*")) {
          return normalizedMimeType.startsWith(specMimeType.slice(0, -1));
        }
        return normalizedMimeType === specMimeType;
      });
    };
  }
  matchExtension(extension) {
    return this.extensions.includes(extension.trim().toLowerCase());
  }
  matchName(filename) {
    const fileExtension = getFileExtension(filename);
    return fileExtension != null && this.matchExtension(fileExtension);
  }
  static normalizeMimeType(mimeType) {
    return mimeType.trim().toLowerCase();
  }
};

// ../common/src/file/FileKindSpecMap.ts
var FileKindSpecMap = class {
  static pdf = new FileKindSpec({
    kind: "pdf",
    mimeTypes: ["application/pdf"],
    extensions: ["pdf"]
  });
  static md = new FileKindSpec({
    kind: "md",
    mimeTypes: ["text/markdown", "text/x-markdown"],
    extensions: ["md", "markdown"]
  });
  static txt = new FileKindSpec({
    kind: "txt",
    mimeTypes: ["text/plain"],
    extensions: ["txt"]
  });
  static docx = new FileKindSpec({
    kind: "docx",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ],
    extensions: ["docx"]
  });
  static json = new FileKindSpec({
    kind: "json",
    mimeTypes: ["application/json"],
    extensions: ["json"]
  });
  static image = new FileKindSpec({
    kind: "image",
    mimeTypes: ["image/*"],
    matchMimeType: (mimeType) => {
      const normalizedMimeType = FileKindSpec.normalizeMimeType(mimeType);
      return normalizedMimeType.startsWith("image/") && // tiff and heic files cannot be rendered by <img> tag, so we treat them as file.
      normalizedMimeType !== "image/tiff" && normalizedMimeType !== "image/heic";
    }
  });
  static video = new FileKindSpec({
    kind: "video",
    mimeTypes: ["video/*"]
  });
  static audio = new FileKindSpec({
    kind: "audio",
    mimeTypes: ["audio/*"]
  });
  /**
   * A fallback catch-all kind for any mime type not matched by more specific FileKindSpec entries.
   */
  static file = new FileKindSpec({
    kind: "file",
    matchMimeType: () => true
  });
};

// ../../node_modules/ts-extras/distribution/object-keys.js
var objectKeys = Object.keys;

// ../../node_modules/idb/build/wrap-idb-value.js
var instanceOfAny = (object, constructors) => constructors.some((c) => object instanceof c);
var idbProxyableTypes;
var cursorAdvanceMethods;
function getIdbProxyableTypes() {
  return idbProxyableTypes || (idbProxyableTypes = [
    IDBDatabase,
    IDBObjectStore,
    IDBIndex,
    IDBCursor,
    IDBTransaction
  ]);
}
function getCursorAdvanceMethods() {
  return cursorAdvanceMethods || (cursorAdvanceMethods = [
    IDBCursor.prototype.advance,
    IDBCursor.prototype.continue,
    IDBCursor.prototype.continuePrimaryKey
  ]);
}
var cursorRequestMap = /* @__PURE__ */ new WeakMap();
var transactionDoneMap = /* @__PURE__ */ new WeakMap();
var transactionStoreNamesMap = /* @__PURE__ */ new WeakMap();
var transformCache = /* @__PURE__ */ new WeakMap();
var reverseTransformCache = /* @__PURE__ */ new WeakMap();
function promisifyRequest(request2) {
  const promise = new Promise((resolve3, reject) => {
    const unlisten = () => {
      request2.removeEventListener("success", success);
      request2.removeEventListener("error", error);
    };
    const success = () => {
      resolve3(wrap(request2.result));
      unlisten();
    };
    const error = () => {
      reject(request2.error);
      unlisten();
    };
    request2.addEventListener("success", success);
    request2.addEventListener("error", error);
  });
  promise.then((value) => {
    if (value instanceof IDBCursor) {
      cursorRequestMap.set(value, request2);
    }
  }).catch(() => {
  });
  reverseTransformCache.set(promise, request2);
  return promise;
}
function cacheDonePromiseForTransaction(tx) {
  if (transactionDoneMap.has(tx))
    return;
  const done = new Promise((resolve3, reject) => {
    const unlisten = () => {
      tx.removeEventListener("complete", complete);
      tx.removeEventListener("error", error);
      tx.removeEventListener("abort", error);
    };
    const complete = () => {
      resolve3();
      unlisten();
    };
    const error = () => {
      reject(tx.error || new DOMException("AbortError", "AbortError"));
      unlisten();
    };
    tx.addEventListener("complete", complete);
    tx.addEventListener("error", error);
    tx.addEventListener("abort", error);
  });
  transactionDoneMap.set(tx, done);
}
var idbProxyTraps = {
  get(target, prop, receiver) {
    if (target instanceof IDBTransaction) {
      if (prop === "done")
        return transactionDoneMap.get(target);
      if (prop === "objectStoreNames") {
        return target.objectStoreNames || transactionStoreNamesMap.get(target);
      }
      if (prop === "store") {
        return receiver.objectStoreNames[1] ? void 0 : receiver.objectStore(receiver.objectStoreNames[0]);
      }
    }
    return wrap(target[prop]);
  },
  set(target, prop, value) {
    target[prop] = value;
    return true;
  },
  has(target, prop) {
    if (target instanceof IDBTransaction && (prop === "done" || prop === "store")) {
      return true;
    }
    return prop in target;
  }
};
function replaceTraps(callback) {
  idbProxyTraps = callback(idbProxyTraps);
}
function wrapFunction(func) {
  if (func === IDBDatabase.prototype.transaction && !("objectStoreNames" in IDBTransaction.prototype)) {
    return function(storeNames, ...args) {
      const tx = func.call(unwrap(this), storeNames, ...args);
      transactionStoreNamesMap.set(tx, storeNames.sort ? storeNames.sort() : [storeNames]);
      return wrap(tx);
    };
  }
  if (getCursorAdvanceMethods().includes(func)) {
    return function(...args) {
      func.apply(unwrap(this), args);
      return wrap(cursorRequestMap.get(this));
    };
  }
  return function(...args) {
    return wrap(func.apply(unwrap(this), args));
  };
}
function transformCachableValue(value) {
  if (typeof value === "function")
    return wrapFunction(value);
  if (value instanceof IDBTransaction)
    cacheDonePromiseForTransaction(value);
  if (instanceOfAny(value, getIdbProxyableTypes()))
    return new Proxy(value, idbProxyTraps);
  return value;
}
function wrap(value) {
  if (value instanceof IDBRequest)
    return promisifyRequest(value);
  if (transformCache.has(value))
    return transformCache.get(value);
  const newValue = transformCachableValue(value);
  if (newValue !== value) {
    transformCache.set(value, newValue);
    reverseTransformCache.set(newValue, value);
  }
  return newValue;
}
var unwrap = (value) => reverseTransformCache.get(value);

// ../../node_modules/idb/build/index.js
var readMethods = ["get", "getKey", "getAll", "getAllKeys", "count"];
var writeMethods = ["put", "add", "delete", "clear"];
var cachedMethods = /* @__PURE__ */ new Map();
function getMethod(target, prop) {
  if (!(target instanceof IDBDatabase && !(prop in target) && typeof prop === "string")) {
    return;
  }
  if (cachedMethods.get(prop))
    return cachedMethods.get(prop);
  const targetFuncName = prop.replace(/FromIndex$/, "");
  const useIndex = prop !== targetFuncName;
  const isWrite = writeMethods.includes(targetFuncName);
  if (
    // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
    !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) || !(isWrite || readMethods.includes(targetFuncName))
  ) {
    return;
  }
  const method = async function(storeName, ...args) {
    const tx = this.transaction(storeName, isWrite ? "readwrite" : "readonly");
    let target2 = tx.store;
    if (useIndex)
      target2 = target2.index(args.shift());
    return (await Promise.all([
      target2[targetFuncName](...args),
      isWrite && tx.done
    ]))[0];
  };
  cachedMethods.set(prop, method);
  return method;
}
replaceTraps((oldTraps) => ({
  ...oldTraps,
  get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
  has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop)
}));

// ../common/src/utils/sleep.ts
async function sleep(ms) {
  await new Promise((resolve3) => {
    setTimeout(() => {
      resolve3();
    }, ms);
  });
}

// ../common/src/utils/spaceSyncDataSchema.ts
var spaceSyncDataSchema = z.object({
  spaceId: z.string().uuid(),
  timestamp: z.string(),
  seq: z.number().int().min(0)
});

// ../common/src/editor/list-item/bullet-list-item/bulletListItemAttrsSchema.ts
var bulletListItemAttrsSchema = z.object({
  id: blockNodeIdSchema,
  folded: z.boolean(),
  format: bulletListItemFormatSchema
});

// ../common/src/editor/list-item/numbered-list-item/numberedListItemAttrsSchema.ts
var numberedListItemOrderSchema = z.number().int().nonnegative().nullable();
var numberedListItemAttrsSchema = z.object({
  id: blockNodeIdSchema,
  order: numberedListItemOrderSchema,
  format: numberedListItemFormatSchema
});

// ../common/src/editor/list-item/todo-list-item/todoListItemAttrsSchema.ts
var todoListItemAttrsSchema = z.object({
  id: blockNodeIdSchema,
  checked: z.boolean(),
  dueDate: z.string().date().nullable(),
  lastCheckedTime: z.string().datetime().nullable(),
  lastUpdatedTime: z.string().datetime()
});

// ../common/src/editor/list-item/toggle-list-item/toggleListItemAttrsSchema.ts
var toggleListItemAttrsSchema = z.object({
  id: blockNodeIdSchema,
  folded: z.boolean()
});

// ../common/src/editor/list-item/listItemNodeSpecMap.ts
function convertDataAttributeToNullableNumber({
  value,
  schema
}) {
  if (value == null || value.trim() === "") {
    return null;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return null;
  }
  return schema.safeParse(numberValue).success ? numberValue : null;
}
var listItemNodeSpecMap = {
  toggle_list_item: {
    content: "(heading | paragraph) block*",
    group: "block",
    attrs: {
      id: {
        default: null,
        validate: (value) => toggleListItemAttrsSchema.shape.id.parse(value)
      },
      folded: {
        default: false,
        validate: (value) => toggleListItemAttrsSchema.shape.folded.parse(value)
      }
    },
    parseDOM: [
      {
        priority: 100,
        tag: `ul > li[${nodeHtmlData.type}='toggle_list_item']`,
        getAttrs(dom) {
          const { folded } = dom.dataset;
          return {
            folded: folded === "true"
          };
        }
      }
    ],
    toDOM(node) {
      const attrs = node.attrs;
      const domAttrs = {
        ...getNodeHtmlDataset(node),
        "data-folded": attrs.folded
      };
      return ["ul", ["li", domAttrs, 0]];
    }
  },
  bullet_list_item: {
    content: "paragraph block*",
    group: "block",
    defining: true,
    attrs: {
      id: {
        default: null,
        validate: (value) => bulletListItemAttrsSchema.shape.id.parse(value)
      },
      folded: {
        default: false,
        validate: (value) => bulletListItemAttrsSchema.shape.folded.parse(value)
      },
      format: {
        default: null,
        validate: (value) => bulletListItemAttrsSchema.shape.format.parse(value)
      }
    },
    parseDOM: [
      {
        tag: `ul > li[${nodeHtmlData.type}='bullet_list_item']`,
        getAttrs(dom) {
          const { folded, format } = dom.dataset;
          return {
            folded: folded === "true",
            format: convertDataAttributeToNullableNumber({
              value: format,
              schema: bulletListItemAttrsSchema.shape.format
            })
          };
        }
      },
      {
        tag: "ul > li",
        getAttrs() {
          return {
            folded: false,
            format: null
          };
        }
      }
    ],
    toDOM(node) {
      const attrs = node.attrs;
      const domAttrs = {
        ...getNodeHtmlDataset(node),
        "data-folded": attrs.folded,
        ...attrs.format != null && { "data-format": attrs.format }
      };
      return ["ul", ["li", domAttrs, 0]];
    }
  },
  numbered_list_item: {
    content: "paragraph block*",
    group: "block",
    defining: true,
    attrs: {
      id: {
        default: null,
        validate: (value) => numberedListItemAttrsSchema.shape.id.parse(value)
      },
      order: {
        default: null,
        validate: (value) => numberedListItemAttrsSchema.shape.order.parse(value)
      },
      format: {
        default: null,
        validate: (value) => numberedListItemAttrsSchema.shape.format.parse(value)
      }
    },
    parseDOM: [
      {
        tag: `ol > li[${nodeHtmlData.type}='numbered_list_item']`,
        getAttrs(dom) {
          const { order, format } = dom.dataset;
          return {
            order: convertDataAttributeToNullableNumber({
              value: order,
              schema: numberedListItemAttrsSchema.shape.order
            }),
            format: convertDataAttributeToNullableNumber({
              value: format,
              schema: numberedListItemAttrsSchema.shape.format
            })
          };
        }
      },
      {
        tag: "ol > li",
        getAttrs() {
          return {
            order: null,
            format: null
          };
        }
      }
    ],
    toDOM(node) {
      const attrs = node.attrs;
      const domAttrs = {
        ...getNodeHtmlDataset(node),
        ...attrs.order != null && { "data-order": attrs.order },
        ...attrs.format != null && { "data-format": attrs.format }
      };
      return ["ol", ["li", domAttrs, 0]];
    }
  },
  todo_list_item: {
    content: "paragraph block*",
    group: "block",
    defining: true,
    attrs: {
      id: {
        default: null,
        validate: (value) => todoListItemAttrsSchema.shape.id.parse(value)
      },
      checked: {
        default: false,
        validate: (value) => todoListItemAttrsSchema.shape.checked.parse(value)
      },
      dueDate: {
        default: null,
        validate: (value) => todoListItemAttrsSchema.shape.dueDate.parse(value)
      },
      lastCheckedTime: {
        default: null,
        validate: (value) => todoListItemAttrsSchema.shape.lastCheckedTime.parse(value)
      },
      lastUpdatedTime: {
        default: getDateTime(),
        validate: (value) => todoListItemAttrsSchema.shape.lastUpdatedTime.parse(value)
      }
    },
    parseDOM: [
      {
        priority: 100,
        tag: `ul > li[${nodeHtmlData.type}='todo_list_item']`,
        getAttrs(dom) {
          const { checked, dueDate } = dom.dataset;
          const dueDateParseResult = todoListItemAttrsSchema.shape.dueDate.safeParse(dueDate ?? null);
          return {
            checked: checked === "true",
            dueDate: dueDateParseResult.success ? dueDateParseResult.data : null
          };
        }
      },
      {
        priority: 1e3,
        tag: "ul > li",
        getAttrs(dom) {
          if (dom.firstChild?.nodeType !== document.TEXT_NODE) {
            return false;
          }
          const content = dom.firstChild.textContent;
          if (content == null) {
            return false;
          }
          const regexp = /^\[([ |x|X])\]/;
          const matches = content.match(regexp);
          if (matches?.[1] == null) {
            return false;
          }
          dom.firstChild.textContent = content.replace(regexp, "");
          return {
            checked: matches[1].toLowerCase() === "x"
          };
        }
      }
    ],
    toDOM(node) {
      const attrs = node.attrs;
      const domAttrs = {
        ...getNodeHtmlDataset(node),
        "data-checked": attrs.checked,
        ...attrs.dueDate != null && { "data-due-date": attrs.dueDate },
        ...attrs.lastCheckedTime != null && {
          "data-last-checked-time": attrs.lastCheckedTime
        },
        "data-last-updated-time": attrs.lastUpdatedTime
      };
      return ["ul", ["li", domAttrs, 0]];
    }
  }
};
var listItemNodeNames = objectKeys(listItemNodeSpecMap);

// ../common/src/editor/inline-mention/getInlineMentionNodeSourceId.ts
var inlineMentionNodeSourceIdAttrKeyMap = Object.freeze({
  date: "date",
  whiteboard: "whiteboardId",
  card: "cardId",
  pdf_card: "pdfCardId",
  section: "sectionId",
  tag: "tagId",
  highlight_element: "highlightElementId",
  image_card: "cardId",
  video_card: "cardId",
  audio_card: "cardId",
  web_card: "webCardId",
  chat: "chatId",
  people: "accountId"
});

// ../common/src/editor/inline-mention/inlineMentionAttrsSchemas.ts
var dateAttrsSchema = z.object({
  date: z.string().date()
});
var whiteboardAttrsSchema = z.object({
  whiteboardId: z.string().uuid()
});
var cardAttrsSchema = z.object({
  cardId: z.string().uuid()
});
var pdfCardAttrsSchema = z.object({
  pdfCardId: z.string().uuid()
});
var sectionAttrsSchema = z.object({
  sectionId: z.string().uuid()
});
var tagAttrsSchema = z.object({
  tagId: z.string().uuid()
});
var highlightElementAttrsSchema = z.object({
  highlightElementId: z.string().uuid()
});
var webCardAttrsSchema = z.object({
  webCardId: z.string().uuid()
});
var chatAttrsSchema = z.object({
  chatId: z.string().uuid(),
  chatMessageId: z.string().uuid().nullable(),
  quotedChatMessageId: z.string().uuid().nullable()
});
var peopleAttrsSchema = z.object({
  accountId: z.string().uuid()
});
var webAttrsSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable()
});

// ../common/src/editor/inline-mention/inlineMentionNodeNameSchema.ts
var inlineMentionNodeNameSchema = z.enum([
  "date",
  "whiteboard",
  "card",
  "pdf_card",
  "section",
  "tag",
  "highlight_element",
  "image_card",
  "video_card",
  "audio_card",
  "web_card",
  "chat",
  "people"
]);
var inlineMentionNodeNames = Object.freeze(
  inlineMentionNodeNameSchema.options
);

// ../common/src/editor/bookmark/bookmarkAttrsSchema.ts
var bookmarkAttrsSchema = z.object({
  id: blockNodeIdSchema,
  url: z.string().url(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  thumbnailUrl: nullableUrlStringSchema,
  faviconUrl: nullableUrlStringSchema,
  siteName: z.string().nullable(),
  lastUpdatedTime: z.string().datetime().nullable()
});

// ../../node_modules/ts-tiny-invariant/dist/index.js
var isProduction = process.env.NODE_ENV === "production";

// ../common/src/link/matchHeptaLink.ts
var pdfBoundingBoxSchema2 = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive()
});

// ../common/src/collaboration/types/EditLock.ts
var editLockObjectTypeSchema = z.enum([
  "card",
  "highlightElement",
  "insight",
  "textElement"
]);
var editLockObjectTypes = editLockObjectTypeSchema.options;

// ../common/src/card/dbCardTypeSchema.ts
var dbCardTypeSchema = z.enum([
  "card",
  "pdfCard",
  "journal",
  "highlightElement",
  "videoCard",
  "imageCard",
  "audioCard"
]);
var dbCardTypes = Object.freeze(dbCardTypeSchema.options);

// ../common/src/card/cardTypeAiSuggestionExpectedSchema.ts
var cardTypeAiSuggestionExpectedSchema = cardTypeSchema.exclude([
  "source",
  "web"
]);

// ../common/src/card/cardTypeContextItemExpectedSchema.ts
var cardTypeContextItemExpectedSchema = cardTypeSchema.exclude([
  "source"
]);

// ../common/src/card/cardTypeEditableContentExpectedSchema.ts
var cardTypeEditableContentExpectedSchema = cardTypeSchema.extract([
  "note",
  "journal",
  "highlightElement"
]);

// ../common/src/card/cardTypeEmbedExpectedSchema.ts
var cardTypeEmbedExpectedSchema = cardTypeSchema.exclude([
  "pdf",
  "source",
  "web"
]);

// ../common/src/card/cardTypeExportExpectedSchema.ts
var cardTypeExportExpectedSchema = cardTypeSchema.exclude([
  "source",
  "web"
]);

// ../common/src/card/cardTypeFileUploadedFromEditorExpectedSchema.ts
var cardTypeFileUploadedFromEditorExpectedSchema = cardTypeSchema.extract(["pdf", "image", "video", "audio"]);

// ../common/src/card/cardTypeLinkIndexExpectedSchema.ts
var cardTypeLinkIndexExpectedSchema = cardTypeSchema.exclude([
  "source"
]);

// ../common/src/card/cardTypeMentionExpectedSchema.ts
var cardTypeMentionExpectedSchema = cardTypeSchema.exclude(["source"]);

// ../common/src/card/cardTypeMobileExpectedSchema.ts
var cardTypeMobileExpectedSchema = cardTypeSchema.exclude([
  "source",
  "web"
]);

// ../common/src/card/cardTypeWhiteboardExpectedSchema.ts
var cardTypeWhiteboardExpectedSchema = cardTypeSchema.exclude([
  "source"
]);

// ../common/src/task/checkIsDueDateOverdue.ts
var import_dayjs3 = __toESM(require_dayjs_min(), 1);

// ../common/src/task/todoItemSchema.ts
var todoItemSchema = z.object({
  sourceId: z.string(),
  sourceType: z.enum(["journal", "card", "highlightElement", "textElement"]),
  blockId: z.string(),
  dueDate: z.string().nullable().optional(),
  content: z.string(),
  checked: z.boolean(),
  lastCheckedTime: z.string().nullable().optional(),
  /**
   * Please note that this value will only be updated if the todo item is edited in the Task App or Task Panel, as it is currently quite tricky to update it in the editor.
   * It is used to sort the todo items, but right it is unused
   */
  lastUpdatedTime: z.string().nullable().optional(),
  /**
   * This is used to sort the to-do items. Since we currently do not have a block database, we cannot obtain the exact created time of the block; instead, we use the document's created time.
   * For the journal, it will use the journal date as the created time.
   */
  createdTime: z.string()
});

// ../common/src/utils/emailSchema.ts
var emailSchema = z.string().email().toLowerCase();

// ../common/src/onboarding/sourcePreference.ts
var sourcePreferenceSchema = z.enum([
  "academic papers",
  "textbooks and courses",
  "web articles and books",
  "projects and reports"
]);
var sourcePreferences = sourcePreferenceSchema.options;
var sourcePreferenceInfoMap = Object.freeze({
  "academic papers": {
    title: "Academic Papers"
  },
  "textbooks and courses": {
    title: "Textbooks & Courses"
  },
  "web articles and books": {
    title: "Web Articles & Books"
  },
  "projects and reports": {
    title: "Projects & Reports"
  }
});

// ../common/src/system-collection/systemCollectionsConfig.ts
function getSourceItemTypeConfig(itemType) {
  return { cardType: "source", itemType };
}
var zoteroItemTypeCollections = Object.freeze([
  {
    name: "artwork",
    displayName: "Artwork",
    queryConfig: getSourceItemTypeConfig("artwork"),
    propertyNames: [
      "artworkMedium",
      "artworkSize",
      "date",
      "eventPlace",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "audioRecording",
    displayName: "Audio Recording",
    queryConfig: getSourceItemTypeConfig("audioRecording"),
    propertyNames: [
      "audioRecordingFormat",
      "seriesTitle",
      "volume",
      "numberOfVolumes",
      "label",
      "place",
      "date",
      "runningTime",
      "ISBN",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "bill",
    displayName: "Bill",
    queryConfig: getSourceItemTypeConfig("bill"),
    propertyNames: [
      "billNumber",
      "code",
      "codeVolume",
      "section",
      "codePages",
      "legislativeBody",
      "session",
      "history",
      "date",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "shortTitle",
      "language",
      "rights",
      "extra"
    ]
  },
  {
    name: "blogPost",
    displayName: "Blog Post",
    queryConfig: getSourceItemTypeConfig("blogPost"),
    propertyNames: [
      "blogTitle",
      "websiteType",
      "date",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "ISSN",
      "shortTitle",
      "language",
      "rights",
      "extra"
    ]
  },
  {
    name: "book",
    displayName: "Book",
    queryConfig: getSourceItemTypeConfig("book"),
    propertyNames: [
      "series",
      "seriesNumber",
      "volume",
      "numberOfVolumes",
      "edition",
      "date",
      "publisher",
      "place",
      "originalDate",
      "originalPublisher",
      "originalPlace",
      "format",
      "numPages",
      "ISBN",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "ISSN",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "bookSection",
    displayName: "Book Section",
    queryConfig: getSourceItemTypeConfig("bookSection"),
    propertyNames: [
      "bookTitle",
      "series",
      "seriesNumber",
      "volume",
      "numberOfVolumes",
      "edition",
      "date",
      "publisher",
      "place",
      "originalDate",
      "originalPublisher",
      "originalPlace",
      "format",
      "pages",
      "ISBN",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "ISSN",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "case",
    displayName: "Case",
    queryConfig: getSourceItemTypeConfig("case"),
    propertyNames: [
      "caseName",
      "court",
      "dateDecided",
      "docketNumber",
      "reporter",
      "reporterVolume",
      "firstPage",
      "history",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "shortTitle",
      "language",
      "rights",
      "extra"
    ]
  },
  {
    name: "computerProgram",
    displayName: "Software",
    queryConfig: getSourceItemTypeConfig("computerProgram"),
    propertyNames: [
      "seriesTitle",
      "versionNumber",
      "date",
      "system",
      "company",
      "place",
      "programmingLanguage",
      "rights",
      "citationKey",
      "url",
      "accessDate",
      "DOI",
      "ISBN",
      "archive",
      "archiveLocation",
      "libraryCatalog",
      "callNumber",
      "shortTitle",
      "extra"
    ]
  },
  {
    name: "conferencePaper",
    displayName: "Conference Paper",
    queryConfig: getSourceItemTypeConfig("conferencePaper"),
    propertyNames: [
      "proceedingsTitle",
      "conferenceName",
      "publisher",
      "place",
      "date",
      "volume",
      "pages",
      "series",
      "DOI",
      "ISBN",
      "citationKey",
      "url",
      "accessDate",
      "ISSN",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "dataset",
    displayName: "Dataset",
    queryConfig: getSourceItemTypeConfig("dataset"),
    propertyNames: [
      "identifier",
      "type",
      "versionNumber",
      "date",
      "repository",
      "repositoryLocation",
      "format",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "dictionaryEntry",
    displayName: "Dictionary Entry",
    queryConfig: getSourceItemTypeConfig("dictionaryEntry"),
    propertyNames: [
      "dictionaryTitle",
      "series",
      "seriesNumber",
      "volume",
      "numberOfVolumes",
      "edition",
      "date",
      "publisher",
      "place",
      "pages",
      "ISBN",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "document",
    displayName: "Document",
    queryConfig: getSourceItemTypeConfig("document"),
    propertyNames: [
      "type",
      "date",
      "publisher",
      "place",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "email",
    displayName: "E-mail",
    queryConfig: getSourceItemTypeConfig("email"),
    propertyNames: [
      "subject",
      "date",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "shortTitle",
      "language",
      "rights",
      "extra"
    ]
  },
  {
    name: "encyclopediaArticle",
    displayName: "Encyclopedia Article",
    queryConfig: getSourceItemTypeConfig("encyclopediaArticle"),
    propertyNames: [
      "encyclopediaTitle",
      "series",
      "seriesNumber",
      "volume",
      "numberOfVolumes",
      "edition",
      "date",
      "publisher",
      "place",
      "pages",
      "ISBN",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "film",
    displayName: "Film",
    queryConfig: getSourceItemTypeConfig("film"),
    propertyNames: [
      "distributor",
      "place",
      "date",
      "genre",
      "videoRecordingFormat",
      "runningTime",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "forumPost",
    displayName: "Forum Post",
    queryConfig: getSourceItemTypeConfig("forumPost"),
    propertyNames: [
      "forumTitle",
      "postType",
      "date",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "shortTitle",
      "language",
      "rights",
      "extra"
    ]
  },
  {
    name: "hearing",
    displayName: "Hearing",
    queryConfig: getSourceItemTypeConfig("hearing"),
    propertyNames: [
      "committee",
      "publisher",
      "numberOfVolumes",
      "documentNumber",
      "pages",
      "legislativeBody",
      "session",
      "history",
      "date",
      "place",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "shortTitle",
      "language",
      "rights",
      "extra"
    ]
  },
  {
    name: "instantMessage",
    displayName: "Instant Message",
    queryConfig: getSourceItemTypeConfig("instantMessage"),
    propertyNames: [
      "date",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "shortTitle",
      "language",
      "rights",
      "extra"
    ]
  },
  {
    name: "interview",
    displayName: "Interview",
    queryConfig: getSourceItemTypeConfig("interview"),
    propertyNames: [
      "interviewMedium",
      "date",
      "publisher",
      "place",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "journalArticle",
    displayName: "Journal Article",
    queryConfig: getSourceItemTypeConfig("journalArticle"),
    propertyNames: [
      "publicationTitle",
      "publisher",
      "place",
      "date",
      "volume",
      "issue",
      "section",
      "partNumber",
      "partTitle",
      "pages",
      "series",
      "seriesTitle",
      "seriesText",
      "journalAbbreviation",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "PMID",
      "PMCID",
      "ISSN",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "letter",
    displayName: "Letter",
    queryConfig: getSourceItemTypeConfig("letter"),
    propertyNames: [
      "letterType",
      "date",
      "eventPlace",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "magazineArticle",
    displayName: "Magazine Article",
    queryConfig: getSourceItemTypeConfig("magazineArticle"),
    propertyNames: [
      "publicationTitle",
      "publisher",
      "place",
      "date",
      "volume",
      "issue",
      "pages",
      "ISSN",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "manuscript",
    displayName: "Manuscript",
    queryConfig: getSourceItemTypeConfig("manuscript"),
    propertyNames: [
      "manuscriptType",
      "institution",
      "place",
      "date",
      "numPages",
      "number",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "map",
    displayName: "Map",
    queryConfig: getSourceItemTypeConfig("map"),
    propertyNames: [
      "mapType",
      "scale",
      "seriesTitle",
      "edition",
      "publisher",
      "place",
      "date",
      "DOI",
      "ISBN",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "newspaperArticle",
    displayName: "Newspaper Article",
    queryConfig: getSourceItemTypeConfig("newspaperArticle"),
    propertyNames: [
      "publicationTitle",
      "publisher",
      "place",
      "date",
      "volume",
      "issue",
      "edition",
      "section",
      "pages",
      "ISSN",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "patent",
    displayName: "Patent",
    queryConfig: getSourceItemTypeConfig("patent"),
    propertyNames: [
      "place",
      "country",
      "assignee",
      "issuingAuthority",
      "patentNumber",
      "filingDate",
      "pages",
      "applicationNumber",
      "priorityNumbers",
      "issueDate",
      "priorityDate",
      "references",
      "legalStatus",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "shortTitle",
      "language",
      "rights",
      "extra"
    ]
  },
  {
    name: "podcast",
    displayName: "Podcast",
    queryConfig: getSourceItemTypeConfig("podcast"),
    propertyNames: [
      "seriesTitle",
      "episodeNumber",
      "audioFileType",
      "date",
      "publisher",
      "place",
      "runningTime",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "shortTitle",
      "language",
      "rights",
      "extra"
    ]
  },
  {
    name: "preprint",
    displayName: "Preprint",
    queryConfig: getSourceItemTypeConfig("preprint"),
    propertyNames: [
      "genre",
      "repository",
      "archiveID",
      "place",
      "date",
      "series",
      "seriesNumber",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "presentation",
    displayName: "Presentation",
    queryConfig: getSourceItemTypeConfig("presentation"),
    propertyNames: [
      "presentationType",
      "date",
      "meetingName",
      "place",
      "series",
      "sessionTitle",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "shortTitle",
      "language",
      "rights",
      "extra"
    ]
  },
  {
    name: "radioBroadcast",
    displayName: "Radio Broadcast",
    queryConfig: getSourceItemTypeConfig("radioBroadcast"),
    propertyNames: [
      "programTitle",
      "episodeNumber",
      "audioRecordingFormat",
      "network",
      "place",
      "date",
      "runningTime",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "report",
    displayName: "Report",
    queryConfig: getSourceItemTypeConfig("report"),
    propertyNames: [
      "reportNumber",
      "reportType",
      "institution",
      "place",
      "date",
      "seriesTitle",
      "seriesNumber",
      "pages",
      "DOI",
      "ISBN",
      "citationKey",
      "url",
      "accessDate",
      "ISSN",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "standard",
    displayName: "Standard",
    queryConfig: getSourceItemTypeConfig("standard"),
    propertyNames: [
      "organization",
      "committee",
      "type",
      "number",
      "versionNumber",
      "status",
      "date",
      "publisher",
      "place",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "numPages",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "statute",
    displayName: "Statute",
    queryConfig: getSourceItemTypeConfig("statute"),
    propertyNames: [
      "nameOfAct",
      "code",
      "codeNumber",
      "publicLawNumber",
      "dateEnacted",
      "pages",
      "section",
      "session",
      "history",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "shortTitle",
      "language",
      "rights",
      "extra"
    ]
  },
  {
    name: "thesis",
    displayName: "Thesis",
    queryConfig: getSourceItemTypeConfig("thesis"),
    propertyNames: [
      "thesisType",
      "university",
      "place",
      "date",
      "series",
      "seriesNumber",
      "numPages",
      "DOI",
      "ISBN",
      "citationKey",
      "url",
      "accessDate",
      "ISSN",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "tvBroadcast",
    displayName: "TV Broadcast",
    queryConfig: getSourceItemTypeConfig("tvBroadcast"),
    propertyNames: [
      "programTitle",
      "episodeNumber",
      "videoRecordingFormat",
      "network",
      "place",
      "date",
      "runningTime",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "videoRecording",
    displayName: "Video Recording",
    queryConfig: getSourceItemTypeConfig("videoRecording"),
    propertyNames: [
      "videoRecordingFormat",
      "seriesTitle",
      "volume",
      "numberOfVolumes",
      "studio",
      "place",
      "date",
      "runningTime",
      "ISBN",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "archive",
      "archiveLocation",
      "shortTitle",
      "language",
      "libraryCatalog",
      "callNumber",
      "rights",
      "extra"
    ]
  },
  {
    name: "webpage",
    displayName: "Web Page",
    queryConfig: getSourceItemTypeConfig("webpage"),
    propertyNames: [
      "websiteTitle",
      "websiteType",
      "date",
      "publisher",
      "place",
      "DOI",
      "citationKey",
      "url",
      "accessDate",
      "shortTitle",
      "language",
      "rights",
      "extra"
    ]
  }
]);
var allSystemCollections = Object.freeze([
  {
    name: "allSourceCards",
    displayName: "All Source Cards",
    queryConfig: { cardType: "source" },
    propertyNames: ["authors", "abstractNote"]
  },
  ...zoteroItemTypeCollections
]);
var systemCollectionMap = new Map(
  allSystemCollections.map((collection) => [collection.name, collection])
);

// ../common/src/system-collection/systemPropertiesConfig.ts
var generalSystemProperties = Object.freeze([
  {
    name: "authors",
    displayName: "Authors",
    type: "creator"
  },
  {
    name: "abstractNote",
    displayName: "Abstract",
    type: "text"
  }
]);
var zoteroFieldSystemProperties = Object.freeze([
  // Note: 'title' is not included here as it's stored in source.title
  // Note: 'abstractNote' is not included here as it's a system property associated with the 'all source cards' system collection
  { name: "accessDate", displayName: "Accessed", type: "date" },
  {
    name: "applicationNumber",
    displayName: "Application Number",
    type: "text"
  },
  { name: "archive", displayName: "Archive", type: "text" },
  { name: "archiveID", displayName: "Archive ID", type: "text" },
  { name: "archiveLocation", displayName: "Loc. in Archive", type: "text" },
  { name: "artworkMedium", displayName: "Medium", type: "text" },
  { name: "artworkSize", displayName: "Artwork Size", type: "text" },
  { name: "assignee", displayName: "Assignee", type: "text" },
  { name: "audioFileType", displayName: "File Type", type: "text" },
  { name: "audioRecordingFormat", displayName: "Format", type: "text" },
  { name: "billNumber", displayName: "Bill Number", type: "text" },
  { name: "blogTitle", displayName: "Blog Title", type: "text" },
  { name: "bookTitle", displayName: "Book Title", type: "text" },
  { name: "callNumber", displayName: "Call Number", type: "text" },
  { name: "caseName", displayName: "Case Name", type: "text" },
  { name: "citationKey", displayName: "Citation Key", type: "text" },
  { name: "code", displayName: "Code", type: "text" },
  { name: "codeNumber", displayName: "Code Number", type: "text" },
  { name: "codePages", displayName: "Code Pages", type: "text" },
  { name: "codeVolume", displayName: "Code Volume", type: "text" },
  { name: "committee", displayName: "Committee", type: "text" },
  { name: "company", displayName: "Company", type: "text" },
  { name: "conferenceName", displayName: "Conference Name", type: "text" },
  { name: "country", displayName: "Country", type: "text" },
  { name: "court", displayName: "Court", type: "text" },
  { name: "date", displayName: "Date", type: "date" },
  { name: "dateDecided", displayName: "Date Decided", type: "date" },
  { name: "dateEnacted", displayName: "Date Enacted", type: "date" },
  { name: "dictionaryTitle", displayName: "Dictionary Title", type: "text" },
  { name: "distributor", displayName: "Distributor", type: "text" },
  { name: "docketNumber", displayName: "Docket Number", type: "text" },
  { name: "documentNumber", displayName: "Document Number", type: "text" },
  { name: "DOI", displayName: "DOI", type: "text" },
  { name: "edition", displayName: "Edition", type: "text" },
  {
    name: "encyclopediaTitle",
    displayName: "Encyclopedia Title",
    type: "text"
  },
  { name: "episodeNumber", displayName: "Episode Number", type: "text" },
  { name: "eventPlace", displayName: "Event Place", type: "text" },
  { name: "extra", displayName: "Extra", type: "text" },
  { name: "filingDate", displayName: "Filing Date", type: "date" },
  { name: "firstPage", displayName: "First Page", type: "text" },
  { name: "format", displayName: "Format", type: "text" },
  { name: "forumTitle", displayName: "Forum/Listserv Title", type: "text" },
  { name: "genre", displayName: "Genre", type: "text" },
  { name: "history", displayName: "History", type: "text" },
  { name: "identifier", displayName: "Identifier", type: "text" },
  { name: "institution", displayName: "Institution", type: "text" },
  { name: "interviewMedium", displayName: "Medium", type: "text" },
  { name: "ISBN", displayName: "ISBN", type: "text" },
  { name: "ISSN", displayName: "ISSN", type: "text" },
  { name: "issue", displayName: "Issue", type: "text" },
  { name: "issueDate", displayName: "Issue Date", type: "date" },
  {
    name: "issuingAuthority",
    displayName: "Issuing Authority",
    type: "text"
  },
  { name: "journalAbbreviation", displayName: "Journal Abbr", type: "text" },
  { name: "label", displayName: "Label", type: "text" },
  { name: "language", displayName: "Language", type: "text" },
  { name: "legalStatus", displayName: "Legal Status", type: "text" },
  { name: "legislativeBody", displayName: "Legislative Body", type: "text" },
  { name: "letterType", displayName: "Type", type: "text" },
  { name: "libraryCatalog", displayName: "Library Catalog", type: "text" },
  { name: "manuscriptType", displayName: "Type", type: "text" },
  { name: "mapType", displayName: "Type", type: "text" },
  { name: "meetingName", displayName: "Meeting Name", type: "text" },
  { name: "nameOfAct", displayName: "Name of Act", type: "text" },
  { name: "network", displayName: "Network", type: "text" },
  { name: "number", displayName: "Number", type: "text" },
  { name: "numberOfVolumes", displayName: "# of Volumes", type: "text" },
  { name: "numPages", displayName: "# of Pages", type: "text" },
  { name: "organization", displayName: "Organization", type: "text" },
  { name: "originalDate", displayName: "Original Date", type: "date" },
  { name: "originalPlace", displayName: "Original Place", type: "text" },
  {
    name: "originalPublisher",
    displayName: "Original Publisher",
    type: "text"
  },
  { name: "pages", displayName: "Pages", type: "text" },
  { name: "partNumber", displayName: "Part Number", type: "text" },
  { name: "partTitle", displayName: "Part Title", type: "text" },
  { name: "patentNumber", displayName: "Patent Number", type: "text" },
  { name: "place", displayName: "Place", type: "text" },
  { name: "PMCID", displayName: "PMCID", type: "text" },
  { name: "PMID", displayName: "PMID", type: "text" },
  { name: "postType", displayName: "Post Type", type: "text" },
  { name: "presentationType", displayName: "Type", type: "text" },
  { name: "priorityDate", displayName: "Priority Date", type: "date" },
  { name: "priorityNumbers", displayName: "Priority Numbers", type: "text" },
  {
    name: "proceedingsTitle",
    displayName: "Proceedings Title",
    type: "text"
  },
  {
    name: "programmingLanguage",
    displayName: "Prog. Language",
    type: "text"
  },
  { name: "programTitle", displayName: "Program Title", type: "text" },
  { name: "publicationTitle", displayName: "Publication", type: "text" },
  { name: "publicLawNumber", displayName: "Public Law Number", type: "text" },
  { name: "publisher", displayName: "Publisher", type: "text" },
  { name: "references", displayName: "References", type: "text" },
  { name: "reporter", displayName: "Reporter", type: "text" },
  { name: "reporterVolume", displayName: "Reporter Volume", type: "text" },
  { name: "reportNumber", displayName: "Report Number", type: "text" },
  { name: "reportType", displayName: "Report Type", type: "text" },
  { name: "repository", displayName: "Repository", type: "text" },
  {
    name: "repositoryLocation",
    displayName: "Repo. Location",
    type: "text"
  },
  { name: "rights", displayName: "License", type: "text" },
  { name: "runningTime", displayName: "Running Time", type: "text" },
  { name: "scale", displayName: "Scale", type: "text" },
  { name: "section", displayName: "Section", type: "text" },
  { name: "series", displayName: "Series", type: "text" },
  { name: "seriesNumber", displayName: "Series Number", type: "text" },
  { name: "seriesText", displayName: "Series Text", type: "text" },
  { name: "seriesTitle", displayName: "Series Title", type: "text" },
  { name: "session", displayName: "Session", type: "text" },
  { name: "sessionTitle", displayName: "Session Title", type: "text" },
  { name: "shortTitle", displayName: "Short Title", type: "text" },
  { name: "status", displayName: "Status", type: "text" },
  { name: "studio", displayName: "Studio", type: "text" },
  { name: "subject", displayName: "Subject", type: "text" },
  { name: "system", displayName: "System", type: "text" },
  { name: "thesisType", displayName: "Type", type: "text" },
  { name: "type", displayName: "Type", type: "text" },
  { name: "university", displayName: "University", type: "text" },
  { name: "url", displayName: "URL", type: "url" },
  { name: "versionNumber", displayName: "Version", type: "text" },
  { name: "videoRecordingFormat", displayName: "Format", type: "text" },
  { name: "volume", displayName: "Volume", type: "text" },
  { name: "websiteTitle", displayName: "Website Title", type: "text" },
  { name: "websiteType", displayName: "Website Type", type: "text" }
]);
var allSystemProperties = Object.freeze([
  ...generalSystemProperties,
  ...zoteroFieldSystemProperties
]);

// src/localClient.ts
var localServerConfigSchema = z.object({
  token: z.string(),
  port: z.number(),
  pid: z.number()
});
var desktopAppNotReadyErrorMessage = 'Heptabase CLI cannot connect to the desktop app. Run "heptabase start" first (or open Heptabase), enable CLI in Settings > AI Features, and retry.';
var packagedTokenFileName = "local-server-token";
var devTokenFileName = "local-server-token-dev";
function getTokenFileName({
  tokenTarget = "auto"
} = {}) {
  if (tokenTarget === "packaged") {
    return packagedTokenFileName;
  }
  const isDevServerTargeted = process.env.HEPTABASE_CLI_DEV === "1";
  return isDevServerTargeted ? devTokenFileName : packagedTokenFileName;
}
function getTokenFilePath({
  tokenTarget = "auto"
} = {}) {
  return (0, import_node_path.join)((0, import_node_os.homedir)(), ".heptabase", getTokenFileName({ tokenTarget }));
}
function isProcessAlive({ pid }) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function parseLocalServerConfig({
  raw
}) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = localServerConfigSchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }
  return result.data;
}
function readTokenFile({
  tokenTarget = "auto"
} = {}) {
  try {
    const raw = (0, import_node_fs.readFileSync)(getTokenFilePath({ tokenTarget }), "utf-8");
    const config = parseLocalServerConfig({ raw });
    if (config == null) {
      return null;
    }
    if (!isProcessAlive({ pid: config.pid })) {
      return null;
    }
    return config;
  } catch {
    return null;
  }
}
async function fetchLocalServerHealth({
  port,
  token
}) {
  const healthUrl = new URL(`http://127.0.0.1:${port}/health`);
  let response;
  try {
    response = await fetch(healthUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: AbortSignal.timeout(1500)
    });
  } catch {
    return false;
  }
  if (!response.ok) {
    return false;
  }
  try {
    const responseBody = await response.json();
    return typeof responseBody === "object" && responseBody !== null && "status" in responseBody && responseBody.status === "ok";
  } catch {
    return false;
  }
}
async function probeLocalServerReady({
  tokenTarget = "auto"
} = {}) {
  const config = readTokenFile({ tokenTarget });
  if (config == null) {
    return false;
  }
  return fetchLocalServerHealth({
    port: config.port,
    token: config.token
  });
}
async function waitUntilLocalServerReady({
  timeoutMs,
  pollIntervalMs,
  tokenTarget = "auto"
}) {
  const timeoutAt = Date.now() + timeoutMs;
  while (Date.now() <= timeoutAt) {
    if (await probeLocalServerReady({ tokenTarget })) {
      return true;
    }
    const shouldWaitForNextPoll = Date.now() + pollIntervalMs <= timeoutAt;
    if (!shouldWaitForNextPoll) {
      break;
    }
    await sleep(pollIntervalMs);
  }
  return probeLocalServerReady({ tokenTarget });
}
function getLocalServerConfig() {
  const config = readTokenFile();
  if (config != null) {
    return config;
  }
  throw new Error(desktopAppNotReadyErrorMessage);
}
async function request({
  method,
  pathname,
  body,
  searchParamMap
}) {
  const { token, port } = getLocalServerConfig();
  const url = new URL(`http://127.0.0.1:${port}${pathname}`);
  if (searchParamMap) {
    Object.entries(searchParamMap).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : void 0
    });
  } catch {
    throw new Error(desktopAppNotReadyErrorMessage);
  }
  const responseBody = await response.json();
  if (!response.ok) {
    const errorMessage = typeof responseBody === "object" && responseBody !== null && "error" in responseBody && typeof responseBody.error === "string" ? responseBody.error : `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }
  return responseBody;
}
var printResult = (result) => (
  // oxlint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2))
);
var printError = (error) => {
  const message = getErrorMessage(error);
  console.error(JSON.stringify({ error: message }, null, 2));
};

// src/commands/audio.ts
var metadataCommand = new Command("metadata").description(
  "Read metadata for an audio card (title, transcriptStatus, durationSeconds). Use this first to plan audio read calls."
).argument("<audioCardId>", "Audio card ID (UUID)").action(async (audioCardId) => {
  const trimmedAudioCardId = audioCardId.trim();
  if (trimmedAudioCardId.length === 0) {
    printError(new Error("<audioCardId> must be a non-empty UUID"));
    process.exit(1);
  }
  try {
    const result = await request({
      method: "GET",
      pathname: `/audio-cards/${encodeURIComponent(trimmedAudioCardId)}/metadata`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var readCommand = new Command("read").description(
  "Read transcript entries for an audio card within a time range. Both --start-seconds and --end-seconds are required and inclusive."
).argument("<audioCardId>", "Audio card ID (UUID)").requiredOption(
  "--start-seconds <number>",
  "Start time in seconds (inclusive)"
).requiredOption("--end-seconds <number>", "End time in seconds (inclusive)").action(
  async (audioCardId, options) => {
    const trimmedAudioCardId = audioCardId.trim();
    if (trimmedAudioCardId.length === 0) {
      printError(new Error("<audioCardId> must be a non-empty UUID"));
      process.exit(1);
    }
    try {
      const result = await request({
        method: "GET",
        pathname: `/audio-cards/${encodeURIComponent(trimmedAudioCardId)}/transcript/read`,
        searchParamMap: {
          startSeconds: options.startSeconds,
          endSeconds: options.endSeconds
        }
      });
      printResult(result);
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  }
);
var audioCommand = new Command("audio").description(
  "Read audio card transcript content. Use `audio metadata` first to see transcriptStatus and durationSeconds, then `audio read` a time range."
).addCommand(metadataCommand).addCommand(readCommand);

// src/commands/card.ts
function parseJsonPropertyValueInput({
  rawValue
}) {
  try {
    const parsedValue = JSON.parse(rawValue);
    return parsedValue;
  } catch (error) {
    throw new Error(`Invalid JSON value: ${rawValue}`, { cause: error });
  }
}
var listCommand = new Command("list").description(
  "List and search cards from the Card Library with pagination. Returns { results: [{ id, objectType, title, createdTime, lastEditedTime }], total, offset, limit }. Supports filtering by card type and sorting."
).option("-q, --query <keyword>", "Search keyword (optional)").option(
  "--card-types <types>",
  "Comma-separated card types to include (note, pdf, journal, highlightElement, source, image, video, audio, web). Defaults to all."
).option(
  "--sort <field>",
  "Sort field: title, lastUpdatedTime, or createdTime",
  "lastUpdatedTime"
).option(
  "--direction <direction>",
  "Sort direction: ascending or descending",
  "descending"
).option("--offset <number>", "Pagination offset", "0").option("-l, --limit <number>", "Number of results per page (max 100)", "20").action(
  async (options) => {
    try {
      const searchParamMap = {
        sortField: options.sort,
        sortDirection: options.direction,
        offset: options.offset,
        limit: options.limit
      };
      if (options.query) {
        searchParamMap.keyword = options.query;
      }
      if (options.cardTypes) {
        searchParamMap.cardTypes = options.cardTypes;
      }
      const result = await request({
        method: "GET",
        pathname: "/card-library/search",
        searchParamMap
      });
      printResult(result);
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  }
);
var trashCommand = new Command("trash").description(
  "Soft-delete a card by moving it to trash. Works on any card type."
).argument("<cardId>", "Card ID (UUID)").action(async (cardId) => {
  try {
    const result = await request({
      method: "DELETE",
      pathname: `/cards/${encodeURIComponent(cardId)}`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var restoreCommand = new Command("restore").description("Restore a trashed card from trash.").argument("<cardId>", "Card ID (UUID)").action(async (cardId) => {
  try {
    const result = await request({
      method: "POST",
      pathname: `/cards/${encodeURIComponent(cardId)}/restore`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var propertiesCommand = new Command("properties").description(
  "Read all structured property values for a card, grouped by tag. Returns { cardId, cardType, title, tags: [{ tagId, tagName, properties: [{ id, name, type, value }] }] }."
).argument("<cardIdOrDate>", "Card ID (UUID, or a journal date in YYYY-MM-DD)").action(async (cardIdOrDate) => {
  try {
    const result = await request({
      method: "GET",
      pathname: `/cards/${encodeURIComponent(cardIdOrDate)}/properties`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var setPropertyCommand = new Command("set-property").description(
  "Set a property value on a card. Read card/tag properties first to find the property ID, type, and allowed options; use --json-value for arrays, objects, booleans, numbers, and null. Agents should install/use the heptabase-cli skill and read its property value reference before using this command."
).argument("<cardIdOrDate>", "Card ID (UUID, or a journal date in YYYY-MM-DD)").requiredOption("--property-id <propertyId>", "Property ID (UUID)").option(
  "--value <value>",
  "String property value. Use --json-value for numbers, booleans, arrays, objects, or null."
).option(
  "--json-value <json>",
  "JSON property value. Use arrays for multi-select/relation values and null to clear."
).action(
  async (cardIdOrDate, options) => {
    if (options.value == null && options.jsonValue == null || options.value != null && options.jsonValue != null) {
      printError(new Error("Pass exactly one of --value or --json-value"));
      process.exit(1);
    }
    try {
      const result = await request({
        method: "PUT",
        pathname: `/cards/${encodeURIComponent(cardIdOrDate)}/properties/${encodeURIComponent(options.propertyId)}`,
        body: {
          value: options.jsonValue != null ? parseJsonPropertyValueInput({ rawValue: options.jsonValue }) : options.value
        }
      });
      printResult(result);
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  }
);
var cardCommand = new Command("card").description(
  "List, trash, restore, and edit properties on cards across all card types (note, pdf, journal, etc.)."
).addCommand(listCommand).addCommand(trashCommand).addCommand(restoreCommand).addCommand(propertiesCommand).addCommand(setPropertyCommand);

// src/commands/course.ts
var listCommand2 = new Command("list").description(
  "List all AI Tutor learning courses across all goals. Returns { courses: [{ id, title, description, goalId, createdTime }] }. `goalId` is the parent root goal id, or null if the course is itself a root goal."
).action(async () => {
  try {
    const result = await request({
      method: "GET",
      pathname: "/courses"
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var readCommand2 = new Command("read").description(
  "Read a course's overview and syllabus. Returns { courseId, title, overview, expectedOutcome, topics: [{ id, title, description, subtopics: [...], sources: [...] }] }. Each subtopic includes status (notStarted | inProgress | covered) and coveredSummary."
).argument("<courseId>", "Course ID (UUID)").action(async (courseId) => {
  try {
    const result = await request({
      method: "GET",
      pathname: `/courses/${encodeURIComponent(courseId)}`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var courseCommand = new Command("course").description(
  "List AI Tutor learning courses and read a course overview and syllabus."
).addCommand(listCommand2).addCommand(readCommand2);

// src/commands/file.ts
var import_node_path2 = require("node:path");
var listCommand3 = new Command("list").description(
  "List exportable file IDs referenced by a card. Currently returns files for PDF/media cards and an empty files array for unsupported card types."
).requiredOption("--card-id <uuid>", "Card ID UUID (required)").action(async (options) => {
  const cardId = options.cardId.trim();
  if (cardId.length === 0) {
    printError(new Error("--card-id must be a non-empty UUID"));
    process.exit(1);
  }
  try {
    const result = await request({
      method: "GET",
      pathname: `/cards/${encodeURIComponent(cardId)}/files`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var exportCommand = new Command("export").description(
  "Export a local Heptabase file into an output directory. Returns { fileId, path, filename, originalName, mimeType, size, lastEditedTime }."
).argument("<fileId>", "File ID UUID").requiredOption(
  "--output-dir <dir>",
  "Existing directory where the exported file should be written"
).action(async (fileId, options) => {
  const trimmedFileId = fileId.trim();
  if (trimmedFileId.length === 0) {
    printError(new Error("<fileId> must be a non-empty UUID"));
    process.exit(1);
  }
  if (options.outputDir.trim().length === 0) {
    printError(new Error("--output-dir must be a non-empty path"));
    process.exit(1);
  }
  try {
    const result = await request({
      method: "POST",
      pathname: `/files/${encodeURIComponent(trimmedFileId)}/export`,
      body: {
        outputDir: (0, import_node_path2.resolve)(options.outputDir)
      }
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var fileCommand = new Command("file").description("Discover card file IDs and export local Heptabase files.").addCommand(listCommand3).addCommand(exportCommand);

// src/commands/goal.ts
var listCommand4 = new Command("list").description(
  "List all root goals (top-level AI Tutor topics). Returns { goals: [{ id, title, description, type, createdTime, courses: [{ id, title }] }] }. Each goal includes its child learning courses."
).action(async () => {
  try {
    const result = await request({
      method: "GET",
      pathname: "/goals"
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var goalCommand = new Command("goal").description(
  "List AI Tutor root goals (the top-level topics) along with their courses."
).addCommand(listCommand4);

// src/commands/utils/resolveContent.ts
var import_node_fs2 = require("node:fs");
function resolveContent({
  content,
  contentFile
}) {
  if (contentFile != null) {
    return (0, import_node_fs2.readFileSync)(contentFile, "utf-8");
  }
  return content;
}

// src/commands/journal.ts
var createCommand2 = new Command("create").description(
  "Create a journal entry for a date from markdown content. Returns { date, title }. Returns 409 if journal already has content."
).option(
  "-d, --date <YYYY-MM-DD>",
  "Journal date (defaults to today in the desktop app local timezone)"
).option("-c, --content <markdown>", "Journal content in markdown").option(
  "-f, --content-file <path>",
  "Path to a markdown file for journal content"
).action(
  async (options) => {
    try {
      const content = resolveContent(options);
      if (content == null) {
        printError(
          new Error("Either --content or --content-file is required")
        );
        process.exit(1);
      }
      const result = await request({
        method: "POST",
        pathname: "/journals",
        body: {
          content,
          ...options.date != null ? { date: options.date } : {}
        }
      });
      printResult(result);
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  }
);
var readCommand3 = new Command("read").description(
  "Read a journal's title and content as ProseMirror JSON. Returns { date, title, content, contentMd5 }."
).argument("<date>", "Journal date (YYYY-MM-DD)").action(async (date) => {
  try {
    const result = await request({
      method: "GET",
      pathname: `/journals/${encodeURIComponent(date)}/content`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var saveCommand = new Command("save").description(
  `Replace a journal's entire content with ProseMirror JSON (use "journal read" to get the current structure and contentMd5).`
).argument("<date>", "Journal date (YYYY-MM-DD)").requiredOption(
  "--content-md5 <md5>",
  'MD5 hash from the most recent "journal read" (for conflict detection)'
).option("-c, --content <json>", "Journal content as ProseMirror JSON string").option(
  "-f, --content-file <path>",
  "Path to a file containing ProseMirror JSON content"
).action(
  async (date, options) => {
    try {
      const content = resolveContent(options);
      if (content == null) {
        printError(
          new Error("Either --content or --content-file is required")
        );
        process.exit(1);
      }
      const result = await request({
        method: "PUT",
        pathname: `/journals/${encodeURIComponent(date)}/content`,
        body: { content, contentMd5: options.contentMd5 }
      });
      printResult(result);
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  }
);
var appendCommand = new Command("append").description(
  "Append markdown content to the end of a journal. Returns { date, title, contentMd5 }."
).argument("<date>", "Journal date (YYYY-MM-DD)").option("-c, --content <markdown>", "Markdown content to append").option(
  "-f, --content-file <path>",
  "Path to a markdown file with content to append"
).option(
  "--content-md5 <md5>",
  'MD5 hash from a prior "journal read" (optional, for conflict detection)'
).action(
  async (date, options) => {
    try {
      const content = resolveContent(options);
      if (content == null) {
        printError(
          new Error("Either --content or --content-file is required")
        );
        process.exit(1);
      }
      const result = await request({
        method: "POST",
        pathname: `/journals/${encodeURIComponent(date)}/content/append`,
        body: {
          content,
          ...options.contentMd5 != null ? { contentMd5: options.contentMd5 } : {}
        }
      });
      printResult(result);
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  }
);
var journalCommand = new Command("journal").description(
  "Create, read, save, and append journal entries by date. Content format: markdown on create/append, ProseMirror JSON on read/save."
).addCommand(createCommand2).addCommand(readCommand3).addCommand(saveCommand).addCommand(appendCommand);

// src/commands/lesson.ts
var listCommand5 = new Command("list").description(
  "List lessons in a course (chronological tutor chat sessions). Returns { courseId, courseTitle, lessons: [{ lessonNumber, lessonId, title, createdTime, isEnded, hasLessonPlan }] }."
).argument("<courseId>", "Course ID (UUID)").action(async (courseId) => {
  try {
    const result = await request({
      method: "GET",
      pathname: `/courses/${encodeURIComponent(courseId)}/lessons`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var readCommand4 = new Command("read").description(
  "Read a lesson's plan and artifact card ids. Returns { lessonId, courseId, courseTitle, lessonNumber, lessonPlan, aiArtifacts }. `lessonPlan` is null if the lesson has no plan yet. `aiArtifacts` lists generated lessonParts and lessonNotes; use `note read <cardId>` to fetch their full content."
).argument("<lessonId>", "Lesson (chat) ID (UUID)").action(async (lessonId) => {
  try {
    const result = await request({
      method: "GET",
      pathname: `/lessons/${encodeURIComponent(lessonId)}`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var listMessagesCommand = new Command("list-messages").description(
  "List chat messages in a lesson with markdown content and offset pagination. Returns { lessonId, messages: [{ id, role, contentMarkdown, createdTime, createdBy }], total, offset, limit, hasMore }."
).argument("<lessonId>", "Lesson (chat) ID (UUID)").option("--offset <number>", "Pagination offset", "0").option("-l, --limit <number>", "Number of messages per page (max 100)", "20").action(
  async (lessonId, options) => {
    try {
      const result = await request({
        method: "GET",
        pathname: `/lessons/${encodeURIComponent(lessonId)}/messages`,
        searchParamMap: {
          offset: options.offset,
          limit: options.limit
        }
      });
      printResult(result);
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  }
);
var lessonCommand = new Command("lesson").description(
  "List lessons in an AI Tutor course, read a lesson plan and artifacts, and read lesson chat messages."
).addCommand(listCommand5).addCommand(readCommand4).addCommand(listMessagesCommand);

// src/commands/note.ts
var createCommand3 = new Command("create").description(
  'Create a new note card from markdown content. Use a "# heading" as the first line to set the title. Returns { id, title }.'
).option("-c, --content <markdown>", "Note card content in markdown").option(
  "-f, --content-file <path>",
  "Path to a markdown file for note card content"
).action(async (options) => {
  try {
    const content = resolveContent(options);
    if (content == null) {
      printError(new Error("Either --content or --content-file is required"));
      process.exit(1);
    }
    const result = await request({
      method: "POST",
      pathname: "/notes",
      body: { content }
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var readCommand5 = new Command("read").description(
  "Read a note card's title and content as ProseMirror JSON. Returns { id, title, content, contentMd5 }."
).argument("<cardId>", "Note card ID (UUID)").action(async (cardId) => {
  try {
    const result = await request({
      method: "GET",
      pathname: `/notes/${encodeURIComponent(cardId)}/content`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var saveCommand2 = new Command("save").description(
  `Replace a note card's entire content with ProseMirror JSON (use "note read" to get the current structure and contentMd5).`
).argument("<cardId>", "Note card ID (UUID)").requiredOption(
  "--content-md5 <md5>",
  'MD5 hash from the most recent "note read" (for conflict detection)'
).option(
  "-c, --content <json>",
  "Note card content as ProseMirror JSON string"
).option(
  "-f, --content-file <path>",
  "Path to a file containing ProseMirror JSON content"
).action(
  async (cardId, options) => {
    try {
      const content = resolveContent(options);
      if (content == null) {
        printError(
          new Error("Either --content or --content-file is required")
        );
        process.exit(1);
      }
      const result = await request({
        method: "PUT",
        pathname: `/notes/${encodeURIComponent(cardId)}/content`,
        body: { content, contentMd5: options.contentMd5 }
      });
      printResult(result);
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  }
);
var appendCommand2 = new Command("append").description(
  "Append markdown content to the end of an existing note card. Returns { id, title, contentMd5 }."
).argument("<cardId>", "Note card ID (UUID)").option("-c, --content <markdown>", "Markdown content to append").option(
  "-f, --content-file <path>",
  "Path to a markdown file with content to append"
).option(
  "--content-md5 <md5>",
  'MD5 hash from a prior "note read" (optional, for conflict detection)'
).action(
  async (cardId, options) => {
    try {
      const content = resolveContent(options);
      if (content == null) {
        printError(
          new Error("Either --content or --content-file is required")
        );
        process.exit(1);
      }
      const result = await request({
        method: "POST",
        pathname: `/notes/${encodeURIComponent(cardId)}/content/append`,
        body: {
          content,
          ...options.contentMd5 != null ? { contentMd5: options.contentMd5 } : {}
        }
      });
      printResult(result);
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  }
);
var noteCommand = new Command("note").description(
  "Create, read, save, and append note cards. Content format: markdown on create/append, ProseMirror JSON on read/save."
).addCommand(createCommand3).addCommand(readCommand5).addCommand(saveCommand2).addCommand(appendCommand2);

// src/commands/pdf.ts
var metadataCommand2 = new Command("metadata").description(
  "Read metadata for a PDF card (title, totalPages, parsedStatus). Use this first to plan pdf read calls."
).argument("<pdfCardId>", "PDF card ID (UUID)").action(async (pdfCardId) => {
  const trimmedPdfCardId = pdfCardId.trim();
  if (trimmedPdfCardId.length === 0) {
    printError(new Error("<pdfCardId> must be a non-empty UUID"));
    process.exit(1);
  }
  try {
    const result = await request({
      method: "GET",
      pathname: `/pdf-cards/${encodeURIComponent(trimmedPdfCardId)}/metadata`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var readCommand6 = new Command("read").description(
  "Read parsed PDF content for a page range. Both --start-page and --end-page are required and 1-indexed inclusive."
).argument("<pdfCardId>", "PDF card ID (UUID)").requiredOption("--start-page <number>", "Start page (1-indexed, inclusive)").requiredOption("--end-page <number>", "End page (1-indexed, inclusive)").action(
  async (pdfCardId, options) => {
    const trimmedPdfCardId = pdfCardId.trim();
    if (trimmedPdfCardId.length === 0) {
      printError(new Error("<pdfCardId> must be a non-empty UUID"));
      process.exit(1);
    }
    try {
      const result = await request({
        method: "GET",
        pathname: `/pdf-cards/${encodeURIComponent(trimmedPdfCardId)}/read`,
        searchParamMap: {
          startPage: options.startPage,
          endPage: options.endPage
        }
      });
      printResult(result);
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  }
);
var pdfCommand = new Command("pdf").description(
  "Read parsed PDF card content. Use `pdf metadata` first to see totalPages, then `pdf read` a page range."
).addCommand(metadataCommand2).addCommand(readCommand6);

// src/commands/start.ts
var import_node_child_process = require("node:child_process");
var import_node_fs3 = require("node:fs");
var defaultTimeoutMs = 3e4;
var defaultPollIntervalMs = 500;
var positiveIntegerOptionValueSchema = z.string().regex(/^\d+$/).transform((rawValue) => Number.parseInt(rawValue, 10)).pipe(z.number().int().positive());
function parsePositiveIntegerOptionValue({
  value,
  optionName
}) {
  const parseResult = positiveIntegerOptionValueSchema.safeParse(value);
  if (!parseResult.success) {
    throw new InvalidArgumentError(`${optionName} must be a positive integer`);
  }
  return parseResult.data;
}
function getDesktopRuntimePath() {
  const cliRuntimePathFromWrapper = process.env.heptabaseCliRuntimePath;
  if (cliRuntimePathFromWrapper != null && cliRuntimePathFromWrapper !== "") {
    return cliRuntimePathFromWrapper;
  }
  if (process.env.ELECTRON_RUN_AS_NODE === "1") {
    return process.execPath;
  }
  return null;
}
function launchDesktopRuntime({
  runtimePath
}) {
  const environmentVariables = { ...process.env };
  delete environmentVariables.ELECTRON_RUN_AS_NODE;
  delete environmentVariables.heptabaseCliRuntimePath;
  delete environmentVariables.heptabaseCliScriptPath;
  return new Promise((resolve3, reject) => {
    const launchedProcess = (0, import_node_child_process.spawn)(runtimePath, [], {
      detached: true,
      stdio: "ignore",
      env: environmentVariables
    });
    const onError = (error) => {
      reject(error);
    };
    launchedProcess.once("error", onError);
    launchedProcess.once("spawn", () => {
      launchedProcess.off("error", onError);
      launchedProcess.unref();
      resolve3();
    });
  });
}
var startCommand = new Command("start").description(
  "Launch Heptabase desktop and wait until the local CLI server is ready."
).option(
  "--timeout-ms <milliseconds>",
  "Maximum time to wait for CLI readiness",
  (value) => parsePositiveIntegerOptionValue({
    value,
    optionName: "--timeout-ms"
  }),
  defaultTimeoutMs
).option(
  "--poll-interval-ms <milliseconds>",
  "Readiness polling interval",
  (value) => parsePositiveIntegerOptionValue({
    value,
    optionName: "--poll-interval-ms"
  }),
  defaultPollIntervalMs
).action(async (options) => {
  try {
    const desktopRuntimePath = getDesktopRuntimePath();
    const readinessTokenTarget = desktopRuntimePath != null ? "packaged" : "auto";
    if (await probeLocalServerReady({ tokenTarget: readinessTokenTarget })) {
      printResult({ status: "ready" });
      return;
    }
    if (desktopRuntimePath == null) {
      throw new Error(
        "Unable to start Heptabase from this CLI runtime. Use the installed `heptabase` command, or launch the desktop app manually."
      );
    }
    if (!(0, import_node_fs3.existsSync)(desktopRuntimePath)) {
      throw new Error(
        "Unable to find the Heptabase desktop runtime. Reinstall CLI from the app settings and retry."
      );
    }
    await launchDesktopRuntime({ runtimePath: desktopRuntimePath });
    const isReady = await waitUntilLocalServerReady({
      timeoutMs: options.timeoutMs,
      pollIntervalMs: options.pollIntervalMs,
      tokenTarget: "packaged"
    });
    if (!isReady) {
      throw new Error(
        "Heptabase started, but the CLI server is not ready yet. Ensure CLI is enabled in Settings > AI Features, then retry `heptabase start`."
      );
    }
    printResult({ status: "ready" });
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});

// src/commands/tag.ts
var listCommand6 = new Command("list").description(
  "List all tags. Returns { tags: [{ id, name, parentTagId, createdTime, lastEditedTime }] }. Use --name-filter for case-insensitive substring match."
).option(
  "-n, --name-filter <filter>",
  "Filter tags by name (case-insensitive)"
).action(async (options) => {
  try {
    const searchParamMap = {};
    if (options.nameFilter) {
      searchParamMap.nameFilter = options.nameFilter;
    }
    const result = await request({
      method: "GET",
      pathname: "/tags",
      searchParamMap: Object.keys(searchParamMap).length > 0 ? searchParamMap : void 0
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var cardsCommand = new Command("cards").description(
  "List all cards under a tag. Returns { tagId, tagName, cards: [{ id, title, createdTime, lastEditedTime, properties? }] }. Use --include-properties to include tag database property values."
).argument("<tagId>", "Tag ID (UUID)").option("--include-properties", "Include property values for each card").action(async (tagId, options) => {
  try {
    const searchParamMap = {};
    if (options.includeProperties) {
      searchParamMap.includeProperties = "true";
    }
    const result = await request({
      method: "GET",
      pathname: `/tags/${encodeURIComponent(tagId)}/cards`,
      searchParamMap: Object.keys(searchParamMap).length > 0 ? searchParamMap : void 0
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var propertiesCommand2 = new Command("properties").description(
  "List property columns for a tag database. Returns { tagId, tagName, properties: [{ id, name, type, options?, relationTargetTagId? }] }."
).argument("<tagId>", "Tag ID (UUID)").action(async (tagId) => {
  try {
    const result = await request({
      method: "GET",
      pathname: `/tags/${encodeURIComponent(tagId)}/properties`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var addCommand = new Command("add").description("Add a tag to a card (creates the tag if it does not exist)").requiredOption(
  "--card-id <cardId>",
  "Card ID (UUID, or a journal date in YYYY-MM-DD)"
).requiredOption("--tag-name <tagName>", "Tag name").action(async (options) => {
  try {
    const result = await request({
      method: "POST",
      pathname: `/cards/${encodeURIComponent(options.cardId)}/tags`,
      body: { tagName: options.tagName }
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var createCommand4 = new Command("create").description(
  "Create a new tag database. Returns { id, name }. Fails with 409 if name already exists."
).requiredOption("--name <name>", "Tag name").action(async (options) => {
  try {
    const result = await request({
      method: "POST",
      pathname: "/tags",
      body: { name: options.name }
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var removeCommand = new Command("remove").description("Remove a tag from a card").requiredOption(
  "--card-id <cardId>",
  "Card ID (UUID, or a journal date in YYYY-MM-DD)"
).requiredOption("--tag-id <tagId>", "Tag ID (UUID)").action(async (options) => {
  try {
    const result = await request({
      method: "DELETE",
      pathname: `/cards/${encodeURIComponent(options.cardId)}/tags/${encodeURIComponent(options.tagId)}`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var tagCommand = new Command("tag").description(
  "Create, list, add, and remove tags. List cards and properties under a tag."
).addCommand(createCommand4).addCommand(listCommand6).addCommand(cardsCommand).addCommand(propertiesCommand2).addCommand(addCommand).addCommand(removeCommand);

// src/commands/video.ts
var metadataCommand3 = new Command("metadata").description(
  "Read metadata for a video card (title, transcriptStatus, durationSeconds). Use this first to plan video read calls."
).argument("<videoCardId>", "Video card ID (UUID)").action(async (videoCardId) => {
  const trimmedVideoCardId = videoCardId.trim();
  if (trimmedVideoCardId.length === 0) {
    printError(new Error("<videoCardId> must be a non-empty UUID"));
    process.exit(1);
  }
  try {
    const result = await request({
      method: "GET",
      pathname: `/video-cards/${encodeURIComponent(trimmedVideoCardId)}/metadata`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var readCommand7 = new Command("read").description(
  "Read transcript entries for a video card within a time range. Both --start-seconds and --end-seconds are required and inclusive."
).argument("<videoCardId>", "Video card ID (UUID)").requiredOption(
  "--start-seconds <number>",
  "Start time in seconds (inclusive)"
).requiredOption("--end-seconds <number>", "End time in seconds (inclusive)").action(
  async (videoCardId, options) => {
    const trimmedVideoCardId = videoCardId.trim();
    if (trimmedVideoCardId.length === 0) {
      printError(new Error("<videoCardId> must be a non-empty UUID"));
      process.exit(1);
    }
    try {
      const result = await request({
        method: "GET",
        pathname: `/video-cards/${encodeURIComponent(trimmedVideoCardId)}/transcript/read`,
        searchParamMap: {
          startSeconds: options.startSeconds,
          endSeconds: options.endSeconds
        }
      });
      printResult(result);
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  }
);
var videoCommand = new Command("video").description(
  "Read video card transcript content. Use `video metadata` first to see transcriptStatus and durationSeconds, then `video read` a time range."
).addCommand(metadataCommand3).addCommand(readCommand7);

// src/commands/whiteboard.ts
var listCommand7 = new Command("list").description(
  "List available whiteboards with pagination. Returns { whiteboards: [{ id, name, parentWhiteboardId, createdTime, lastEditedTime }], total, offset, limit }. Supports filtering by name and sorting."
).option(
  "-n, --name-filter <filter>",
  "Filter whiteboards by name (case-insensitive)"
).option(
  "--sort <field>",
  "Sort field: name, lastEditedTime, or createdTime",
  "createdTime"
).option(
  "--direction <direction>",
  "Sort direction: ascending or descending",
  "descending"
).option("--offset <number>", "Pagination offset", "0").option("-l, --limit <number>", "Number of results per page (max 100)", "20").action(
  async (options) => {
    try {
      const searchParamMap = {
        sortField: options.sort,
        sortDirection: options.direction,
        offset: options.offset,
        limit: options.limit
      };
      if (options.nameFilter) {
        searchParamMap.nameFilter = options.nameFilter;
      }
      const result = await request({
        method: "GET",
        pathname: "/whiteboards",
        searchParamMap
      });
      printResult(result);
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  }
);
var cardsCommand2 = new Command("cards").description(
  "List all whiteboard-enabled card objects on a whiteboard. Returns { whiteboardName, cards: [{ whiteboardObjectId, whiteboardObjectType, cardId, cardType, title, createdTime, lastEditedTime }] }."
).argument("<whiteboardId>", "Whiteboard ID (UUID)").action(async (whiteboardId) => {
  try {
    const result = await request({
      method: "GET",
      pathname: `/whiteboards/${encodeURIComponent(whiteboardId)}/cards`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var addCardCommand = new Command("add-card").description(
  "Place a card on a whiteboard. If the card is already on the whiteboard, leaves it unchanged instead of adding another copy."
).requiredOption("--whiteboard-id <whiteboardId>", "Whiteboard ID (UUID)").requiredOption(
  "--card-id <cardId>",
  "Card ID (UUID, or a journal date in YYYY-MM-DD)"
).action(async (options) => {
  try {
    const result = await request({
      method: "POST",
      pathname: `/whiteboards/${encodeURIComponent(options.whiteboardId)}/cards`,
      body: { cardId: options.cardId }
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var removeCardCommand = new Command("remove-card").description(
  "Remove all instances of a card from a whiteboard. Does not trash the card itself."
).requiredOption("--whiteboard-id <whiteboardId>", "Whiteboard ID (UUID)").requiredOption(
  "--card-id <cardId>",
  "Card ID (UUID, or a journal date in YYYY-MM-DD)"
).action(async (options) => {
  try {
    const result = await request({
      method: "DELETE",
      pathname: `/whiteboards/${encodeURIComponent(options.whiteboardId)}/cards/${encodeURIComponent(options.cardId)}`
    });
    printResult(result);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
});
var whiteboardCommand = new Command("whiteboard").description("List whiteboards and add, list, or remove cards on them.").addCommand(listCommand7).addCommand(cardsCommand2).addCommand(addCardCommand).addCommand(removeCardCommand);

// src/version.ts
var cliVersion = "0.4.0";

// src/index.ts
var cliScriptPathPattern = /[\\/]cli[\\/]cli\.cjs$/i;
function getNormalizedArgv({
  argv,
  electronRunAsNode
}) {
  const commandArgumentList = argv.slice(2);
  const firstCommandArgument = commandArgumentList[0];
  const scriptPath = argv[1];
  const hasDuplicatedScriptPathArgument = scriptPath != null && firstCommandArgument != null && (0, import_node_path3.resolve)(firstCommandArgument) === (0, import_node_path3.resolve)(scriptPath);
  const shouldSkipInjectedCliScriptPath = electronRunAsNode === "1" && firstCommandArgument != null && (hasDuplicatedScriptPathArgument || cliScriptPathPattern.test(firstCommandArgument));
  if (!shouldSkipInjectedCliScriptPath) {
    return argv;
  }
  return [argv[0], argv[1], ...commandArgumentList.slice(1)];
}
var program2 = new Command();
program2.name("heptabase").description(
  'Heptabase CLI \u2014 requires the desktop app running with CLI enabled (run "heptabase start" to start the app). All output is JSON. Version (heptabase --version) is bumped when the CLI interface changes.'
).version(cliVersion);
program2.addCommand(startCommand);
program2.addCommand(audioCommand);
program2.addCommand(cardCommand);
program2.addCommand(courseCommand);
program2.addCommand(fileCommand);
program2.addCommand(goalCommand);
program2.addCommand(journalCommand);
program2.addCommand(lessonCommand);
program2.addCommand(noteCommand);
program2.addCommand(pdfCommand);
program2.addCommand(tagCommand);
program2.addCommand(videoCommand);
program2.addCommand(whiteboardCommand);
program2.parse(
  getNormalizedArgv({
    argv: process.argv,
    electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE
  })
);
