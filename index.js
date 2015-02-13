/**
 * analysis 'require(xxx)' to add file.requires
 * analysis 'require.defer(xxx)' or 'require.async(xxx)' to add file.extras.async
 */

'use strict';

var gutil = require('gulp-util');
var through = require('through2');
var PluginError = gutil.PluginError;

var stringRegStr = '(?:' +
  '\"(?:[^\\\\\"\\r\\n\\f]|\\\\[\\s\\S])*\"' + //match the " delimiter string
  '|' +
  '\'(?:[^\\\\\'\\r\\n\\f]|\\\\[\\s\\S])*\'' + //match the ' delimiter string
  ')';

var jscommentRegStr = '(?:' +
  '\\/\\/[^\\r\\n\\f]*' + // match the single line comment
  '|' +
  '\\/\\*[\\s\\S]+?\\*\\/' + //match the multi line comment
  ')';

var jsStringArrayRegStr = '(?:' +
  '\\[\\s*' + stringRegStr + '(?:\\s*,\\s*' + stringRegStr + ')*\\s*\\]' + //match string array
  ')';

//construct the regexExp to analysis strings like require("xxx")、
//require.defer("[xxx]") or require.async("[xxx]")
//string and comment first。
var requireRegStr = '((?:[^\\$\\.]|^)\\brequire(?:\\s*\\.\\s*(async|defer))?\\s*\\(\\s*)(' +
  stringRegStr + '|' +
  jsStringArrayRegStr + ')';

var defaultDeps = ['global', 'module', 'exports', 'require'];

var pluginName = 'gulp-her-requireAnalyze';

function createError(file, err) {
  if (typeof err === 'string') {
    return new PluginError(pluginName, file.path + ': ' + err, {
      fileName: file.path,
      showStack: false
    });
  }

  var msg = err.message || err.msg || 'unspecified error';

  return new PluginError(pluginName, file.path + ': ' + msg, {
    fileName: file.path,
    lineNumber: err.line,
    stack: err.stack,
    showStack: false
  });
}

module.exports = function (opt) {
  function analyze(file, encoding, callback) {

    if (file.isNull()) {
      return callback(null, file);
    }

    if (file.isStream()) {
      return callback(createError(file, 'Streaming not supported'));
    }

    var content = String(file.contents);

    //first match the string or comment
    var reg = new RegExp(stringRegStr + '|' +
    jscommentRegStr + '|' +
    requireRegStr, 'g');
    //save the sync requires and async requires
    var requires = {
      sync: {},
      async: {}
    };
    var initial = false;

    if (file.extras == undefined) {
      file.extras = {};
      initial = true;
    }
    file.extras.async = [];

    content = content.replace(reg, function (all, requirePrefix, requireType, requireValueStr) {
      var hasBrackets = false;

      //requirePrefix is undefined when match from string or comment
      if (requirePrefix) {

        //if here has '[]' , cut it
        requireValueStr = requireValueStr.trim().replace(/(^\[|\]$)/g, function (m, v) {
          if (v) {
            hasBrackets = true;
          }
          return '';
        });

        var requireValue = requireValueStr.split(/\s*,\s*/);

        requireType = 'require' + (requireType ? ('.' + requireType) : '');

        var holder;
        switch (requireType) {
          case 'require':
            holder = requires.sync;
            break;
          case 'require.async':
          case 'require.defer':
            holder = requires.async;
            break;
          default:
            break;
        }
        //var dirname = her.util.dirname(file.path);
        requireValue.forEach(function (item, index, array) {
          //var id = her.uri.getModuleName(item, dirname);
          var info = her.uri.getId(item, file.dirname);
          holder[info.id] = true;
        });

        //standard path
        if (hasBrackets) {//Array
          all = requirePrefix +
          '[' + requireValue.map(function (path) {
            var quote = her.util.stringQuote(path).quote;
            return quote + her.uri.getId(path, file.dirname).id + quote
          }).join(',') + ']';
        } else { //String
          var quote = her.util.stringQuote(requireValueStr).quote;
          all = requirePrefix + quote + her.uri.getId(requireValueStr, file.dirname).id + quote;
        }

      }
      return all;
    });

    //process the sync requires
    for (var id in requires.sync) {
      file.addRequire(id);
    }

    //process the async requires
    for (var id in requires.async) {
      if (file.extras.async.indexOf(id) < 0) {
        file.extras.async.push(id);
      }
    }

    //if there is no ansync requires, delete the the object
    if (file.extras.async.length == 0) {
      delete file.extras.async;
      if (initial) {
        delete file.extras;
      }
    }

    file.contents = new Buffer(content);

    callback(null, file);
  }

  return through.obj(analyze);
};
