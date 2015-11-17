import { _, log, lazy_require, config, t } from 'azk';
import { async, promiseResolve } from 'azk/utils/promises';
import { SmartProgressBar } from 'azk/cli/smart_progress_bar';
import { ManifestError } from 'azk/utils/errors';
import BugReportUtil from 'azk/configuration/bug_report';
import Configuration from 'azk/configuration';

var lazy = lazy_require({
  AgentClient: ['azk/agent/client', 'Client'],
  Configure: ['azk/agent/configure', 'Configure'],
});

var Helpers = {
  requireAgent(cli) {
    return lazy.AgentClient
      .status()
      .then((status) => {
        if (!status.agent && cli.isInteractive()) {
          var question = {
            type    : 'confirm',
            name    : 'start',
            message : 'commands.agent.start_before',
            default : 'Y'
          };

          return cli.prompt(question)
            .then((answers) => {
              var cmd = "azk agent start";
              return answers.start ? cli.execSh(cmd) : false;
            });
        }
      })
      .then(() => {
        return lazy.AgentClient.require();
      });
  },

  askPermissionToTrack(ui, force = false) {
    return async(this, function* () {
      // check if user already answered
      var trackerPermission = ui.tracker.loadTrackerPermission(); // Boolean

      var should_ask_permission = (force || typeof trackerPermission === 'undefined');
      if (should_ask_permission) {
        if (!ui.isInteractive()) { return false; }

        var question = {
          type    : 'confirm',
          name    : 'track_ask',
          message : 'analytics.question',
          default : 'Y'
        };

        var answers = yield ui.prompt(question);
        ui.tracker.saveTrackerPermission(answers.track_ask);

        if (answers.track_ask) {
          ui.ok('analytics.message_optIn');
          yield ui.tracker.sendEvent("tracker", { event_type: "accepted" });
        } else {
          ui.ok('analytics.message_optOut', {command: 'azk config track-toggle'});
        }

        return answers.track_ask;
      }

      return trackerPermission;
    });
  },

  askToSendError(cli, forceAsk = false) {
    return async(this, function* () {

      // bug report
      let bugReportUtil = new BugReportUtil({});
      let isBugReportActive = bugReportUtil.loadBugReportUtilPermission(); // Boolean or undefined

      // exit: if it is not interactive, just respect saved configuration
      if (!cli.isInteractive()) {
        return isBugReportActive === true;
      }

      // exit: if user does not want to send bug-reports, skip the rest
      if (isBugReportActive === false) {
        return false;
      }

      // tracker
      let isTrackerActive = cli.tracker.loadTrackerPermission(); // Boolean
      let should_ask_permission = (forceAsk || typeof bugReportPermission === 'undefined');

      // exit: send individual error only
      //       only if user does not want to be tracked
      if (should_ask_permission && !isTrackerActive) {
        return yield this.askBugReportSendIndividualError(cli);
      }

      // email
      let configuration = new Configuration({});
      let current_saved_email = configuration.loadEmail();
      let hasSavedEmail = current_saved_email && current_saved_email.length > 0;

      // ask for bug-report send configuration
      if (should_ask_permission) {
        let want_to_save_bug_report = yield this.askBugReportEnableConfig(cli);
        if (want_to_save_bug_report) {
          bugReportUtil.saveBugReportUtilPermission(true);
        }
      }

      // ask for user email
      if (should_ask_permission && !hasSavedEmail) {
        let prompt_result = yield this.askEmail(cli);
        let inputed_email = prompt_result.result;
        if (inputed_email && inputed_email.length > 0) {
          let want_to_save_email = yield this.askSaveEmail(cli);
          if (want_to_save_email) {
            configuration.saveEmail(inputed_email);
          }
        }
      }

      return true;
    });
  },

  askBugReportSendIndividualError(cli) {
    var question = {
      type    : 'confirm',
      name    : 'result',
      message : 'bugReport.question_send_idividual_error',
      default : 'Y'
    };

    return cli.prompt(question)
    .then((response) => {
      if (response.result) {
        cli.ok('bugReport.error_sent');
      } else {
        cli.ok('bugReport.error_not_sent');
      }
      return promiseResolve(response.result);
    });
  },

  askBugReportEnableConfig(cli) {
    var question = {
      type    : 'confirm',
      name    : 'result',
      message : 'bugReport.question_enable_bug_report_send',
      default : 'Y'
    };

    return cli.prompt(question)
    .then((response) => {
      if (response.result) {
        cli.ok('bugReport.bug_report_autosend_config_yes');
      } else {
        cli.ok('bugReport.bug_report_autosend_config_no');
      }
      return promiseResolve(response.result);
    });
  },

  askEmail(cli) {
    var question = {
      type    : 'input',
      name    : 'result',
      message : 'bugReport.question_mail',
      default : ''
    };

    return cli.prompt(question);
  },

  askSaveEmail(cli, current_email = '') {
    var question = {
      type    : 'input',
      name    : 'result',
      message : 'bugReport.question_mail_can_save',
      default : current_email
    };

    return cli.prompt(question)
    .then((response) => {
      if (response.result) {
        cli.ok('bugReport.email_saved');
      } else {
        cli.ok('bugReport.email_not_saved');
      }
      return promiseResolve(0);
    });
  },

  configure(cli) {
    cli.ok('configure.loading_checking');
    return (new lazy.Configure(cli))
      .run()
      .then((configs) => {
        cli.ok('configure.loaded');
        return configs;
      });
  },

  manifestValidate(cmd, manifest) {
    var validation_errors = manifest.validate();
    if (validation_errors.length === 0) { return; }

    // has deprecate errors?
    if (config('flags:show_deprecate')) {
      var deprecate_val_errors = _.filter(validation_errors, function (item) {
        return item.level === 'deprecate';
      });
      _.each(deprecate_val_errors, (deprecate_val_error) => {
        cmd.deprecate(`manifest.validate.${deprecate_val_error.key}`, deprecate_val_error);
      });
    }

    // has fails level errors?
    var val_errors = _.filter(validation_errors, function (item) {
      return item.level === 'fail';
    });

    if (config('flags:show_deprecate')) {
      _.each(val_errors, (val_error) => {
        var msg = t(`manifest.validate.${val_error.key}`, val_error);
        throw new ManifestError(this.file, msg);
      });
    }
  },

  vmStartProgress(cmd) {
    return (event) => {
      if (!event) {
        return;
      }

      var tKey    = null;
      var context = event.context || "agent";
      var keys    = ["status", context];

      switch (event.type) {
        case "status":
          // running, starting, not_running, already_installed
          switch (event.status) {
            case "not_running":
            case "already_installed":
            case "down":
              cmd.fail([...keys].concat(event.status), event.data);
              break;
            case "error":
              if (event.data instanceof Error) {
                cmd.fail(event.data.toString());
              } else {
                cmd.fail([...keys].concat(event.status), event);
              }
              break;
            default:
              if (event.keys) {
                cmd[event.status || "ok"](event.keys, event.data);
              } else {
                cmd.ok([...keys].concat(event.status), event.data);
              }
          }
          break;
        case "wait_port":
          tKey = ["status", event.system, "wait"];
          log.info_t(tKey, event);
          cmd.ok(tKey, event);
          break;
        case "try_connect":
          if (context === "balancer") {
            tKey = [...keys].concat("progress");
            log.info_t(tKey, event);
            cmd.ok(tKey, event);
          }
          break;
        case "ssh":
          if (context === "stderr") {
            break;
          } else {
            log.debug({ log_label: "[vm_progress] [ssh]", data: event});
          }
          break;
        default:
          log.debug({ log_label: "[vm_progress]", data: event});
      }
    };
  },

  newPullProgressBar(cmd) {
    return (msg) => {
      if (msg.type !== "pull_msg") {
        return msg;
      }

      // pull end
      if (msg.end) {
        cmd.ok('commands.helpers.pull.pull_ended', msg);
        return false;
      }

      // manual message, not parsed
      if (msg.traslation) {
        cmd.ok(msg.traslation, msg.data);
        return false;
      }

      if (!_.isNumber(this.non_existent_locally_ids_count)) {
        this.non_existent_locally_ids_count = msg.registry_result.non_existent_locally_ids_count;
      }

      // parse messages by type
      var status = msg.statusParsed;
      switch (status.type) {
        case 'download_complete':
          this.smartProgressBar && this.smartProgressBar.receiveMessage(msg, status.type);
          break;

        case 'download':
          if (_.isUndefined(this.bar)) {
            // show message: ⇲ pulling 5/14 layers.
            cmd.ok('commands.helpers.pull.pull_start', {
              left_to_download_count : msg.registry_result.non_existent_locally_ids_count,
              total_registry_layers  : msg.registry_result.registry_layers_ids_count,
            });

            // create a new progress-bar
            this.bar = cmd.createProgressBar('     [:bar] :percent :layers_left/:layers_total ', {
              complete: '=',
              incomplete: ' ',
              width: 50,
              total: 50
            });

            // control progress-bar with SmartProgressBar
            this.smartProgressBar = new SmartProgressBar(
              50,
              this.non_existent_locally_ids_count,
              this.bar);
          }
          this.smartProgressBar.receiveMessage(msg, status.type);
          break;

        case 'pulling_another':
          cmd.ok('commands.helpers.pull.already_being', msg);
          break;
      }
      return false;
    };
  },

  escapeCapture(callback) {
    // Escape sequence
    var escapeBuffer = false;
    var escape = false;

    return (event) => {
      if (event.type == "stdin_pipe") {
        var stdin  = event.data[0].stdin;
        var stream = event.data[0].stream;
        var container = event.id;
        var stopped = false;

        stdin.on('data', function (key) {
          if (stopped) {
            return false;
          }

          var ch = key.toString(stdin.encoding || 'utf-8');

          if (escapeBuffer && ch === '~') {
            escapeBuffer = false;
            escape = true;
          } else if (ch === '\r') {
            escapeBuffer = true;
            stream.write(key);
          } else {
            if (escape) {
              stopped = callback(ch, container, () => stopped = false);
              escape = false;
            } else {
              stream.write(key);
            }
            escapeBuffer = false;
          }
        });
      }
      return true;
    };
  }
};

export { Helpers };
