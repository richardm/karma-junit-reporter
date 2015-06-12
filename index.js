// TODO:
// should probably get rid of the root browser element, but we need somewhere to store any system-out output
// need to add errors, tests, failures, and time to each testsuite

var os = require('os');
var path = require('path');
var fs = require('fs');
var builder = require('xmlbuilder');


var JUnitReporter = function(baseReporterDecorator, config, logger, helper, formatError) {
  var log = logger.create('reporter.junitp');
  var reporterConfig = config.junitpReporter || {};
  var pkgName = reporterConfig.suite || '';
  var outputFile = helper.normalizeWinPath(
    path.resolve(config.basePath, reporterConfig.outputFile || 'test-results.xml')
  );

  var xml;
  var suites;
  var pendingFileWritings = 0;
  var fileWritingFinished = function() {};
  var allMessages = [];

  baseReporterDecorator(this);

  this.adapters = [function(msg) {
    allMessages.push(msg);
  }];

  var initializeXmlForBrowser = function(browser) {
    var timestamp = (new Date()).toISOString().substr(0, 19);

    // TODO don't set this
    var suite = suites[browser.id] = xml.ele('testsuite', {
      name: browser.name,
      'package': pkgName,
      timestamp: timestamp,
      id: 0,
      hostname: os.hostname()
    });

    suite.ele('properties').ele('property', {name: 'browser.fullName', value: browser.fullName});
  };

  this.onRunStart = function(browsers) {
    suites = Object.create(null);
    xml = builder.create('testsuites');

    // TODO(vojta): remove once we don't care about Karma 0.10
    browsers.forEach(initializeXmlForBrowser);
  };

  this.onBrowserStart = function(browser) {
    initializeXmlForBrowser(browser);
  };

  this.onBrowserComplete = function(browser) {
    var suite = suites[browser.id];

    // TODO check if suites is empty instead
    if (!suite) {
      // This browser did not signal `onBrowserStart`. That happens
      // if the browser timed out during the start phase.
      return;
    }

    var result = browser.lastResult;

    suite.att('tests', result.total);
    suite.att('errors', result.disconnected || result.error ? 1 : 0);
    suite.att('failures', result.failed);
    suite.att('time', (result.netTime || 0) / 1000);

    suite.ele('system-out').dat(allMessages.join() + '\n');
    suite.ele('system-err');
  };

  this.onRunComplete = function() {
    var xmlToOutput = xml;

    pendingFileWritings++;
    helper.mkdirIfNotExists(path.dirname(outputFile), function() {
      fs.writeFile(outputFile, xmlToOutput.end({pretty: true}), function(err) {
        if (err) {
          log.warn('Cannot write JUnit xml\n\t' + err.message);
        } else {
          log.debug('JUnit results written to "%s".', outputFile);
        }

        if (!--pendingFileWritings) {
          fileWritingFinished();
        }
      });
    });

    suites = xml = null;
    allMessages.length = 0;
  };

  // Creates the testsuite element for this suite and its parents
  this.createSuiteElements = function (suiteArr) {
    var suiteName = suiteArr.join('.');

    // console.log(suiteName);
    if (!suites[suiteName]) {

      suiteArr.pop();

      // don't recurse if no items left after popping
      if (!suites[suiteArr.join('.')] && suiteArr.length > 0) {
        this.createSuiteElements(suiteArr);
      }

      var timestamp = (new Date()).toISOString().substr(0, 19);

      suites[suiteName] = xml.ele('testsuite', {
        name: suiteName,
        timestamp: timestamp,
        id: 0,
      });
    }
  };

  this.specSuccess = this.specSkipped = this.specFailure = function(browser, result) {
    // be sure to pass a copy, not the original, since this will alter the array we give it
    this.createSuiteElements(result.suite.slice());

    var suiteName = result.suite.join('.');

    if (suiteName !== '') {
      var spec = suites[suiteName].ele('testcase', {
        classname: (pkgName ? pkgName + ' ' : '') + result.suite.join('.'),
        name: result.description,
        time: ((result.time || 0) / 1000)
      });

      if (result.skipped) {
        spec.ele('skipped');
      }

      if (!result.success) {
        result.log.forEach(function(err) {
          spec.ele('failure', {type: ''}, formatError(err));
        });
      }
    }
  };

  // wait for writing all the xml files, before exiting
  this.onExit = function(done) {
    if (pendingFileWritings) {
      fileWritingFinished = done;
    } else {
      done();
    }
  };
};

JUnitReporter.$inject = ['baseReporterDecorator', 'config', 'logger', 'helper', 'formatError'];

// PUBLISH DI MODULE
module.exports = {
  'reporter:junitp': ['type', JUnitReporter]
};
