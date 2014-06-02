import { Q, config, async, path } from 'azk';
import h from 'spec/spec_helper';
import { Image  } from 'azk/images';
import { System } from 'azk/manifest/system';
import { Manifest } from 'azk/manifest';
import { Balancer } from 'azk/agent/balancer';
import { SystemDependError } from 'azk/utils/errors';
import docker from 'azk/docker';

var touch = require('touch');
var default_img = config('docker:image_default');

describe.only("Azk system class", function() {
  it("should return a System class", function() {
    var sys = new System({ ns: 'azk-test' }, 'sysname', default_img);
    h.expect(sys).to.have.property('manifest').and.eql({ ns: 'azk-test' });
    h.expect(sys).to.have.property('name', 'sysname');
    h.expect(sys).to.have.property('image').to.eql(new Image(default_img));
  });

  describe("with loaded system", function() {
    var manifest, system, db_system;

    before(() => {
      var data = { };
      return h.mockManifest(data).then((dir) => {
        manifest  = new Manifest(dir);
        system    = manifest.systems.example;
        db_system = manifest.systems.db;

        // Add extras
        system.options.sync_files[__dirname] = "/spec";
      });
    });

    describe("call exec", function() {
      var stdin, outputs = { };
      var mocks = h.mockOutputs(beforeEach, outputs, function() {
        stdin  = h.makeMemoryStream();
        stdin.setRawMode = function() { };
      });

      it("should demux outputs", function() {
        var result = system.exec(
          ["/bin/bash", "-c", "echo 'error' >&2; echo 'out';" ],
          { stdout: mocks.stdout, stderr: mocks.stderr }
        );

        return result.then((container) => {
          h.expect(outputs.stdout).to.equal("out\n");
          h.expect(outputs.stderr).to.equal("error\n");
        });
      })

      it("should support a interactive option", function() {
        var result = system.exec(
          ["/bin/sh"],
          { interactive: true, tty: true, stdin: stdin, stdout: mocks.stdout }
        );

        result = result.progress((event) => {
          if (event.type == "started") {
            stdin.write("uname; exit\n");
          }
        });

        return result.then((exitcode) => {
          h.expect(outputs.stdout).to.match(/Linux/);
          h.expect(exitcode).to.equal(0);
        });
      });

      it("should run a command in a fake system", function() {
        return async(function* () {
          var dir = yield h.tmp_dir({ prefix: "azk-test-" });
          var manifest = Manifest.makeFake(dir, default_img);
          var system   = manifest.systemDefault;

          yield Q.nfcall(touch, path.join(dir, "anyfile"));

          var result = system.exec(
            ["/bin/bash", "-c", "ls -l" ],
            { stdout: mocks.stdout }
          );

          return result.then((container) => {
            h.expect(outputs.stdout).to.match(/anyfile/);
          });
        });
      });
    });

    it("should not run system if its dependencies are not met", function() {
      return h.expect(system.scale(1)).to.eventually.rejectedWith(SystemDependError)
    });

    describe("and have one instances", function() {
      var events   = [];
      var progress = (event) => events.push(event);

      before(() => {
        return manifest.systems.db.scale(1).then(() => {
          events = [];
          return system.scale(1)
        });
      });
      after(()  => {
        return Q.all([system.killAll(), db_system.killAll()]);
      });

      it("should return a number of instances", function() {
        return async(function* () {
          h.expect(yield system.instances()).to.length(1);
          h.expect(yield db_system.instances()).to.length(1);
        });
      });

      it("should scale up and down instances", function() {
        var promise = async(function* () {
          yield system.scale(2);
          var instances = yield system.instances();
          h.expect(instances).to.length(2);

          yield system.scale(1);
          instances = yield system.instances();
          h.expect(instances).to.length(1);
        }).progress(progress);

        return promise.then(() => {
          h.expect(events).to.include.something.that.deep.equals({
            type: 'scale', from: 1, to: 2, service: 'example'
          });
          h.expect(events).to.include.something.that.deep.equals({
            type: 'scale', from: 2, to: 1, service: 'example'
          });
          h.expect(events).to.include.something.that.deep.equals({
            type: 'run_service', service: 'example'
          });
          h.expect(events).to.include.something.that.deep.equals({
            type: 'stop_service', service: 'example'
          });
        });
      });

      describe("and get a instance", function() {
        var instance, instances;

        before(() => {
          return async(function* () {
            instances = yield system.instances();
            instance  = yield docker.getContainer(instances[0].Id).inspect();
          });
        })

        it("should bind port", function() {
          h.expect(instances).to.have.deep.property('[0].Ports[0]');
          var port = instances[0].Ports[0];
          h.expect(port).to.have.property('IP', '0.0.0.0');
          h.expect(port).to.have.property('PublicPort');
          h.expect(port).to.have.property('Type', 'tcp');
        });

        it("should set working dir", function() {
          var dir = manifest.manifestDirName;
          h.expect(instance).to.have.deep.property('Config.WorkingDir', '/azk/' + dir);
        });

        it("should mount a sync_files", function() {
          h.expect(instance).to.have.deep.property('Volumes')
            .and.have.property('/azk/' + manifest.manifestDirName)
            .and.match(RegExp(manifest.manifestPath));

          h.expect(instance).to.have.deep.property('Volumes')
            .and.have.property('/spec')
            .and.match(RegExp(__dirname));
        });

        it("should add logs volume and change command", function() {
          var log_path = '/azk/_logs_/' + system.name + '.log';
          var log_dir  = path.join(config('paths:logs'), manifest.namespace);

          h.expect(instance).to.have.deep.property('Volumes')
            .and.have.property('/azk/_logs_')
            .and.match(RegExp(log_dir));

          h.expect(instance).to.have.deep.property('Config.Cmd')
            .and.eql(['/bin/sh', '-c', "( " + system.options.command + " ) >> " + log_path]);
        });

        it("should mount data dir", function() {
          return async(function* () {
            var instances = yield db_system.instances();
            var container = yield docker.getContainer(instances[0].Id).inspect();
            h.expect(container).to.have.deep.property('Volumes')
              .and.have.property('/azk/_data_')
              .and.match(RegExp(manifest.namespace + '/' + db_system.name));
          });
        });

        it("should add and remove from balancer", function() {
          return async(function* () {
            var balancer = system.options.balancer;
            var alias = [...balancer.alias, balancer.hostname ];

            for (var host of alias) {
              var backends = yield Balancer.getBackends(host);
              h.expect(backends).to.have.deep.property('[0]', host);
              h.expect(backends).to.have.deep.property('[1]')
                .and.match(RegExp("http://" + h.escapeRegExp(config('agent:vm:ip'))));
            }
          });
        });

        describe("map envs variables", function() {
          var envs;
          before(() => envs = instance.Config.Env);

          it("shuld from the azk env", function() {
            h.expect(envs).to.include('PORT=3000');
            h.expect(envs).to.include('AZK_NAME=' + instance.Name.slice(1));
          });

          it("shuld from the dependents systems", function() {
            h.expect(envs).to.include('DB_HOST='  + config('agent:vm:ip'));
          });

          it("shuld from the .env file", function() {
            h.expect(envs).to.include('FROM_DOT_ENV=azk is beautiful');
          });
        });
      });
    });
  });
});
