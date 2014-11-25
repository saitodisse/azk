import { _ } from 'azk';
import { BaseRule } from 'azk/generator/rules';
var semver = require('semver');

var getVersion = function(content) {

  // http://regex101.com/r/mK4iV8/1
  // { 'require': 'php 5.59.9' }
  var versionRegex = /^\s*['"]require['"]:\s*['"]php.*(\d+\.\d+\.\d+)['"]/gm;
  var capture = versionRegex.exec(content);
  var extractedVersion = capture && capture.length >= 1 && capture[1];

  if (!extractedVersion) {
    // http://regex101.com/r/nQ4sN1/3
    // "require":{
    //   "php" : ">=5.3.0 <5.6.0"
    // },
    versionRegex = /['"]php['"]\s*:.+?.*?(\d+\.[\dx]+(?:\.[\dx]+)?)/gm;
    capture = versionRegex.exec(content);
    extractedVersion = capture && capture.length >= 1 && capture[1];
  }

  if (extractedVersion) {
    return semver.clean(extractedVersion);
  }
  else{
    return null;
  }

};

export class Rule extends BaseRule {
  constructor(ui) {
    super(ui);
    this.type = 'runtime';
  }

  relevantsFiles() {
    return ['composer.json'];
  }

  getEvidence(path, content) {
    var evidence = {
      fullpath: path,
      ruleType: 'runtime',
      name    : 'phpcomposer',
      ruleName: 'php56',
      replaces: ['php', 'node']
    };

    var phpVersion = getVersion(content);
    evidence.version = phpVersion;

    // cant find php version, will use default php v5.5.9
    if(!phpVersion){
      return evidence;
    }

    // Suggest a docker image
    // https://registry.hub.docker.com/u/library/node/
    var versionRules = {
      'php55' : '>=5.5.9 <5.6.3',
      'php56' : '<5.5.9 || >=5.6.3'
    };

    evidence.ruleName = _.findKey(versionRules, (value) => {
      return semver.satisfies(phpVersion, value);
    });

    return evidence;
  }

}
